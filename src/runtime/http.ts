import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { URL } from "node:url";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "../config.js";
import { createServer } from "../server.js";
import { logError } from "../utils/logging.js";

type RemoteTransport = StreamableHTTPServerTransport | SSEServerTransport | WebSocketServerTransport;

interface RuntimeTransportEntry {
  transport: RemoteTransport;
}

class WebSocketServerTransport implements Transport {
  sessionId?: string;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private readonly socket: Socket, sessionId = randomUUID()) {
    this.sessionId = sessionId;
  }

  async start(): Promise<void> {
    this.socket.on("data", (chunk) => {
      try {
        for (const payload of decodeWebSocketFrames(chunk)) {
          this.onmessage?.(JSON.parse(payload) as JSONRPCMessage);
        }
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error("WebSocket decode failed."));
      }
    });
    this.socket.on("close", () => this.onclose?.());
    this.socket.on("error", (error) => this.onerror?.(error));
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.socket.write(encodeWebSocketFrame(JSON.stringify(message)));
  }

  async close(): Promise<void> {
    if (!this.socket.destroyed) {
      this.socket.end();
    }
    this.onclose?.();
  }
}

function createWebSocketAccept(key: string): string {
  return createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
}

function encodeWebSocketFrame(payload: string): Buffer {
  const data = Buffer.from(payload, "utf8");
  if (data.length < 126) {
    return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  }
  return Buffer.concat([Buffer.from([0x81, 126, (data.length >> 8) & 0xff, data.length & 0xff]), data]);
}

function decodeWebSocketFrames(chunk: Buffer): string[] {
  const messages: string[] = [];
  let offset = 0;
  while (offset + 2 <= chunk.length) {
    const first = chunk[offset]!;
    offset += 1;
    const second = chunk[offset]!;
    offset += 1;
    const opcode = first & 0x0f;
    if (opcode === 0x8) break;
    let payloadLength = second & 0x7f;
    if (payloadLength === 126) {
      payloadLength = chunk.readUInt16BE(offset);
      offset += 2;
    }
    const masked = (second & 0x80) !== 0;
    const mask = masked ? chunk.subarray(offset, offset + 4) : undefined;
    if (masked) offset += 4;
    const payload = chunk.subarray(offset, offset + payloadLength);
    offset += payloadLength;
    const decoded = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      decoded[i] = mask ? payload[i]! ^ mask[i % 4]! : payload[i]!;
    }
    messages.push(decoded.toString("utf8"));
  }
  return messages;
}

function json(res: ServerResponse, statusCode: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { "content-type": "application/json", "content-length": Buffer.byteLength(payload).toString(), ...headers });
  res.end(payload);
}

function text(res: ServerResponse, statusCode: number, body: string, headers: Record<string, string> = {}): void {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(body).toString(), ...headers });
  res.end(body);
}

function normalizePath(input: string): string {
  return input.startsWith("/") ? input : `/${input}`;
}

function getRemoteBaseUrl(config: Config): URL {
  if (config.remoteBaseUrl) {
    return new URL(config.remoteBaseUrl);
  }
  return new URL(`http://${config.httpHost}:${config.httpPort}`);
}

function validateHostHeader(config: Config, req: IncomingMessage): boolean {
  if (!config.httpAllowedHosts.length) return true;
  const host = (req.headers.host ?? "").toLowerCase();
  return config.httpAllowedHosts.map((item) => item.toLowerCase()).includes(host);
}

function buildAuthInfo(config: Config, token: string): AuthInfo {
  return {
    token,
    clientId: "llm-bridge-remote-client",
    scopes: [...config.remoteAuthScopes],
    ...(config.remoteBaseUrl ? { resource: new URL(config.remoteBaseUrl) } : {}),
    extra: { authMode: config.remoteAuthMode },
  };
}

function verifyBearerToken(config: Config, header: string | undefined): AuthInfo | null {
  if (config.remoteAuthMode === "none") return null;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token || !config.remoteAuthToken) return null;
  const expected = Buffer.from(config.remoteAuthToken, "utf8");
  const actual = Buffer.from(token, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return buildAuthInfo(config, token);
}

function unauthorizedHeaders(config: Config): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.remoteAuthMode !== "none") {
    const parts = ['Bearer realm="llm-bridge-mcp-server"'];
    if (config.remoteAuthScopes.length) {
      parts.push(`scope="${config.remoteAuthScopes.join(" ")}"`);
    }
    const metadataUrl = new URL(`/.well-known/oauth-protected-resource${normalizePath(config.httpMcpPath)}`, getRemoteBaseUrl(config)).toString();
    parts.push(`resource_metadata="${metadataUrl}"`);
    headers["www-authenticate"] = parts.join(", ");
  }
  return headers;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "DELETE") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) return undefined;
  return JSON.parse(body);
}

function isInitializeRequest(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      "method" in (body as Record<string, unknown>) &&
      (body as Record<string, unknown>).method === "initialize",
  );
}

function createProtectedResourceMetadata(config: Config): Record<string, unknown> {
  const resource = new URL(normalizePath(config.httpMcpPath), getRemoteBaseUrl(config)).toString();
  return {
    resource,
    authorization_servers: config.oauthIssuerUrl ? [config.oauthIssuerUrl] : [],
    scopes_supported: config.remoteAuthScopes,
    bearer_methods_supported: ["header"],
    resource_documentation: config.oauthServiceDocumentationUrl ?? resource,
  };
}

function createAuthorizationServerMetadata(config: Config): Record<string, unknown> | null {
  if (!config.oauthIssuerUrl || !config.oauthAuthorizationUrl || !config.oauthTokenUrl) return null;
  return {
    issuer: config.oauthIssuerUrl,
    authorization_endpoint: config.oauthAuthorizationUrl,
    token_endpoint: config.oauthTokenUrl,
    ...(config.oauthRegistrationUrl ? { registration_endpoint: config.oauthRegistrationUrl } : {}),
    ...(config.oauthRevocationUrl ? { revocation_endpoint: config.oauthRevocationUrl } : {}),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: config.remoteAuthScopes,
    ...(config.oauthServiceDocumentationUrl ? { service_documentation: config.oauthServiceDocumentationUrl } : {}),
  };
}

export async function startRemoteHttpServer(config: Config): Promise<{ server: Server; close: () => Promise<void> }> {
  const mcpPath = normalizePath(config.httpMcpPath ?? "/mcp");
  const ssePath = normalizePath(config.httpSsePath ?? "/sse");
  const messagesPath = normalizePath(config.httpMessagesPath ?? "/messages");
  const wsPath = normalizePath(config.httpWsPath ?? "/ws");
  const transports = new Map<string, RuntimeTransportEntry>();
  const servers = new Map<string, Awaited<ReturnType<typeof createServer>>>();
  const remoteBaseUrl = getRemoteBaseUrl(config);

  function attachTransport(sessionId: string, transport: RemoteTransport, serverInstance: Awaited<ReturnType<typeof createServer>>) {
    transports.set(sessionId, { transport });
    servers.set(sessionId, serverInstance);
  }

  async function closeAll(): Promise<void> {
    for (const [sessionId, entry] of transports.entries()) {
      try {
        await entry.transport.close();
      } catch (error) {
        logError(`Error closing transport for session ${sessionId}`, error);
      }
      transports.delete(sessionId);
    }
    for (const [sessionId, serverInstance] of servers.entries()) {
      try {
        await serverInstance.close();
      } catch (error) {
        logError(`Error closing server for session ${sessionId}`, error);
      }
      servers.delete(sessionId);
    }
  }

  const httpServer = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", remoteBaseUrl);

      if (!validateHostHeader(config, req)) {
        text(res, 403, "Forbidden host header.");
        return;
      }

      if (url.pathname === "/healthz") {
        json(res, 200, {
          server: "llm-bridge-mcp-server",
          status: "ok",
          transportMode: config.transportMode,
          remoteAuthMode: config.remoteAuthMode,
          mcpPath,
          ssePath,
          messagesPath,
          wsPath,
        });
        return;
      }

      if (url.pathname === `/.well-known/oauth-protected-resource${mcpPath}`) {
        json(res, 200, createProtectedResourceMetadata(config));
        return;
      }

      if (url.pathname === "/.well-known/oauth-authorization-server") {
        const metadata = createAuthorizationServerMetadata(config);
        if (!metadata) {
          json(res, 404, { error: "OAuth authorization metadata is not configured." });
          return;
        }
        json(res, 200, metadata);
        return;
      }

      const authInfo =
        config.remoteAuthMode === "none"
          ? undefined
          : verifyBearerToken(config, Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization);

      if (config.remoteAuthMode !== "none" && !authInfo) {
        json(
          res,
          401,
          { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
          unauthorizedHeaders(config),
        );
        return;
      }

      if (authInfo) {
        (req as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
      }

      if (url.pathname === mcpPath) {
        const parsedBody = await readJsonBody(req);
        const sessionId = (req.headers["mcp-session-id"] as string | undefined) ?? undefined;
        let transport = sessionId ? transports.get(sessionId)?.transport : undefined;

        if (!transport && req.method === "POST" && isInitializeRequest(parsedBody)) {
          const serverInstance = createServer(config);
          let nextTransport!: StreamableHTTPServerTransport;
          nextTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (initializedSessionId: string): void => attachTransport(initializedSessionId, nextTransport, serverInstance),
          });
          nextTransport.onclose = () => {
            const sid = nextTransport.sessionId;
            if (sid) {
              transports.delete(sid);
              void servers.get(sid)?.close().catch((error) => logError(`Session shutdown error for ${sid}`, error));
              servers.delete(sid);
            }
          };
          await serverInstance.connect(nextTransport as never);
          transport = nextTransport;
        }

        if (!transport) {
          json(res, 400, { jsonrpc: "2.0", error: { code: -32000, message: "No valid MCP session was found." }, id: null });
          return;
        }

        if (!(transport instanceof StreamableHTTPServerTransport)) {
          json(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Session exists but uses a different transport protocol." },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req as IncomingMessage & { auth?: AuthInfo }, res, parsedBody);
        return;
      }

      if (url.pathname === ssePath && req.method === "GET") {
        const serverInstance = createServer(config);
        const transport = new SSEServerTransport(messagesPath, res);
        attachTransport(transport.sessionId, transport, serverInstance);
        res.on("close", () => {
          transports.delete(transport.sessionId);
          void serverInstance.close().catch((error) => logError(`Session shutdown error for ${transport.sessionId}`, error));
          servers.delete(transport.sessionId);
        });
        await serverInstance.connect(transport);
        return;
      }

      if (url.pathname === messagesPath && req.method === "POST") {
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const entry = transports.get(sessionId);
        if (!entry || !(entry.transport instanceof SSEServerTransport)) {
          text(res, 400, "No deprecated SSE transport found for the given sessionId.");
          return;
        }
        const parsedBody = await readJsonBody(req);
        await entry.transport.handlePostMessage(req as IncomingMessage & { auth?: AuthInfo }, res, parsedBody);
        return;
      }

      text(res, 404, "Not found.");
    } catch (error) {
      logError("Remote HTTP server request failed", error);
      if (!res.headersSent) {
        json(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      } else {
        res.end();
      }
    }
  });

  httpServer.on("upgrade", async (req, socket) => {
    try {
      const url = new URL(req.url ?? "/", remoteBaseUrl);
      if (url.pathname !== wsPath || !validateHostHeader(config, req)) {
        socket.destroy();
        return;
      }
      const authInfo =
        config.remoteAuthMode === "none"
          ? undefined
          : verifyBearerToken(config, Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization);
      if (config.remoteAuthMode !== "none" && !authInfo) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      const key = req.headers["sec-websocket-key"];
      if (typeof key !== "string") {
        socket.destroy();
        return;
      }
      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${createWebSocketAccept(key)}`,
          "",
          "",
        ].join("\r\n"),
      );
      const serverInstance = createServer(config);
      const transport = new WebSocketServerTransport(socket as Socket);
      attachTransport(transport.sessionId!, transport, serverInstance);
      transport.onclose = () => {
        const sid = transport.sessionId!;
        transports.delete(sid);
        void servers.get(sid)?.close().catch((error) => logError(`Session shutdown error for ${sid}`, error));
        servers.delete(sid);
      };
      await serverInstance.connect(transport as never);
      await transport.start();
      void authInfo;
    } catch (error) {
      logError("WebSocket upgrade failed", error);
      socket.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.httpPort, config.httpHost, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  return {
    server: httpServer,
    close: async () => {
      await closeAll();
      await new Promise<void>((resolve, reject) => httpServer.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "../src/config.js";
import { startRemoteHttpServer } from "../src/runtime/http.js";

let root = "";
let closeRuntime: (() => Promise<void>) | undefined;

function makeConfig(dataDir: string): Config {
  return {
    apiKey: "test",
    provider: "zai",
    baseUrl: "https://api.z.ai/api/paas/v4/chat/completions",
    textModel: "glm-5-turbo",
    visionModel: "glm-5v-turbo",
    timeoutMs: 1000,
    maxOutputTokens: 1000,
    dataDir,
    ephemeralDataDir: false,
    privacyMode: "standard",
    logLevel: "info",
    cacheEnabled: true,
    cacheTtlSeconds: 60,
    cacheMaxEntries: 10,
    maxContextChars: 1000,
    maxFileChars: 1000,
    maxDirectoryEntries: 100,
    maxToolOutputChars: 1000,
    maxConcurrentRequests: 1,
    maxConcurrentAgentLoops: 1,
    maxRetries: 0,
    retryBaseDelayMs: 1,
    rateLimitEnabled: true,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 120,
    providerRateLimitPerMinute: 0,
    networkEnabled: false,
    networkTimeoutMs: 1000,
    networkMaxResponseChars: 1000,
    allowedDomains: [],
    approvalRequiredForWrites: true,
    approvalTtlSeconds: 900,
    transportMode: "http",
    httpHost: "127.0.0.1",
    httpPort: 4567,
    httpMcpPath: "/mcp",
    httpSsePath: "/sse",
    httpMessagesPath: "/messages",
    httpAllowedHosts: [],
    remoteBaseUrl: "http://127.0.0.1:4567",
    remoteAuthMode: "oauth_metadata",
    remoteAuthToken: "secret-token",
    remoteAuthScopes: ["mcp:read", "mcp:write"],
    oauthIssuerUrl: "https://auth.example.com",
    oauthAuthorizationUrl: "https://auth.example.com/authorize",
    oauthTokenUrl: "https://auth.example.com/token",
    oauthRegistrationUrl: "https://auth.example.com/register",
    oauthRevocationUrl: "https://auth.example.com/revoke",
    oauthServiceDocumentationUrl: "https://docs.example.com/mcp-auth",
  };
}

afterEach(async () => {
  if (closeRuntime) {
    await closeRuntime();
    closeRuntime = undefined;
  }
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = "";
  }
});

describe("remote http runtime", () => {
  it("serves health and oauth metadata and protects mcp requests", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-remote-http-"));
    const runtime = await startRemoteHttpServer(makeConfig(root));
    closeRuntime = runtime.close;

    const health = await fetch("http://127.0.0.1:4567/healthz");
    expect(health.status).toBe(200);
    const healthJson = (await health.json()) as { transportMode: string; remoteAuthMode: string };
    expect(healthJson.transportMode).toBe("http");
    expect(healthJson.remoteAuthMode).toBe("oauth_metadata");

    const protectedResource = await fetch("http://127.0.0.1:4567/.well-known/oauth-protected-resource/mcp");
    expect(protectedResource.status).toBe(200);
    const protectedJson = (await protectedResource.json()) as { authorization_servers: string[] };
    expect(protectedJson.authorization_servers).toEqual(["https://auth.example.com"]);

    const authMetadata = await fetch("http://127.0.0.1:4567/.well-known/oauth-authorization-server");
    expect(authMetadata.status).toBe(200);
    const authJson = (await authMetadata.json()) as { authorization_endpoint: string; token_endpoint: string };
    expect(authJson.authorization_endpoint).toBe("https://auth.example.com/authorize");
    expect(authJson.token_endpoint).toBe("https://auth.example.com/token");

    const unauthorized = await fetch("http://127.0.0.1:4567/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } } }),
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("resource_metadata=");
  });

  it("rate limits remote MCP requests", async () => {
    root = await mkdtemp(path.join(tmpdir(), "glm-remote-http-"));
    const config = { ...makeConfig(root), rateLimitMaxRequests: 1 };
    const runtime = await startRemoteHttpServer(config);
    closeRuntime = runtime.close;

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } },
    });
    const first = await fetch("http://127.0.0.1:4567/mcp", { method: "POST", headers: { "content-type": "application/json" }, body });
    const second = await fetch("http://127.0.0.1:4567/mcp", { method: "POST", headers: { "content-type": "application/json" }, body });

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBeTruthy();
  });
});

import { ConfigurationError } from "./api/errors.js";
import type { PrivacyMode } from "./policies/store.js";
import { resolveRuntimeDataDir } from "./privacy/runtime.js";

export type Provider = "zai" | "openrouter";
export type LogLevel = "error" | "warn" | "info" | "debug";
export type TransportMode = "stdio" | "http" | "websocket";
export type RemoteAuthMode = "none" | "bearer" | "oauth_metadata";

export interface Config {
  apiKey: string;
  provider: Provider;
  baseUrl: string;
  textModel: string;
  visionModel: string;
  timeoutMs: number;
  maxOutputTokens: number;
  dataDir: string;
  ephemeralDataDir: boolean;
  privacyMode: PrivacyMode;
  logLevel: LogLevel;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  cacheMaxEntries: number;
  maxContextChars: number;
  maxFileChars: number;
  maxDirectoryEntries: number;
  maxToolOutputChars: number;
  maxConcurrentRequests: number;
  maxConcurrentAgentLoops: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  networkEnabled: boolean;
  networkTimeoutMs: number;
  networkMaxResponseChars: number;
  allowedDomains: string[];
  approvalRequiredForWrites: boolean;
  approvalTtlSeconds: number;
  transportMode: TransportMode;
  httpHost: string;
  httpPort: number;
  httpMcpPath: string;
  httpSsePath: string;
  httpMessagesPath: string;
  httpWsPath: string;
  httpAllowedHosts: string[];
  remoteBaseUrl?: string;
  remoteAuthMode: RemoteAuthMode;
  remoteAuthToken?: string;
  remoteAuthScopes: string[];
  oauthIssuerUrl?: string;
  oauthAuthorizationUrl?: string;
  oauthTokenUrl?: string;
  oauthRegistrationUrl?: string;
  oauthRevocationUrl?: string;
  oauthServiceDocumentationUrl?: string;
  appName?: string;
  appUrl?: string;
}

function intEnvFrom(env: NodeJS.ProcessEnv, name: string, fallback: number, allowZero = false): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new ConfigurationError(`${name} must be a ${allowZero ? "non-negative" : "positive"} integer.`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || (allowZero ? n < 0 : n < 1)) {
    throw new ConfigurationError(`${name} must be a ${allowZero ? "non-negative" : "positive"} integer.`);
  }
  return n;
}

function boolEnv(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ConfigurationError(`${name} must be true or false.`);
}

function urlEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).toString();
  } catch {
    throw new ConfigurationError(`${name} must be an absolute URL.`);
  }
}

function listEnv(env: NodeJS.ProcessEnv, name: string): string[] {
  return env[name]?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.ZAI_API_KEY?.trim();
  if (!apiKey) throw new ConfigurationError("ZAI_API_KEY is required. Set it in the MCP server environment.");

  const provider = (env.ZAI_PROVIDER ?? "zai").toLowerCase();
  if (provider !== "zai" && provider !== "openrouter") {
    throw new ConfigurationError("ZAI_PROVIDER must be 'zai' or 'openrouter'.");
  }

  const baseUrl =
    env.ZAI_API_BASE_URL?.trim() ||
    (provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.z.ai/api/paas/v4/chat/completions");
  try {
    new URL(baseUrl);
  } catch {
    throw new ConfigurationError("ZAI_API_BASE_URL must be an absolute URL.");
  }

  const logLevel = env.GLM_BRIDGE_LOG_LEVEL ?? "info";
  if (!(["error", "warn", "info", "debug"] as string[]).includes(logLevel)) {
    throw new ConfigurationError("GLM_BRIDGE_LOG_LEVEL must be error, warn, info, or debug.");
  }

  const privacyModeRaw = env.GLM_BRIDGE_PRIVACY_MODE ?? "standard";
  if (!(["standard", "minimal_retention", "no_persistence"] as string[]).includes(privacyModeRaw)) {
    throw new ConfigurationError("GLM_BRIDGE_PRIVACY_MODE must be standard, minimal_retention, or no_persistence.");
  }

  const runtimeDir = resolveRuntimeDataDir(
    env.GLM_BRIDGE_DATA_DIR?.trim() || `${env.HOME ?? env.USERPROFILE ?? "."}/.glm-5-bridge`,
    privacyModeRaw as PrivacyMode,
  );

  const transportMode = (env.GLM_BRIDGE_TRANSPORT_MODE ?? "stdio").toLowerCase();
  if (transportMode !== "stdio" && transportMode !== "http" && transportMode !== "websocket") {
    throw new ConfigurationError("GLM_BRIDGE_TRANSPORT_MODE must be stdio, http, or websocket.");
  }

  const remoteAuthMode = (env.GLM_BRIDGE_REMOTE_AUTH_MODE ?? "none").toLowerCase();
  if (!(["none", "bearer", "oauth_metadata"] as string[]).includes(remoteAuthMode)) {
    throw new ConfigurationError("GLM_BRIDGE_REMOTE_AUTH_MODE must be none, bearer, or oauth_metadata.");
  }

  const remoteAuthToken = env.GLM_BRIDGE_REMOTE_AUTH_TOKEN?.trim() || undefined;
  if (remoteAuthMode !== "none" && !remoteAuthToken) {
    throw new ConfigurationError("GLM_BRIDGE_REMOTE_AUTH_TOKEN is required when remote auth is enabled.");
  }

  const httpMcpPath = env.GLM_BRIDGE_HTTP_MCP_PATH?.trim() || "/mcp";
  const httpSsePath = env.GLM_BRIDGE_HTTP_SSE_PATH?.trim() || "/sse";
  const httpMessagesPath = env.GLM_BRIDGE_HTTP_MESSAGES_PATH?.trim() || "/messages";
  const httpWsPath = env.GLM_BRIDGE_HTTP_WS_PATH?.trim() || "/ws";

  const remoteBaseUrl = urlEnv(env, "GLM_BRIDGE_REMOTE_BASE_URL");
  const oauthIssuerUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_ISSUER_URL");
  const oauthAuthorizationUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_AUTHORIZATION_URL");
  const oauthTokenUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_TOKEN_URL");
  const oauthRegistrationUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_REGISTRATION_URL");
  const oauthRevocationUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_REVOCATION_URL");
  const oauthServiceDocumentationUrl = urlEnv(env, "GLM_BRIDGE_OAUTH_SERVICE_DOCUMENTATION_URL");

  return {
    apiKey,
    provider,
    baseUrl,
    textModel: env.ZAI_TEXT_MODEL?.trim() || "glm-5-turbo",
    visionModel: env.ZAI_VISION_MODEL?.trim() || "glm-5v-turbo",
    timeoutMs: intEnvFrom(env, "ZAI_REQUEST_TIMEOUT_MS", 120000),
    maxOutputTokens: intEnvFrom(env, "ZAI_MAX_OUTPUT_TOKENS", 8192),
    dataDir: runtimeDir.dataDir,
    ephemeralDataDir: runtimeDir.ephemeral,
    privacyMode: privacyModeRaw as PrivacyMode,
    logLevel: logLevel as LogLevel,
    cacheEnabled: boolEnv(env, "GLM_BRIDGE_CACHE_ENABLED", true),
    cacheTtlSeconds: intEnvFrom(env, "GLM_BRIDGE_CACHE_TTL_SECONDS", 3600),
    cacheMaxEntries: intEnvFrom(env, "GLM_BRIDGE_CACHE_MAX_ENTRIES", 250),
    maxContextChars: intEnvFrom(env, "GLM_BRIDGE_MAX_CONTEXT_CHARS", 200000),
    maxFileChars: intEnvFrom(env, "GLM_BRIDGE_MAX_FILE_CHARS", 100000),
    maxDirectoryEntries: intEnvFrom(env, "GLM_BRIDGE_MAX_DIRECTORY_ENTRIES", 1000),
    maxToolOutputChars: intEnvFrom(env, "GLM_BRIDGE_MAX_TOOL_OUTPUT_CHARS", 100000),
    maxConcurrentRequests: intEnvFrom(env, "GLM_BRIDGE_MAX_CONCURRENT_REQUESTS", 3),
    maxConcurrentAgentLoops: intEnvFrom(env, "GLM_BRIDGE_MAX_CONCURRENT_AGENT_LOOPS", 1),
    maxRetries: intEnvFrom(env, "ZAI_MAX_RETRIES", 2, true),
    retryBaseDelayMs: intEnvFrom(env, "ZAI_RETRY_BASE_DELAY_MS", 500),
    networkEnabled: boolEnv(env, "GLM_BRIDGE_NETWORK_ENABLED", false),
    networkTimeoutMs: intEnvFrom(env, "GLM_BRIDGE_NETWORK_TIMEOUT_MS", 15000),
    networkMaxResponseChars: intEnvFrom(env, "GLM_BRIDGE_NETWORK_MAX_RESPONSE_CHARS", 100000),
    allowedDomains: listEnv(env, "GLM_BRIDGE_ALLOWED_DOMAINS"),
    approvalRequiredForWrites: boolEnv(env, "GLM_BRIDGE_APPROVAL_REQUIRED_FOR_WRITES", true),
    approvalTtlSeconds: intEnvFrom(env, "GLM_BRIDGE_APPROVAL_TTL_SECONDS", 900),
    transportMode: transportMode as TransportMode,
    httpHost: env.GLM_BRIDGE_HTTP_HOST?.trim() || "127.0.0.1",
    httpPort: intEnvFrom(env, "GLM_BRIDGE_HTTP_PORT", 3456),
    httpMcpPath,
    httpSsePath,
    httpMessagesPath,
    httpWsPath,
    httpAllowedHosts: listEnv(env, "GLM_BRIDGE_HTTP_ALLOWED_HOSTS"),
    ...(remoteBaseUrl ? { remoteBaseUrl } : {}),
    remoteAuthMode: remoteAuthMode as RemoteAuthMode,
    ...(remoteAuthToken ? { remoteAuthToken } : {}),
    remoteAuthScopes: listEnv(env, "GLM_BRIDGE_REMOTE_AUTH_SCOPES"),
    ...(oauthIssuerUrl ? { oauthIssuerUrl } : {}),
    ...(oauthAuthorizationUrl ? { oauthAuthorizationUrl } : {}),
    ...(oauthTokenUrl ? { oauthTokenUrl } : {}),
    ...(oauthRegistrationUrl ? { oauthRegistrationUrl } : {}),
    ...(oauthRevocationUrl ? { oauthRevocationUrl } : {}),
    ...(oauthServiceDocumentationUrl ? { oauthServiceDocumentationUrl } : {}),
    ...(env.OPENROUTER_APP_NAME ? { appName: env.OPENROUTER_APP_NAME } : {}),
    ...(env.OPENROUTER_APP_URL ? { appUrl: env.OPENROUTER_APP_URL } : {}),
  };
}

export function sanitizeConfig(config: Config): Record<string, unknown> {
  const { apiKey, remoteAuthToken, ...safe } = config;
  void apiKey;
  void remoteAuthToken;
  return safe;
}

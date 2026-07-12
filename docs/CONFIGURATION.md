# Configuration

## Required

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ZAI_API_KEY` | Yes | none | Provider authentication key. |

## Provider

| Variable | Default |
|---|---|
| `ZAI_PROVIDER` | `zai` |
| `ZAI_API_BASE_URL` | provider-specific default |
| `ZAI_TEXT_MODEL` | `glm-5-turbo` |
| `ZAI_VISION_MODEL` | `glm-5v-turbo` |
| `ZAI_REQUEST_TIMEOUT_MS` | `120000` |
| `ZAI_MAX_OUTPUT_TOKENS` | `8192` |
| `ZAI_MAX_RETRIES` | `2` |
| `ZAI_RETRY_BASE_DELAY_MS` | `500` |

## Bridge

| Variable | Default |
|---|---|
| `GLM_BRIDGE_DATA_DIR` | platform home-based path |
| `GLM_BRIDGE_LOG_LEVEL` | `info` |
| `GLM_BRIDGE_CACHE_ENABLED` | `true` |
| `GLM_BRIDGE_CACHE_TTL_SECONDS` | `3600` |
| `GLM_BRIDGE_CACHE_MAX_ENTRIES` | `250` |
| `GLM_BRIDGE_MAX_CONTEXT_CHARS` | `200000` |
| `GLM_BRIDGE_MAX_FILE_CHARS` | `100000` |
| `GLM_BRIDGE_MAX_DIRECTORY_ENTRIES` | `1000` |
| `GLM_BRIDGE_MAX_TOOL_OUTPUT_CHARS` | `100000` |
| `GLM_BRIDGE_MAX_CONCURRENT_REQUESTS` | `3` |
| `GLM_BRIDGE_MAX_CONCURRENT_AGENT_LOOPS` | `1` |
| `GLM_BRIDGE_NETWORK_ENABLED` | `false` |
| `GLM_BRIDGE_NETWORK_TIMEOUT_MS` | `15000` |
| `GLM_BRIDGE_NETWORK_MAX_RESPONSE_CHARS` | `100000` |
| `GLM_BRIDGE_ALLOWED_DOMAINS` | empty |
| `GLM_BRIDGE_TRANSPORT_MODE` | `stdio` |
| `GLM_BRIDGE_HTTP_HOST` | `127.0.0.1` |
| `GLM_BRIDGE_HTTP_PORT` | `3456` |
| `GLM_BRIDGE_HTTP_MCP_PATH` | `/mcp` |
| `GLM_BRIDGE_HTTP_SSE_PATH` | `/sse` |
| `GLM_BRIDGE_HTTP_MESSAGES_PATH` | `/messages` |
| `GLM_BRIDGE_HTTP_ALLOWED_HOSTS` | empty |
| `GLM_BRIDGE_REMOTE_BASE_URL` | derived from host and port |
| `GLM_BRIDGE_REMOTE_AUTH_MODE` | `none` |
| `GLM_BRIDGE_REMOTE_AUTH_TOKEN` | empty |
| `GLM_BRIDGE_REMOTE_AUTH_SCOPES` | empty |
| `GLM_BRIDGE_OAUTH_ISSUER_URL` | empty |
| `GLM_BRIDGE_OAUTH_AUTHORIZATION_URL` | empty |
| `GLM_BRIDGE_OAUTH_TOKEN_URL` | empty |
| `GLM_BRIDGE_OAUTH_REGISTRATION_URL` | empty |
| `GLM_BRIDGE_OAUTH_REVOCATION_URL` | empty |
| `GLM_BRIDGE_OAUTH_SERVICE_DOCUMENTATION_URL` | empty |

## Transport modes

- `stdio` keeps the original local MCP host flow for Codex and Claude Desktop.
- `http` starts a remote MCP service with streamable HTTP at `/mcp` and deprecated SSE compatibility endpoints at `/sse` and `/messages`.

## Remote auth

- `GLM_BRIDGE_REMOTE_AUTH_MODE=none` leaves the remote endpoint unauthenticated.
- `GLM_BRIDGE_REMOTE_AUTH_MODE=bearer` requires `Authorization: Bearer <token>`.
- `GLM_BRIDGE_REMOTE_AUTH_MODE=oauth_metadata` also requires a bearer token and publishes protected-resource and authorization-server metadata for remote clients.

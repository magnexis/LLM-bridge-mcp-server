# Claude Desktop

Use [examples/claude_desktop_config.json](C:/Users/matth/OneDrive/Desktop/company/cant-stop/examples/claude_desktop_config.json) as a starting point.

Key points:

- prefer `command: "npx"` with `args: ["-y", "@magnexis/llm-bridge-mcp-server"]`
- put `ZAI_API_KEY` in the MCP server environment
- set `GLM_BRIDGE_TRANSPORT_MODE` to `stdio` for the local desktop JSON config path
- restart Claude Desktop after updating the configuration

For Anthropic remote custom connector usage instead of local stdio:

- run the bridge with `GLM_BRIDGE_TRANSPORT_MODE=http`
- expose the `/mcp` endpoint at a reachable deployment URL
- enable bearer auth or `oauth_metadata` mode before exposing it outside localhost
- use Claude’s remote MCP / custom connector setup against that URL rather than the local desktop config JSON

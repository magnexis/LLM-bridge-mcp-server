# Codex

Use [examples/codex-config.toml](C:/Users/matth/OneDrive/Desktop/company/cant-stop/examples/codex-config.toml) as a starting point.

Key points:

- register the MCP server under `mcp_servers`
- prefer `npx -y @magnexis/llm-bridge-mcp-server` so users do not need a local clone
- provide the provider variables in the environment table
- keep `GLM_BRIDGE_TRANSPORT_MODE=stdio` for the local stdio client path

Remote mode notes:

- use `url = "http://127.0.0.1:3456/mcp"` for streamable HTTP mode
- use current Codex option names such as `bearer_token_env_var`, `default_tools_approval_mode`, `startup_timeout_sec`, and `tool_timeout_sec`
- if the bridge runs with bearer auth enabled, provide `GLM_BRIDGE_REMOTE_AUTH_TOKEN` in the environment Codex can read

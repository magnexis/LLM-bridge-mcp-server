# Troubleshooting

- Server appears idle: stdio MCP servers wait for host requests and do not print normal output.
- Build entry missing: run `npm run build` and confirm `dist/index.js` exists.
- Missing tools in host: rebuild, restart the host, and run `npm run inspect:mcp`.
- Network fetch denied: enable `GLM_BRIDGE_NETWORK_ENABLED` and set an allowlist when needed.
- Approval rejected: use the exact matching proposal identifier.

# LLM Bridge MCP Server v1.1.0

## Release artifacts

- `magnexis-llm-bridge-mcp-server-1.1.0.tgz` — publish-ready npm package for `@magnexis/llm-bridge-mcp-server`
- `SHA256SUMS.txt` — SHA-256 integrity digest for the tarball

## Highlights

- Approval-driven development operations, checkpoints, rollback, and audit records.
- Streamable HTTP, legacy SSE, and WebSocket remote MCP hosting.
- Privacy-mode-aware evidence persistence and scoped network retrieval controls.
- Codex and Claude Desktop configuration examples using `npx -y @magnexis/llm-bridge-mcp-server`.

## Verify

```powershell
Get-FileHash .\magnexis-llm-bridge-mcp-server-1.1.0.tgz -Algorithm SHA256
```

Compare the result with `SHA256SUMS.txt`.
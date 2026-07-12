# Release Guide

This repository publishes as the scoped npm package:

```bash
@magnexis/llm-bridge-mcp-server
```

Primary release metadata:

- npm package: `@magnexis/llm-bridge-mcp-server`
- GitHub repository: `https://github.com/magnexis/LLM-bridge-mcp-server`
- MCP registry/server id: `io.github.magnexis/LLM-bridge-mcp-server`

## Pre-release checks

- run `npm run typecheck`
- run `npm run test:run`
- run `npm run build`
- run `npm run inspect:mcp`
- run `npm run verify`
- run `npm pack --dry-run`
- confirm docs match actual runtime behavior
- confirm no secrets are present in examples or resources

## Publish flow

For the first public release of the scoped package:

```bash
npm publish --access public
```

After publication, users and MCP hosts can launch it with:

```bash
npx @magnexis/llm-bridge-mcp-server
```

## Included release artifacts

- `package.json`
- `package-lock.json`
- `server.json`
- `manifest.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `dist/`
- `docs/`
- `examples/`
- `assets/`

## Related docs

- [README.md](./README.md)
- [docs/RELEASE-CHECKLIST.md](./docs/RELEASE-CHECKLIST.md)
- [docs/REGISTRY-PUBLISHING.md](./docs/REGISTRY-PUBLISHING.md)
- [docs/INSTALLATION.md](./docs/INSTALLATION.md)

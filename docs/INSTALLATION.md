# Installation

## Requirements

- Node.js 20 or newer recommended
- npm compatible with the installed Node version

## Steps

```bash
npm install
copy .env.example .env
npm run build
npm start
```

Use `cp` instead of `copy` on Unix-like systems.

## npm / npx package identity

The publishable npm package name is:

```bash
@magnexis/llm-bridge-mcp-server
```

Because it is a scoped public npm package, the first publication should use:

```bash
npm publish --access public
```

After publication, MCP hosts and users can launch the CLI through `npx`:

```bash
npx @magnexis/llm-bridge-mcp-server
```

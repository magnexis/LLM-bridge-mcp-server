# MCP Registry Publishing

This repository is now structured to be registry-ready for the current MCP Registry flow.

## Chosen package type

This project uses the `npm` package type, not `mcpb`.

Why:

- the server is already implemented in TypeScript/Node.js
- the built artifact is a normal installable CLI entry point
- npm is the simplest registry path for a stdio MCP server in this codebase
- it avoids an extra packaging layer unless a prebuilt binary distribution later becomes important

## Included registry metadata

- `package.json` now includes:
  - `mcpName`
  - repository metadata
  - publish metadata
  - a CLI `bin` entry
- `server.json` now includes the MCP Registry server record
- `manifest.json` now provides a release-time extension manifest scaffold for packaging workflows that expect it

## Important provisional values

This repo currently uses a provisional GitHub owner namespace:

- `io.github.magnexis/LLM-bridge-mcp-server`
- `https://github.com/magnexis/LLM-bridge-mcp-server`

Replace those values before public publication if your actual GitHub owner or repository URL differs.

## Publish flow

1. Confirm or replace the provisional GitHub owner/repository values in:
   - `package.json`
   - `server.json`
   - `manifest.json`
2. Publish the npm package. For the first release of the scoped public package, use `npm publish --access public`.
3. Install `mcp-publisher`.
4. Run `mcp-publisher login github`.
5. Run `mcp-publisher publish`.

## Notes

- The chosen registry metadata advertises the package as a `stdio` MCP server.
- Remote HTTP hosting is implemented in the runtime, but the registry package entry currently targets the local stdio installation path because that is the most portable default for npm-based MCP clients.

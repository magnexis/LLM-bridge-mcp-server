# Controlled Agent

The controlled agent is the project’s bounded read-only local reasoning loop.

## Allowed tools

- `read_text_file`
- `list_directory`
- `search_text`
- `inspect_package`
- `inspect_git_status`

## Boundaries

- no writes
- no shell execution
- no web browsing
- no secret-file access
- no host-tool inheritance
- no automatic recursive MCP execution

## Persistence

The agent can create a continuation session when requested, but it does not persist raw hidden reasoning or raw image payloads.

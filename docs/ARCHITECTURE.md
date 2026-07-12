# Architecture

## Startup flow

`src/index.ts` loads configuration, creates the MCP server, installs process-level shutdown handlers, and connects the server to `StdioServerTransport`.

`src/server.ts` is the current registration hub. It constructs:

- the provider client
- context and session stores
- development proposal and audit stores
- the development executor
- the role registry
- the job store and coordinator
- the policy store
- the repository memory store
- the workflow registry

## Request lifecycle

1. Host invokes an MCP tool.
2. Input is validated with a strict Zod schema.
3. The tool either:
   - calls the provider client
   - inspects the local repository through bounded helpers
   - persists or reads local-first records
   - delegates to the development executor or orchestration coordinator
4. Tool results are returned through MCP text content.
5. Diagnostics remain on `stderr`.

## Provider flow

The provider client builds a chat-completions request using the selected provider configuration. It supports:

- direct Z.AI
- OpenRouter-compatible requests
- request semaphore limiting
- request timeout
- bounded retry for retryable provider failures
- provider response normalization

## Tool registration

The public MCP surface is currently registered directly in `src/server.ts`. The project still has room to split registration into dedicated resource, prompt, and tool registrars.

## Controlled agent

The controlled agent is a bounded read-only multi-turn loop. It does not mutate files and cannot run arbitrary commands. It only exposes a small allowlist of local repository-inspection tools.

## Execution policy

Mutation follows the current conservative flow:

1. Propose a change set.
2. Persist operations and requested commands.
3. Require explicit exact-ID approval.
4. Apply operations inside the approved working directory.
5. Create a checkpoint.
6. Optionally run an allowlisted approved validation command.
7. Roll back by checkpoint when requested.

## Checkpoint and rollback

The current checkpoint system stores per-proposal file snapshots under `.glm-5-bridge-checkpoints` inside the working directory. Rollback restores only paths captured for that proposal rather than resetting the whole repository.

## Orchestration and jobs

The orchestration coordinator currently creates role-specific task graphs and persists planning jobs. Jobs can be inspected, resumed, or cancelled. Mutation remains separate from orchestration itself.

## Persistence

The current persistent stores are JSON-file based and use atomic replacement writes. They cover:

- contexts
- sessions
- development proposals and audit entries
- jobs
- policies
- repository memory
- workflows

## Retry, concurrency, and shutdown

- Provider requests use a semaphore.
- The controlled agent has its own concurrency limit.
- Provider requests have bounded retries.
- `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection` are handled in `src/index.ts`.

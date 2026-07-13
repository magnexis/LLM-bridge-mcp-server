# Security

## Threat model

The server sits between an MCP host and a model provider. The main risks are:

- path traversal
- symlink escape
- sensitive-file access
- arbitrary shell execution
- approval bypass
- provider data leakage
- unsafe network retrieval
- prompt injection from retrieved or user-supplied context
- protocol-breaking stdout output
- remote transport abuse through repeated requests

## Trust boundaries

- The host controls when tools run.
- The provider is untrusted output and must not gain local authority.
- Repository input is untrusted text unless explicitly validated and scoped.
- Tool schemas define the public input contract.

## Path security

`src/utils/path-security.ts` blocks:

- traversal outside the approved root
- symlink access for approved file reads
- sensitive names such as `.env`, private keys, `.aws`, `.ssh`, `.npmrc`, and similar files

The mutable executor adds a second check to reject symlink paths during file writes or rollback.

## Secrets

The current implementation never exposes `ZAI_API_KEY` through resources or `sanitizeConfig`. Sensitive files are denied before reads.

## Approval model

The current approval model is deliberately strict and record-based:

- every proposal revision has a distinct approval ID
- the proposal must already be in the approved state
- mutation is scoped to the proposal working directory
- approvals expire after the configured TTL
- consumed approvals cannot be reused
- material proposal changes revoke the prior approval and issue a new approval ID

## Command execution

The project does not allow arbitrary shell commands. The current implementation only allows a small fixed set of `npm` validation commands through `glm_5_run_approved_command`.

## Network restrictions

`glm_5_fetch_reference` is off by default. When enabled, it currently requires:

- `https`
- no URL credentials
- optional explicit allowlist
- no localhost or private-IP literal targets
- redirect rejection
- text-like response content
- response-size truncation

## Logging

Normal logs must not go to stdout. Startup and error handling use `stderr`.

## Known gaps

- deeper approval queue/reissue workflows are not yet fully implemented
- privacy-mode enforcement is not yet consistent across every store

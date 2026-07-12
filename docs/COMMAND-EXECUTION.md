# Command Execution

The project does not permit unrestricted command execution.

## Allowed path today

`glm_5_run_approved_command`

Allowed commands:

- `npm run typecheck`
- `npm run build`
- `npm run test:run`
- `npm run lint`

## Safety characteristics

- uses a fixed allowlist
- no arbitrary executable selection
- no `shell: true`
- no pipes, redirection, or shell chaining
- requires exact proposal approval

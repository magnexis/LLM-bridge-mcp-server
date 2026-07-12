# Prompts

The MCP prompt templates are lightweight host helpers. They do not execute tools on their own. Their job is to guide the host toward the right MCP tool and remind the host that mutation is still approval-gated.

Current registered prompts:

- `glm_architecture_review`
- `glm_repository_audit`
- `glm_debugging_session`
- `glm_ui_review`
- `glm_second_opinion`
- `glm_implementation_task`
- `glm_safe_refactor`
- `glm_fix_failing_tests`
- `glm_dependency_upgrade`
- `glm_multi_agent_implementation`
- `glm_repository_modernization`
- `glm_security_remediation`
- `glm_release_readiness`
- `glm_architecture_consensus`

Each prompt currently uses typed arguments through the MCP SDK registration in `src/server.ts`.

# Tool Contracts

This document summarizes the current public MCP tools and their implemented behavior.

## Core consultation tools

`glm_5_consult_knowledge`

- Use when: you want an independent GLM explanation or second opinion.
- Do not use when: you need live web verification or file mutation.
- Side effects: none.
- Risk: low.

`glm_5_query_reasoning`

- Use when: you need a more deliberate reasoning-oriented answer.
- Do not use when: the task is primarily visual or file-mutating.
- Side effects: none.
- Risk: low.

`glm_5_route_agentic_task`

- Use when: you want a structured multi-step plan.
- Do not use when: you expect the server to directly perform repository mutation.
- Side effects: may create a session when requested.
- Risk: low.

`glm_5v_diff_ui_layout`

- Use when: you need a screenshot or mockup reviewed by the vision model.
- Do not use when: the source is a URL or a non-local image.
- Side effects: none.
- Risk: low.

## Controlled local inspection

`glm_5_run_controlled_agent`

- Use when: you want bounded repository inspection.
- Do not use when: you want arbitrary local command execution.
- Side effects: optional session persistence.
- Risk: medium because it reads local repository files within an approved directory.

`glm_5_inspect_project_context`

- Use when: you want a bounded repository overview.
- Side effects: none.
- Risk: low to medium.

## Development and approval tools

`glm_5_propose_changes`, `glm_5_plan_code_change`, `glm_5_propose_patch`

- Use when: you want a persistent reviewable change proposal.
- Side effects: writes proposal and audit metadata to the data directory.
- Risk: medium.

`glm_5_approve_and_apply_changes`, `glm_5_apply_approved_patch`

- Use when: you want to apply an already reviewed change set.
- Side effects: mutates approved files and creates a checkpoint.
- Risk: high.

`glm_5_rollback_changes`, `glm_5_rollback_change_set`

- Use when: you want to restore a proposal checkpoint.
- Side effects: mutates approved files by restoring snapshots.
- Risk: high.

`glm_5_run_approved_command`

- Use when: you want to run an allowlisted validation command.
- Allowed commands: `npm run typecheck`, `npm run build`, `npm run test:run`, `npm run lint`.
- Risk: high.

## Orchestration and workflow tools

`glm_5_orchestrate_project_task`

- Use when: you want a role-specific planning job.
- Side effects: persists a job.
- Risk: medium.

`glm_5_create_workflow`, `glm_5_run_workflow`

- Use when: you want reusable workflow definitions and planning jobs derived from them.
- Risk: medium.

## Policy, memory, and workspace tools

`glm_5_manage_policy_profile`

- Use when: you want to inspect or update policy profiles.
- Risk: medium.

`glm_5_inspect_repository_memory`, `glm_5_update_repository_memory`

- Use when: you want to inspect or persist long-term repository memory.
- Risk: low to medium.

`glm_5_inspect_workspace`

- Use when: you want workspace or monorepo signals and package manifests.
- Risk: low.

## Restricted network and state transfer

`glm_5_fetch_reference`

- Use when: network retrieval is explicitly enabled and the domain is allowlisted.
- Do not use when: you need live retrieval but the operator has not enabled it.
- Risk: medium.

`glm_5_export_project_state`, `glm_5_import_project_state`

- Use when: you want safe JSON export/import of non-secret bridge state.
- Risk: medium.

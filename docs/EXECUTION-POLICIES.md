# Execution Policies

The policy profile system is stored under the bridge data directory and currently powers `glm_5_manage_policy_profile`.

Built-in profiles:

- `read_only`
- `safe_development`
- `strict_enterprise`
- `ui_review`
- `dependency_maintenance`

Profiles currently capture:

- write allowance
- command allowance
- network allowance
- file deletion allowance
- dependency change allowance
- maximum changed files
- maximum patch size
- maximum agent runs
- denied paths
- allowed domains
- privacy mode

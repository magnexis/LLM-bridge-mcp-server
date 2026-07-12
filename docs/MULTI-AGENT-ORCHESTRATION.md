# Multi-Agent Orchestration

The current orchestration layer is planning-oriented rather than fully autonomous.

## Roles

- architect
- implementer
- debugger
- reviewer
- security_auditor
- test_engineer
- ui_reviewer
- knowledge_consultant

## Current orchestration behavior

- select roles
- create role-specific task nodes
- validate graph structure
- persist a job
- allow inspection, resume, and cancel

The current implementation does not yet execute a full provider-backed consensus loop for every role.

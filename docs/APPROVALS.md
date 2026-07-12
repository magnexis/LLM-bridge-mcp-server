# Approvals

The current approval system is intentionally conservative.

## Current behavior

- proposals are stored through `glm_5_propose_changes` or its Phase 4 aliases
- approval is represented by the exact `proposalId`
- apply and rollback require the exact matching identifier
- applied proposals create audit entries

## Pending approvals

`glm_5_list_pending_approvals` and `glm-bridge://approvals` expose proposals that have not yet been approved.

## Planned expansion

The broader specification calls for expiring, single-use, exact-operation-bound approvals. The current implementation is not yet at that level and the documentation intentionally states that limitation.

# Patches And Rollback

Patch proposals are currently modeled as scoped file operations rather than raw unified diffs.

## Proposal flow

1. Persist a proposal with summary, operations, and requested commands.
2. Review the proposal and audit trail.
3. Approve using the exact proposal identifier.
4. Apply operations within the working directory.
5. Create a checkpoint.
6. Roll back later if needed.

## Rollback behavior

Rollback restores only the snapshot paths recorded for the proposal. It does not perform a global Git reset.

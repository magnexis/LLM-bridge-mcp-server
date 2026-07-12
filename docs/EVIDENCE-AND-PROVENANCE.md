# Evidence And Provenance

The server now tracks provenance through repository memory entries, job/proposal audit metadata, and persisted evidence records.

The current repository state distinguishes:

- repository-derived state
- persisted user-approved changes
- provider-produced answers
- repository-memory provenance strings
- workflow quality-gate command output
- workflow run summaries
- repository-memory write evidence

Future work should deepen evidence linking across every orchestration event, rollback review, and consensus workflow.

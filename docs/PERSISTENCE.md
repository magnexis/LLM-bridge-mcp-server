# Persistence

The bridge uses local JSON persistence with atomic replacement writes.

Current persistent stores:

- contexts
- sessions
- development proposals
- development audit log
- jobs
- policy profiles
- repository memory
- workflows

The current stores use per-file or per-collection JSON rather than a database.

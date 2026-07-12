# Task Graphs

Task graphs define orchestration dependencies between role-specific nodes.

Current features:

- duplicate ID rejection
- missing dependency rejection
- cycle detection
- ready-node calculation

The current implementation is intentionally lightweight but already persists graph state inside jobs.

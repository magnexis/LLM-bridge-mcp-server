# Network Retrieval

Network retrieval is disabled by default.

## Current controls

- `GLM_BRIDGE_NETWORK_ENABLED=false` by default
- HTTPS required
- URL credentials rejected
- optional hostname allowlist
- text-like response content only
- response-size truncation
- request timeout

The current implementation is intentionally fail-closed and narrower than the full long-term design.

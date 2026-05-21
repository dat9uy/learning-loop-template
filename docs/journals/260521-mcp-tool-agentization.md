# MCP Tool Agentization — 5-to-12 Tool Expansion

**Date**: 2026-05-21
**Severity**: Medium
**Component**: constraint-gate MCP server, tool wrappers, coordination hooks
**Status**: Resolved

## What Happened

Expanded the constraint-gate MCP server from 5 to 12 tools. Seven new agent-facing tools added: `validate_records`, `update_claim_verification`, `extract_index_entries`, `search_index_entries`, `generate_capability_records`, `list_runtime_probes`, `list_verified_claims`. Server collapsed from a 430-line monolith to a 37-line `server.js` plus `tool-registry.js` and 12 isolated tool files. Pure-JS rewrite of `list-verified` eliminated the `yq` dependency. All 279 tests pass; 51 files changed, 1836 insertions, 622 deletions. Committed `4453049`.

## The Brutal Truth

This should have been straightforward decomposition, but five latent bugs in the substrate simultaneously surfaced. The most embarrassing: `evaluateWritePath` only matched the `evidence` pattern, so the new `index` and `capabilities` write-paths silently fell through to the unconditional block even when observations were active. We had the abstraction (`pathMatchesObservation`) sitting in `gate-utils.cjs` and simply forgot to wire it in.

## Critical Fixes

1. **verify-claim.js**: `process.exit` killed the MCP server during `update_claim_verification` calls. Extracted pure `updateClaimVerification` into the library; CLI wrapper kept `process.exit`.
2. **resolveRoot**: `startsWith(defaultResolved)` allowed sibling-prefix traversal (`/repo-sibling`). Fix: `defaultResolved + sep` boundary check.
3. **evaluateWritePath**: extended from single evidence pattern to `pathMatchesObservation` covering all write-path patterns.
4. **Import depths**: all tool wrappers incorrectly used `../../` instead of `../../../` for shared libs — every single wrapper had the same copy-paste drift.
5. **Test runner**: CommonJS test runner lacks `beforeEach`; tests leaked temp directories. Fixed by creating fresh tmp dirs per test case.

## Next Steps

- Monitor `list-verified` performance on large index files now that `yq` is gone.
- Add integration tests for the 7 new tools against the real MCP server (current tests cover tool logic in isolation).

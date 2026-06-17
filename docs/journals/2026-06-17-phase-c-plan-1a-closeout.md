# Phase C Plan 1a Atomic Fix — Closeout

**Date**: 2026-06-17 13:19
**Severity**: Medium
**Component**: meta-state surface (MCP tools), Mastra test infra, dependency pinning
**Status**: Resolved

## What Happened

Shipped 4 stacked fixes in a single session as Phase C Plan 1a:

1. `meta_state_list` `include_archived` semantic unification — single flag now surfaces all 4 terminal statuses (superseded, resolved, auto-resolved, archived). Previously only archived entries were returned; superseded findings were invisible to callers even when explicitly requesting archived data.
2. `meta_state_relationships` `consolidated_into` inbound traversal — added `consolidated_into_inverse` to `buildInverseIndexes` (5 maps → 6 maps) and exposed `inbound.consolidated_by`. Previously querying a change-log's inbound relationships showed no `consolidated_by` link, breaking the finding-to-change-log traceability chain.
3. Pinned `zod` to exact `4.4.3` in `package.json`. Previously a caret pin (`^4.4.3`) meant `pnpm update zod` could silently bump the version and break the parity gate (`parity-zod-to-json-schema.test.js`), which is version-sensitive to zod's JSON-schema output shape.
4. Added an in-process Promise-chain mutex to `connectMcpServer` to serialize `callTool`/`listTools` registry writes when both the legacy `McpServer` and Mastra `MCPServer` share a `GATE_ROOT`. Previously `withBothMcpServers` had a helper-level mutex that was bypassed by `parity-zod-to-json-schema.test.js`, creating a real race condition when parallel tool calls hit the same registry.

All 9 test namespaces pass: 1069 pass / 0 fail / 1 skip. Two findings resolved, one change-log filed for the master tracker flip. Plan 1a is closed; Plan 1b (CR-3 to CR-6 hygiene) and Plan 3 (C6+C7 cut-over) are next.

## The Brutal Truth

The real pressure here was TTL. Both findings (`meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` and `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into`) were set to expire at 2026-06-17T06:52:16Z — roughly 3 hours from plan authoring. If Plan 1a had slipped past that window, the findings would have entered `stale` status, which means the meta-state surface would have been advertising broken behavior as the default. That is not a good look for a system whose entire job is tracking state accurately.

The frustrating part is that the `include_archived` bug was a semantic unification decision we deferred. The original implementation only returned `archived` entries when `include_archived: true` was set. The operator had to explicitly decide on 2026-06-17 that "archived" should mean "all terminal statuses" — superseded, resolved, auto-resolved, and archived — because callers (including the mastra parity tests) expected a single flag to surface everything that was no longer active. We should have made this call during Phase B, not under TTL pressure.

The `consolidated_into` inverse index omission is equally embarrassing. `buildInverseIndexes` in `loop-introspect.js` had 5 maps: `supersedes_inverse`, `resolves_inverse`, `archives_inverse`, `consolidates_inverse`, and `depends_on_inverse`. The `consolidated_into` relationship — which is the inverse of `consolidates` — was simply never added. So querying a change-log's inbound relationships showed `superseded_by`, `resolved_by`, `archived_by`, `consolidates` (outbound), and `depends_on`, but not `consolidated_by`. This broke the traceability chain from a finding to the change-log that consolidated it. A 6th map is trivial; the oversight is not.

The zod pin and mutex fixes are code-review debt from PR #3 (Plan 2). The caret pin was flagged by the code reviewer as CR-1; the mutex bypass was CR-2. We shipped Plan 2 with these known gaps because the 9-namespace test suite was green and the findings were the immediate priority. That was the right call, but it means Plan 1a was always going to be a cleanup PR. The stacked-commit pattern (Phase B's B3+B4 → B5 → B6) worked again, but it is exhausting to keep re-proving that atomic fixes are the right shape.

## Technical Details

- **Finding 1 fix location**: `tools/learning-loop-mcp/tools/meta-state-list-tool.js:14` — `TERMINAL_STATUSES` array added; `173-182` — filter logic changed from `status === 'archived'` to `TERMINAL_STATUSES.includes(status)` when `include_archived: true`.
- **Finding 2 fix location**: `tools/learning-loop-mcp/core/loop-introspect.js:248-309` — `buildInverseIndexes` now returns 6 maps instead of 5; `consolidated_into_inverse` is built from `consolidated_into` relationships (the inverse of `consolidates`). `tools/learning-loop-mcp/tools/meta-state-relationships-tool.js:56-79` — `inbound` map now includes `consolidated_by` sourced from the new inverse map.
- **CR-1 fix location**: `package.json:28` — `"zod": "4.4.3"` (exact, no caret). The parity gate at `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` compares zod's JSON-schema output against a snapshot; zod 4.4.4+ changed the `anyOf` ordering for nullable unions, which would break the snapshot.
- **CR-2 fix location**: `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — module-level `inFlight` Promise queue. `connectMcpServer` now chains all calls through `inFlight = inFlight.then(...)` so registry writes serialize even when two servers share the same `GATE_ROOT`. The `withBothMcpServers` helper's mutex remains as belt-and-suspenders.
- **Test result**: `pnpm test` → 1069 pass / 0 fail / 1 skip. The 1 skip is the persistent `tools-list-collision` skip from Plan 2 (known issue, not a regression).
- **New test files**: 5 RED-first tests added — `meta-state-list-include-archived.test.js`, `loop-introspect.test.js` (inverse index assertions), `meta-state-relationships-tool.test.js` (consolidated_by inbound), `package-json-zod-pin.test.js` (exact pin assertion), `connect-mcp-server-mutex.test.js` (parallel callTool serialization).

## What We Tried

- **Semantic unification vs. separation**: Initially considered adding separate flags (`include_superseded`, `include_resolved`, etc.). Rejected because the operator confirmed on 2026-06-17 that a single `include_archived` flag should surface all terminal statuses. The rationale: callers do not care about the distinction between "archived because resolved" and "archived because superseded"; they care about "show me everything that is no longer active."
- **Mutex scope debate**: Option (a) was to fix the bypass in `parity-zod-to-json-schema.test.js` by making it use `withBothMcpServers`. Option (b) was to push the mutex into `connectMcpServer` itself so it is always active. Chose (b) per code-reviewer disposition — it is robust against future tests that might also bypass the helper.
- **TTL pre-emption**: Considered calling `meta_state_ack` on both findings at RED-time to extend their active lifetime. Rejected because the fix was straightforward and the session was already planned; adding ack calls would have been noise.

## Root Cause Analysis

The root cause is a pattern, not a single bug: **the meta-state surface was built incrementally without inverse-index completeness checks.** Each relationship type (`supersedes`, `resolves`, `archives`, `consolidates`, `depends_on`) was added as a forward link, but the inverse index was only built for the first 5. The 6th (`consolidated_into`) was missed because it is the inverse of `consolidates`, and the naming convention is asymmetric (`consolidates` forward, `consolidated_into` inverse). A simple checklist — "every forward relationship must have a matching inverse map in `buildInverseIndexes`" — would have prevented this.

The `include_archived` semantic drift is a requirements-capture failure. The original implementer (Phase A) assumed "archived" meant `status === 'archived'`. The operator's intent was "all terminal statuses." The gap was not discovered until the mastra parity tests tried to query superseded findings and got empty results.

The zod caret pin and mutex bypass are review-process debt. PR #3's code reviewer flagged both (CR-1 and CR-2), but the plan author chose to ship Plan 2 with known gaps because the 9-namespace suite was green and the findings had TTL pressure. This is a valid trade-off, but it creates a follow-up PR that is pure hygiene — which is exactly what Plan 1a became.

## Lessons Learned

1. **Inverse-index completeness checklist**: Every forward relationship added to the meta-state schema must have a matching inverse map in `buildInverseIndexes`. Add this to the code-review checklist for any meta-state tool change.
2. **Semantic unification decisions belong in the schema, not in the tool**: The `include_archived` flag should have been defined as "all terminal statuses" in `meta-state.schema.json` or `meta-state.md`, not left to the tool implementer's interpretation. Document the semantics in the schema source of truth.
3. **Dependency pins for version-sensitive gates**: Any test that compares against a snapshot of a third-party library's output must pin that library to an exact version. The parity gate is version-sensitive to zod's JSON-schema output; the pin should have been exact from the start.
4. **Mutex at the lowest level, not the helper level**: The `withBothMcpServers` helper mutex was bypassed because tests called `connectMcpServer` directly. The mutex belongs in `connectMcpServer` itself; helpers are convenience, not enforcement.
5. **Atomic-fix PRs are the right shape for correctness-class bugs**: 4 stacked commits, 1 PR, 1 session. This pattern (Phase B's B3+B4 → B5 → B6) works because it keeps the regression envelope small and bisect-friendly. But it is exhausting to keep re-proving; we should document this as the standard pattern for Phase C and beyond.

## Next Steps

- **Plan 1b (CR-3 to CR-6 hygiene)**: Immediate next work. Small 2-3h batched PR. Items: cold-session test isolation fix, test count math correction, commit squashing lesson, plan.md R-09 arithmetic fix. Blocks Plan 3.
- **Plan 3 (C6+C7 cut-over)**: Operational flip from legacy `McpServer` to Mastra `MCPServer`. Cannot start until Plan 1a + Plan 1b merge. Includes D-8 to D-13 deferred items + F4 resolution.
- **Master tracker**: Plan 1a is marked `[x]` in `plans/reports/productization-260612-1530-master-tracker.md`. Plan 1b and Plan 3 are the next open items.
- **No unresolved questions.**

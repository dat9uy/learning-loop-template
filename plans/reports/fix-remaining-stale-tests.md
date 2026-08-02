# Fix Remaining Stale Tests (Post-Migration Wire Shape)

## Summary
Rewrote stale test assertions across 15 test files (and regenerated 1 snapshot) to match the post-migration wire shape. No production code was modified.

## Files Modified

| File | Tests | Result |
|------|-------|--------|
| `__tests__/legacy-mcp/meta-state-log-change.test.js` | 10 | pass |
| `__tests__/legacy-mcp/change-log-operation-envelope.test.js` | 10 | pass |
| `__tests__/legacy-mcp/meta-state-relationships.test.js` | 6 | pass |
| `__tests__/legacy-mcp/meta-state-relationships-dangling-refs.test.js` | 4 | pass |
| `__tests__/legacy-mcp/meta-state-relationships-tool.test.js` | 3 | pass |
| `__tests__/legacy-mcp/meta-state-list-ref-by-filter.test.js` | 8 | pass |
| `__tests__/legacy-mcp/meta-state-report-tool-extension.test.js` | 12 | pass |
| `__tests__/legacy-mcp/meta-state-schema-stale-only.test.js` | 3 | pass |
| `__tests__/legacy-mcp/meta-state-stale-flag.test.js` | 9 | pass |
| `__tests__/core/write-time-structural-ri.test.js` | 10 | pass |
| `__tests__/legacy-mcp/loop-describe-warm-tier.test.js` | 10 | pass |
| `__tests__/mcp-tools-list-parity.test.js` | 8 | pass |
| `__tests__/legacy-mcp/meta-state-reopen-e2e-cold-session.test.js` | 1 | pass |
| `__tests__/legacy-mcp/integration-promoted-rule.test.js` | 9 | pass |
| `__tests__/__snapshots__/cli-context-savings-script.test.js.snap` | (snapshot) | pass |
| `__tests__/legacy-mcp/meta-state-list-include-all-versions.test.js` | (already passing) | pass |
| `__tests__/legacy-mcp/meta-state-list-include-archived.test.js` | (already passing) | pass |

## Key Assertion Rewrites

- **`supersedes` on change-log**: `meta_state_log_change` no longer stamps `supersedes`; it emits a `supersedes` citation row (source=change-log, target=supersedes id). Assertions now seed/find the citation.
- **`origin` on rule**: de-routed from `CROSS_REFS`; outbound no longer surfaces it. The canonical promotion edge is an `origin` citation (source=rule, target=finding). Inbound `cited_by` on the finding surfaces the citing rule.
- **`consolidated_into`/`consolidates`**: de-routed; the consolidated edge is a citation row (source=finding, target=change-log). Inbound `cited_by` replaces the named `consolidated_by` map. `ref_field:"citation"` replaces `ref_field:"consolidated_into"` in `meta_state_list`.
- **`reopens` writer removed from `meta_state_report`**: caller-supplied `reopens` is silently ignored (not rejected, not stamped). Fixtures seed `reopens` directly via file write.
- **`cascade_from` removed from `meta_state_resolve`**: parents are resolved directly via `meta_state_resolve({ id })`. The cold-session e2e script is now lint -> report (no reopens) -> resolve parents directly.
- **`superseded` status collapsed to `resolved` + citation**: finding enum is `["open","resolved","accepted","archived"]`; `superseded` is rejected on the write path but read-tolerant (JSON.parse) and terminal per `constants.TERMINAL_STATUSES`. `meta_state_supersede` now stamps `status:"resolved"` + `resolved_at`/`resolved_by` and emits a citation; `superseded_at`/`superseded_by` are inert-historical. The `superseded` dangling reason was retired in favor of `resolved`.
- **`operation_envelope.by_status`**: canonical keys are `["open","resolved","accepted","archived"]` (no `superseded`); envelope fixtures updated.
- **`TERMINAL_STATUSES` (meta-state.js)**: now `{resolved, accepted}` (no `superseded`).
- **MCP tools/list parity**: `meta_state_resolve` lost `cascade_from`; `meta_state_accept` was added. Parity test pins the current shipped schemas.
- **`loop_describe` warm tier hints**: the reopens hint now documents explicit `meta_state_resolve` (no cascade) instead of the legacy `cascade-resolve`; the relationship script says "no cascade" instead of "1 step".
- **`writeEntry` consolidated_into RI**: `consolidated_into` is de-routed from the structural RI check (unindexed); writeEntry still accepts it (schema-optional) but emits NO warn-only advisory. The edge must come from a citation now.

## Plan-ID Sweep
Stripped existing plan IDs and phase numbers from comments in modified files per the stable-artifacts rule. No new plan IDs added.

## Tests Not Touched (owned by other agents)
`validate-registry-refs.test.js`, `core/entry/{finding,rule,change-log,index}.test.js`, `meta-state-resolve-cascade.test.js`, `meta-state-promote-rule-rule-entry.test.js`, `meta-state-touch-tool.test.js`, `meta-state-accepted-status.test.js`, `consistency-check.test.js`, `meta-state-patch-tool.test.js`.

## Verification
Each modified file: `npx vitest run --no-coverage <file>` -> 0 failures. Final combined run of all 17 files: 117 tests passed.

Status: DONE
Summary: Rewrote stale post-migration assertions in 15 test files + 1 snapshot; all 117 tests pass; no production code modified.
Concerns/Blockers: none
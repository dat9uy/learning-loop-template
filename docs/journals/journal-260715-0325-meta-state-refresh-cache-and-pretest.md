# journal-260715-0325-meta-state-refresh-cache-and-pretest

## Context

Plan `260714-2012-meta-state-refresh-cache-and-pretest` (cook, --auto). Goal: close the N-trial-and-error loop that the meta-state refresh workflow forced on every code-touching fix. 3 additive changes — no new MCP tool, no new CLI script, no manifest change.

## What shipped

| Phase | Change | Files |
|-------|--------|-------|
| 1. Cache-key fix (TDD) | `file_index_sha256` joined `registry_sha256` as load-bearing cache key. TOCTOU-safe atomic paired reads: both files buffered first, then both SHAs computed in-memory. | `core/loop-introspect-cache.js` |
| 1. New test | Sibling `describe("file-index SHA invalidates cold-tier cache")` with own `mkdtempSync` root; writes both meta-state.jsonl AND file-index.jsonl fixtures; mutates only file-index.jsonl with different byte length; asserts on-disk `built_at` differs. | `__tests__/legacy-mcp/loop-describe-cold-cache.test.js` |
| 2. Pretest seed | `pnpm test` now begins with the existing `seed-file-index.mjs`. Pre-commit hook inherits via the existing `pnpm test && pnpm fallow:gate` chain. `SKIP_PRESEED=1` escape hatch added for operators who want the drift signal back. | `package.json`, `seed-file-index.mjs` |
| 3. PROCESS_HINTS row + 4-file mirror | New row at index 8 in `core/loop-introspect.js`; byte-for-byte mirror in `.factory/hooks/loop-surface-inject.cjs`. `HINT_KEY_MAP_PROCESS` and `HINT_SUGGESTIONS_PROCESS` aligned at index 8 in `loop-get-instruction-tool.js`. New sibling test for `HINT_KEY_MAP_PROCESS` coverage closes the silent-rot gap (3→4 keys). Sibling length-locked assertion `8 → 9`. | `core/loop-introspect.js`, `.factory/hooks/loop-surface-inject.cjs`, `tools/handlers/loop-get-instruction-tool.js`, 2 test files |

## Findings (resolutions)

- `meta-260714T1704Z-the-meta-state-refresh-workflow-forces-n-trial-and-error-mcp` → `resolved` via `meta_state_resolve` (operator-mediated; landed on disk).
- `loop-design-meta-state-batch-refresh-and-reground-drift` → `ship` deferred to operator (`LOOP_SESSION_MODE=live` required); the operator runs `meta_state_ship_loop_design` to flip `active → inactive` and stamp `shipped_in_plan`. PR #58 surfaces this in the registry-deltas section.

## Costs / metrics

- Pretest seed wall-clock: **115 ms** for 19 distinct `mechanism_check:true` cited paths (closes Red Team F15 unsubstantiated "tens of ms" estimate and the F15 500-1500ms estimate).
- Cold-tier cache key now keyed on 2 SHAs; `readColdTierCache` buffers both files first → eliminates the 2-read TOCTOU window a concurrent writer could exploit (Red Team F8).
- Backward-compat: cached files written before this commit lack `file_index_sha256`; first call after upgrade returns `{hit:false, reason:"sha_mismatch"}` (safe direction), then next write carries both SHAs.

## Code-review outcome

`DONE_WITH_CONCERNS`. One HIGH style/process issue (8 plan-ID / audit-label / phase-number comments leaked into code+test, violating `rule-stable-code-artifacts`); one LOW unused-import flag. Both fixed in-session before commit. Re-verified: `pnpm test` 1895 passed | 1 skipped after cleanup.

## What this enables

Every code-touching fix that touches a `mechanism_check:true`-cited path now goes from "5+ MCP round-trips + 3+ trial-and-error vitest runs + manual cache deletion = 30-90s wasted" to "the next `pnpm test` absorbs the drift at test time, no operator action needed." Operators who want the pre-commit drift signal back can `SKIP_PRESEED=1 pnpm test` per run.

## Open operator actions

1. Run `meta_state_ship_loop_design` against `loop-design-meta-state-batch-refresh-and-reground-drift` in a `LOOP_SESSION_MODE=live` session.
2. Merge PR #58 once CI is green and the operator-side ship call has landed.

## Files

- Plan: `plans/260714-2012-meta-state-refresh-cache-and-pretest/plan.md` (status: completed)
- PR: https://github.com/dat9uy/learning-loop-template/pull/58 (body: `plans/260714-2012-meta-state-refresh-cache-and-pretest/reports/pr-body.md`)
- Commit: `4c620d2` on branch `plan/260714-2012-meta-state-refresh-cache-and-pretest`
- Cook report: `plans/reports/cook-260715-0258-GH-260714-meta-state-refresh-shipment-report.md`

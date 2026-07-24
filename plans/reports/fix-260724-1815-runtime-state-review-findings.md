# Fix Report — runtime-state lifecycle review findings

- **Base:** working tree on top of `7d217f9` (plan-260724-1119 branch)
- **Source:** `plans/reports/code-review-260724-1719-runtime-state-lifecycle.md` (5 Important, 13 Minor)
- **Verification:** full suite 2477 passed / 1 skipped; sole failure `cold-tier-regression` confirmed pre-existing (fails at clean HEAD — wall-clock age threshold, unrelated).

## Important findings — all fixed

1. **Fail-open at parse level** → `readRuntimeStateRowsDetailed` returns `{rows, malformed}`; `readBudgetTrackingState` throws on `malformed > 0` ("a dropped line could be a lifecycle record"). JSON `null` lines keep legacy skip-silently semantics. (`core/runtime-state.js`)
2. **Record handler fail-open** → `runtime_state_record` returns structured `{ok:false, error:"corrupt_state"}` on unreadable budget state; pause/resume/stop now return the same envelope (uniform fail-closed UX). Dispatch tool left throwing (fail-closed writer).
3. **R2 preflight TTL** → `hasSurfacePreflightMarker` parses the marker JSON and enforces the 30-min TTL, mirroring `readPreflightMarker`; stale/content-less/unparseable markers do not authorize. New test: 31-min-old marker → `preflight_required`.
4. **D8 canonical-id** → enforced, but the delegated re-review found the first pass (reject-new-id-while-live) was **incoherent with D1's new-id restart** (live repro: second record on restarted id rejected; old canonical id resurrectable). Operator decision: **same-id restart** — budget-state records must use the canonical id (`canonical_id_required` otherwise); after `stop`, a budget-state record under the canonical id IS the restart (fresh `active` version over preserved history). D1 amended with operator sign-off.
5. **Surface-level pause semantics** → resolved by (4): one entity per surface forever, so surface-level `latest-wins` is coherent again.
6. **Preflight marker dead-end** (found in re-review) → `gate_mark_preflight` enum gained `runtime-state`; the sanctioned writer can now mint the marker `runtime_state_record` requires.

## Minor findings — all fixed

- Dead `? "active" : "active"` ternary removed; blocked-record payload now carries actual `status` + actionable message.
- Resume rejects never-tracked (`not_tracked`) and `initial` (`invalid_transition`); no more silent entity creation.
- Stop idempotency documented (same-state repeats idempotent; cross-state from `stopped` strict) in header, tool description, and contract docs.
- TOCTOU comment at the record check; cross-surface corrupt-line blast radius documented in `docs/runtime-contract.md`.
- Kind-less legacy rows read as `budget-state` in both gate scans (`file-readers.js`, `inbound-state.js`) — legacy sidecars never go silently dark; writes stay strict.
- `appendOrFindDispatchLedgerEvent` now calls `assertKindConditionalStatus` (both append boundaries guarded).
- Dead code removed: `atomicRewriteSidecar`, `RUNTIME_TRACKING_*` consts, three no-op sidecar shims (zero live importers, verified).
- `readBudgetTrackingState` reuses extracted `collapseLatestById` (dedup DRY'd with `readRuntimeStateRowsLatest`).
- e2e asserts ledger-row preservation (21/22) and a new pin test guards the REAL sidecar: ≥33 rows + vnstock entity terminal `stopped`.
- Stale prune references fixed in 3 test files; `docs/loop-engine.md` § Budget tracking flipped from "open direction" to shipped.
- Plan IDs / audit codes (R5, R8, R9, R11, R13, D1, D4, D8, plan 260724-1119) swept from all comments/test names added by the reviewed range; invariants now described directly.
- Unused `expect` import and voided import removed from new tests.

## Test changes

12 empty-string preflight markers across 7 test files migrated to JSON `{completed_at}` (required by the TTL). New coverage: restart-after-stop (and repeatable re-record), non-canonical id rejection, record `corrupt_state`, resume `not_tracked`, stale-marker TTL rejection, malformed-line throw, real-sidecar pin.

## Behavior changes to note

- `runtime_state_record` blocked payload shape: `{ok:false, status, ...}` (was `{ok:false, paused:true}`).
- Budget-state records now require `id === affected_system`.
- `gate_mark_preflight` accepts `surface: "runtime-state"`.

## Unresolved questions

None. The pre-existing `cold-tier-regression` failure (registry aging past the age-stale threshold) is out of scope here but red on main — worth its own fix.

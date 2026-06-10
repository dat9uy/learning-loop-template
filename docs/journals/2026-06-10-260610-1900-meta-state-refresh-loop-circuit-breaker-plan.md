---
date: 2026-06-10
session: ck-plan --hard --tdd
plan: plans/260610-1900-meta-state-refresh-loop-circuit-breaker/
brainstorm: plans/reports/brainstorm-260610-1900-meta-state-refresh-loop-circuit-breaker.md
researcher-reports:
  - /tmp/researcher-a-cache-mechanics.md
  - /tmp/researcher-b-report-default.md
adversarial-reports:
  - /tmp/red-team-260610-1900.md
  - /tmp/validate-260610-1900.md
---

# Journal — 260610-1900 meta-state refresh-loop circuit-breaker plan

## What was produced

A 3-phase TDD plan that closes the droid-session loop pathology from session `dac9b6ed` (163 `meta_state_refresh_fingerprint` calls, 147 identical `not_grounded` errors in 53 minutes). Two structural fixes shipped together:

1. **Idempotency cache on `meta_state_refresh_fingerprint`** — process-lifetime Map keyed on `id + previous_code_fingerprint`, 60s TTL, lazy expiry on read. Caches `not_grounded`, `code_missing` (no-ref case only), and success. `code_missing` (file gone) is explicitly NOT cached (operator can self-heal by creating the file).
2. **Auto-default + warning on `meta_state_report`** — `effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref)`; spread constrained to `=== true` to preserve "field absent" semantic. When caller passes both `evidence_code_ref` and `mechanism_check: false`, response includes a structured `warnings: [{ code, message, suggestion }]` array.

## Mode and process

Ran `/ck:plan --hard --tdd` on the brainstorm report. Spawned 2 researchers (cache mechanics, report default), wrote plan via planner subagent, then ran red team and validation. Applied 8 critical/high-severity fixes from the adversarial reports.

## Key design decisions (locked)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| Cache key | `id + "::" + (entry.code_fingerprint ?? "null")` | File change mutates the stored fingerprint → next call is a miss by construction |
| Asymmetric `code_missing` carve-out | Cache (no ref) case; do NOT cache (file gone) | Operator can create the file at `evidence_code_ref`; cached (file gone) would return stale for 60s |
| `??` over `\|\|` | `mechanism_check ?? Boolean(evidence_code_ref)` | `\|\|` silently flips `false` to `true`; `??` preserves explicit opt-out |
| Spread constraint | `...(effective_mechanism_check === true && { mechanism_check: true })` | Stores only `true`; field is absent (not `false`) when both omitted → preserves T-existing-B |
| T4 sequential loop | `for` loop with `await`, not `Promise.all` | Cache write happens AFTER `await updateEntry`; concurrent calls all see miss before any writes |
| Hint count update | 5 sites in 2 files (`cold-session-discoverability.test.cjs:426,445`; `loop-describe-warm-tier.test.js:11,64,69`) | Plan listed each line number explicitly after the red team flagged the gap |

## Critical issues caught and fixed

- **C7 (red team)**: `code_missing` (file gone) wrongly lumped into cache write scope — applied asymmetric carve-out.
- **C8/H8 (red team)**: T4's `Promise.all` would produce 100 misses, not 1 — switched to sequential `for` loop.
- **C1 (red team)**: Test import update implicit in plan — added explicit diff to Step 1.2.
- **C4 (red team)**: Hint count assertions are in 2 files (5 sites), not 1 — enumerated all 5.
- **H10 (red team)**: `LOCAL_DISCOVERABILITY_HINTS` has 5 entries, canonical has 9 — pre-existing drift; documented as out-of-scope caveat.
- **U8 (validation)**: 7 test fixtures pass `evidence_code_ref` without `mechanism_check` — added backward-compat audit step.
- **H1/H3/H6 (red team)**: Auto-default + temporal asymmetry + consult-gate impact — added Risks 8, 9, 10.
- **C6 (red team)**: `cache_hit` field name collision with `loop_describe` — documented in Risk 10.

## Lessons

1. **The asymmetric `code_missing` carve-out is the most important non-obvious design point.** Caching all error responses uniformly would have shipped a 60s staleness bug for the "file gone" case. The red team caught this; the brainstorm had not.
2. **`Promise.all` is wrong for sequential cache tests** when the cache write happens after an `await`. The microtask scheduling means all concurrent calls see a miss. Sequential `for` with `await` is required.
3. **"Tests written first" in TDD is not optional** when the test exercises module-scope state. The plan's Step 1.2 (defensive `_clearIdempotencyCacheForTests()` in 3 existing tests' `finally` blocks) was easy to overlook in the initial draft.
4. **The pre-existing `LOCAL_DISCOVERABILITY_HINTS` vs canonical `DISCOVERABILITY_HINTS` drift is a known issue** that has accumulated over multiple plans. Worth a future consolidation plan.

## Open follow-ups (out of scope for this plan)

- `meta_state_log_change` entry for the auto-default policy shift (F10 from validation).
- Backward-compat audit on the 7 test fixtures (now a Phase 2 verification step).
- `idempotency_hit` rename to avoid `cache_hit` collision (C6 from red team).
- A future plan for the consult-gate retry-suppression rule (`rule-no-retry-same-tool-same-args-twice`) — captured but not in scope.

## Next step

Run `/ck:cook plans/260610-1900-meta-state-refresh-loop-circuit-breaker/` to begin TDD implementation. Phase 1 (cache) ships first because it has no schema implication; Phase 2 (auto-default) follows; Phase 3 (discoverability + verification) closes the loop.

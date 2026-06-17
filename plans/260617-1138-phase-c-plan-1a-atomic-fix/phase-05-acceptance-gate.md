---
phase: 5
title: "acceptance-gate"
status: pending
priority: P1
effort: "30min"
dependencies: ["phase-04-parity-mutex"]
---

# Phase 5: acceptance-gate

## Overview

The closeout phase: run the full acceptance gate (4 RED tests + 9 test namespaces + 0 regressions), resolve the 2 active findings, log the change, flip the master tracker, and write a closeout journal entry. **This is the gate the next plan (Plan 1b / Plan 3) waits on.**

## Context Links

- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C — canonical state; this phase flips "Plan 1a [x]"
- `meta-state.jsonl` — registry; 2 `meta_state_resolve` calls + 1 `meta_state_log_change` call
- `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/reports/` — Plan 1 closeout report structure (template for this plan's closeout)
- `plans/260616-2200-phase-c-plan-2-parity/reports/closeout-report.md` — Plan 2 closeout report structure (template)
- `meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when` — resolve in this phase
- `meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into` — resolve in this phase

## Requirements

- **Functional:** all 4 RED tests are GREEN; full `pnpm test` passes; 2 findings resolved; 1 change-log entry; master tracker flipped.
- **Non-functional:** closeout report is written to `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md`; PR body is consistent with the closeout.

## Architecture

The closeout is a 6-step script:

1. **Verify the 4 RED tests are GREEN** (in CI or locally).
2. **Run full `pnpm test`** to confirm 0 regressions (9 test namespaces; the mastra namespace contains 75 tests per Plan 2 baseline).
3. **Run `meta_state_resolve` on the 2 findings** (operator mode required).
4. **Run `meta_state_log_change`** for the plan (1 entry).
5. **Flip the master tracker** (Plan 1a [x] + body text link to plan dir).
6. **Write the closeout report** + journal entry.

The change-log and tracker-flip are the canonical "this plan shipped" signals for the next plan (Plan 1b / Plan 3) to consume.

## Related Code Files

- Modify: `plans/reports/productization-260612-1530-master-tracker.md` (Plan 1a [x] + body text)
- Modify: `meta-state.jsonl` (2 `meta_state_resolve` + 1 `meta_state_log_change` calls)
- Create: `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` (closeout)
- Create: `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` (journal entry)
- No code changes. No test changes.

## Implementation Steps

1. **Verify the 4 RED tests are GREEN** by running each test file individually:
   - `pnpm test tools/learning-loop-mcp/tools/meta-state-list-tool.test.js` (or co-located; if absent, the new test file path)
   - `pnpm test tools/learning-loop-mcp/core/loop-introspect.test.js`
   - `pnpm test tools/learning-loop-mcp/tools/meta-state-relationships-tool.test.js`
   - `pnpm test tools/learning-loop-mcp/__tests__/package-json-zod-pin.test.js`
   - `pnpm test tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js`
2. **Run full `pnpm test`** to confirm 0 regressions. Expected: all 9 test namespaces pass (durable 9-namespace anchor; the mastra namespace contains 75 tests per Plan 2 baseline).
3. **Run `meta_state_resolve` on the 2 findings** (operator mode required):
   - `meta_state_resolve({id: "meta-260616T1352Z-meta-state-list-does-not-return-superseded-entries-even-when", resolution: "Phase 1 fix: include_archived now surfaces all 4 terminal statuses (superseded/resolved/auto-resolved/archived) per semantic unification decision 2026-06-17. See plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md.", resolved_by: "operator"})`
   - `meta_state_resolve({id: "meta-260616T1352Z-meta-state-relationships-does-not-traverse-consolidated-into", resolution: "Phase 2 fix: buildInverseIndexes now returns 6 maps (added consolidated_into_inverse); meta_state_relationships exposes inbound.consolidated_by. See plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md.", resolved_by: "operator"})`
4. **Run `meta_state_log_change`** for the plan (1 entry):
   - `meta_state_log_change({change_dimension: "semantic", change_target: "plans/reports/productization-260612-1530-master-tracker.md#Phase C", change_diff: {added: ["Plan 1a closeout body text"], changed: ["Plan 1a checkbox from [ ] to [x]"]}, reason: "Plan 1a (atomic fix: 2 findings + CR-1 + CR-2) shipped 2026-06-17 via plans/260617-1138-phase-c-plan-1a-atomic-fix. 9 test namespaces pass (durable anchor), 0 regressions, mastra namespace holds 75 tests per Plan 2 baseline. Plan 1b (CR-3 to CR-6) and Plan 3 (C6+C7 cut-over) unblocked."})`
5. **Flip the master tracker**: edit `plans/reports/productization-260612-1530-master-tracker.md` to add a Plan 1a row under "Phase C plan stack (2026-06-16 decision)" or similar (matching the existing Plan 1 + Plan 2 rows); flip the checkbox; add a 1-line body text with the plan dir link.
6. **Write the closeout report** at `plans/260617-1138-phase-c-plan-1a-atomic-fix/reports/closeout-report.md` with:
   - Verdict (APPROVE-WITH-GAPS or similar)
   - Acceptance gate verification (4 RED tests GREEN, full suite pass, 2 findings resolved, 1 change-log)
   - Test count math (9 test namespaces durable anchor; mastra namespace contains 75 tests per Plan 2 baseline; +4 RED tests for Plan 1a)
   - Risks addressed (4 items, one per phase)
   - Plan 1b + Plan 3 readiness
7. **Write the journal entry** at `docs/journals/2026-06-17-phase-c-plan-1a-closeout.md` with:
   - 1-paragraph summary
   - 4-bullet "what landed" (one per fix)
   - 1-bullet "what's next" (Plan 1b unblocked; Plan 3 unblocked)
8. **Commit:** 1 commit per change (closeout report, journal, tracker flip, meta-state changes) — or 1 squash commit at PR merge time (operator's preference).

## Success Criteria

- [ ] 4 RED tests are GREEN (Phase 1 + 2 + 3 + 4)
- [ ] Full `pnpm test` shows all 9 test namespaces pass (durable 9-namespace anchor) + 0 regressions
- [ ] 2 findings resolved (`meta_state_resolve` calls succeeded; status flipped to `resolved`)
- [ ] 1 change-log entry added (`meta_state_log_change` call succeeded; status `active`)
- [ ] Master tracker flipped (Plan 1a [x] + body text + plan dir link)
- [ ] Closeout report written
- [ ] Journal entry written
- [ ] PR body includes the 4-commit summary + 1 closeout commit (or 5 commits total: 1 per fix + 1 closeout)
- [ ] PR review notes that Plan 1b + Plan 3 are now unblocked

## Risk Assessment

- **TTL expires between Phase 1 and Phase 5** (if Phase 1 took >3h and Phase 5 is delayed). Low: the `meta_state_resolve` call in this phase works regardless of TTL status (resolving a `stale` entry is valid; it transitions `stale` → `resolved` directly). If the finding is already `auto-resolved` by the TTL sweep, the resolution call may fail; in that case, the closeout note cites the shipped PR + the auto-resolved status, and no manual `meta_state_resolve` is needed.
- **Master tracker merge conflict with Plan 1 / Plan 2 closeouts.** Low: the master tracker is the single canonical source; concurrent edits to the same file are rare (Plan 1 + Plan 2 are both shipped). If a conflict occurs, the operator resolves it via `git diff` + manual merge.
- **PR body count drift (75 actual vs the closeout's 75 claim).** Low: Plan 2's closeout already established 75 as the mastra namespace count. Plan 1a doesn't add tests beyond the 4 RED tests; the mastra namespace baseline is preserved. The closeout report should report "9 test namespaces + 0 regressions" (durable anchor) and demote the 75 count to context. The 4 RED tests are not in any namespace yet (they're new files); they're reported in the closeout's RED-tests-section.

## Security Considerations

- No security impact. The closeout is metadata + reports + journal; no production code changes.

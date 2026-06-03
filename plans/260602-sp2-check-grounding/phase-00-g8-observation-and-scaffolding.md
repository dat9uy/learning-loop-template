---
phase: 0
title: "G8 Observation + Schema Scaffolding"
status: completed
priority: P2
effort: "0.25h"
dependencies: []
---

# Phase 0: G8 Observation + Schema Scaffolding

## Overview

Records any live recurrence of the G8 subcommand-class false positive hit during this plan's scaffolding (SP0 documented 4 recurrences; SP2 is the 5th). Captures the recurrence if it occurs, then scaffolds `plan.md` + 5 phase files via the `Create` tool (AGENTS.md-documented fallback when `ck plan create` is blocked by the G8 false positive). Then extends the `metaStateFindingEntrySchema` with 2 new optional fields (`mechanism_check`, `code_fingerprint`) and the `metaStateReportTool` handler to accept `mechanism_check`. No pure function or tool logic in this phase; Phase 1 begins the TDD work.

## Requirements

- Functional:
  - If `ck plan create` is blocked by the G8 false positive (verified: it was), record the recurrence in `meta-state.jsonl` via `mcp__learning_loop_mcp__meta_state_report`. The cook session has direct access; the entry JSON is inlined in `plan.md`'s "G8 Recurrence Note" section.
  - All 6 plan files (plan.md + 5 phase files) exist in `plans/260602-sp2-check-grounding/`
  - `metaStateFindingEntrySchema` is extended with 2 new optional fields
  - `metaStateReportTool` handler is extended to accept and store `mechanism_check`
  - Cross-link the new meta-state entry (if any) with the `createdBy` field in `plan.md`
- Non-functional:
  - No code changes to the gate
  - No `pnpm test` regressions (this phase ships 0 new tests; Phase 1 begins TDD)
  - The 3 related meta plans (SP0, SP1, self-enforcing-loop) are all `completed` — no in-flight cross-plan dependencies

## Architecture

### G8 false positive

The G8 false positive is a known class of false positives (subcommand-name + commit-message matching). The pattern `propose|design|create|new\s+(schema|artifact|directory|convention)` matches bare `create` and the word `design` regardless of context. SP0's plan documented 4 recurrences. This plan's scaffolding follows the same pattern: use the `Create` tool directly to scaffold plan files; record a fresh meta-state entry to track the 5th recurrence.

The smoke test in `__tests__/g8-subcommand-class-entry.test.js` continues to pass.

### Schema extension (`tools/learning-loop-mcp/core/meta-state.js`)

Add 2 new optional fields at the end of `metaStateFindingEntrySchema` (per the verification report's recommendation, after `status`, for stable JSON serialization):

```js
mechanism_check: z.boolean().optional()
  .describe("Opt-in flag: include this finding in grounding checks. Default false. When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."),
code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
  .describe("SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; updated by meta_state_refresh_fingerprint on explicit refresh."),
```

### Report tool extension (`tools/learning-loop-mcp/tools/meta-state-report-tool.js`)

Per the C-2 mitigation: extend the handler to accept and store `mechanism_check`. Current handler destructures 8 fields (lines 14-22); add `mechanism_check` to the destructuring and include it in the entry construction (lines 24-30).

## Related Code Files

- Create:
  - `plans/260602-sp2-check-grounding/plan.md` (this plan)
  - `plans/260602-sp2-check-grounding/phase-00-g8-observation-and-scaffolding.md` (this file)
  - `plans/260602-sp2-check-grounding/phase-01-pure-function-check-grounding.md` (Phase 1)
  - `plans/260602-sp2-check-grounding/phase-02-check-and-refresh-tools.md` (Phase 2)
  - `plans/260602-sp2-check-grounding/phase-03-manifest-registration.md` (Phase 3)
  - `plans/260602-sp2-check-grounding/phase-04-acceptance-test.md` (Phase 4)
- Modify:
  - `tools/learning-loop-mcp/core/meta-state.js` (2 new optional fields on `metaStateFindingEntrySchema`)
  - `tools/learning-loop-mcp/tools/meta-state-report-tool.js` (handler extended to accept `mechanism_check`)
  - `meta-state.jsonl` (1 new entry appended, only if G8 recurred)
- Delete: none

## Implementation Steps

1. **Verify the 3 related meta plans are `completed`.** (Already confirmed: SP0 is `completed`; SP1 is `completed`; self-enforcing-loop is `completed`.)
2. **The `ck plan create` invocation was blocked by the G8 false positive during plan creation.** The 6 plan files were scaffolded via the `Create` tool directly. The cook session records the recurrence via `mcp__learning_loop_mcp__meta_state_report` (entry JSON inlined in `plan.md`).
3. **Verify the 6 plan files exist** in `plans/260602-sp2-check-grounding/`.
4. **Extend `metaStateFindingEntrySchema`:** add `mechanism_check` and `code_fingerprint` to `tools/learning-loop-mcp/core/meta-state.js` (after `status`, before the closing brace).
5. **Extend `metaStateReportTool` handler:** add `mechanism_check` to the destructuring (line 14-22 of `meta-state-report-tool.js`); include `...(mechanism_check !== undefined && { mechanism_check })` in the entry construction.
6. **Run `pnpm test`** — all 512 existing tests still pass (no behavior change, purely additive schema + 1 destructure extension).
7. **Run `pnpm validate:records`** — passes (new optional fields don't break existing entries).
8. **Run `pnpm validate:plan-loop`** — passes (no plan changes in this phase).
9. **If a G8 entry was recorded**, cross-link it with the `createdBy` field in `plan.md` and the `evidence.plan_ref` field in the entry.

## Success Criteria

- [ ] All 6 plan files exist in `plans/260602-sp2-check-grounding/` and are non-empty
- [ ] `metaStateFindingEntrySchema` has 2 new optional fields (`mechanism_check`, `code_fingerprint`)
- [ ] `metaStateReportTool` handler accepts and stores `mechanism_check`
- [ ] If G8 recurred, the meta-state entry is recorded with the new ID and the `g8-subcommand-class-entry.test.js` smoke test continues to pass
- [ ] `pnpm test` passes (512 existing tests; 0 new tests in this phase)
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: adding 2 new optional fields breaks the 18 existing entries.** Mitigation: both fields are `z.optional()`. Existing entries load with `undefined` values. No migration needed. Verifiable by `pnpm test` (all 512 tests pass after the schema change).
- **Risk: extending the report tool's handler breaks the existing 8-field report test.** Mitigation: the extension is purely additive (1 more destructure field, 1 more spread clause). The existing test still passes; T-33 (Phase 1 or Phase 2) adds a new test for the `mechanism_check` parameter.
- **Risk: the operator does not run the meta-state report when G8 recurs.** Mitigation: the entry JSON is inlined in `plan.md` (SP0 pattern) so the cook can paste it. The cook workflow always includes `meta_state_report` for any unrecorded findings.
- **Risk: the G8 fix is never implemented.** Mitigation: each recurrence records a fresh entry, so the pattern is visible to all agents via `loop_describe({tier:"warm"}).anti_patterns`. Future planners see it during their cross-plan scan.
- **Risk: the `Create` tool fallback is hidden from future agents.** Mitigation: the `createdBy` field in `plan.md` frontmatter explicitly notes the fallback. The meta-state entry documents the rationale.

---
phase: 0
title: "G8 Observation + Plan Scaffolding"
status: completed
priority: P2
effort: "0.25h"
dependencies: []
---

# Phase 0: G8 Observation + Plan Scaffolding

## Overview

Records any live recurrence of the G8 subcommand-class false positive hit during this plan's scaffolding (the SP0 plan documented 4 recurrences; this plan continues the pattern). Captures the recurrence if it occurs, then scaffolds `plan.md` + 5 phase files via the `Create` tool (AGENTS.md-documented fallback when `ck plan create` is blocked by the G8 false positive). No code changes in this phase; Phase 1 begins the TDD work.

## Requirements

- Functional:
  - If `ck plan create` is blocked by the G8 false positive, record the recurrence in `meta-state.jsonl` via `mcp__learning_loop_mcp__meta_state_report`
  - All 6 plan files (plan.md + 5 phase files) exist in `plans/260602-sp1-derive-status/`
  - Cross-link the new meta-state entry (if any) with the `createdBy` field in `plan.md`
- Non-functional:
  - No code changes to the gate
  - No `pnpm test` regressions (this phase ships 0 new tests; the entry is recorded by the cook if G8 recurs)
  - The 3 related meta plans (260602-sp0-log-change, 260602-self-enforcing-loop, 260602-meta-state-lifecycle-tidy) are all `completed` — no in-flight cross-plan dependencies

## Architecture

The G8 false positive is a known class of false positives (subcommand-name + commit-message matching). The pattern `propose|design|create|new\s+(schema|artifact|directory|convention)` matches bare `create` and the word `design` regardless of context. SP0's plan documented 4 recurrences (the latest is `meta-260602T1635Z-fourth-documented-g8-recurrence-and-a-partial-regression-of`). This plan's scaffolding follows the same pattern: use the `Create` tool directly to scaffold plan files; if a fresh G8 hit occurs during the `ck plan create` invocation, record it.

If G8 does NOT recur (e.g., the operator has refined the rule), no meta-state entry is recorded; the plan files are created directly. The smoke test in `__tests__/g8-subcommand-class-entry.test.js` continues to pass.

## Related Code Files

- Create:
  - `plans/260602-sp1-derive-status/plan.md` (this plan)
  - `plans/260602-sp1-derive-status/phase-00-g8-observation-and-scaffolding.md` (this file)
  - `plans/260602-sp1-derive-status/phase-01-pure-function-derive-status.md` (Phase 1)
  - `plans/260602-sp1-derive-status/phase-02-derive-status-tool.md` (Phase 2)
  - `plans/260602-sp1-derive-status/phase-03-manifest-registration.md` (Phase 3)
  - `plans/260602-sp1-derive-status/phase-04-acceptance-test.md` (Phase 4)
- Modify:
  - `meta-state.jsonl` (1 new entry appended, only if G8 recurs)
- Delete: none

## Implementation Steps

1. **Verify the 3 related meta plans are `completed`.** (Already confirmed: SP0 is `completed`; self-enforcing-loop is `completed`; meta-state-lifecycle-tidy is `completed`.)
2. **Attempt `ck plan create`** to scaffold the plan. If the gate blocks with the G8 false positive, record a fresh entry via `mcp__learning_loop_mcp__meta_state_report` (cook session has direct access; see SP0 Phase 0 for the entry template). If the gate does NOT block (the rule has been refined), proceed directly.
3. **Verify the plan files exist** in `plans/260602-sp1-derive-status/`. The pre-plan scaffolding created `plan.md` and 5 phase files (this file + 4 others); the cook's job is verification, not creation.
4. **If a G8 entry was recorded**, cross-link it with the `createdBy` field in `plan.md` and the `evidence.plan_ref` field in the entry.
5. **Verify the G8 smoke test still passes:** `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` asserts that at least one meta-state entry has `subtype: "gate-bug"` AND description contains `"subcommand-class false positive"`. The new entry (if any) adds to the set; the test continues to pass.

## Success Criteria

- [ ] All 6 plan files exist in `plans/260602-sp1-derive-status/` and are non-empty
- [ ] If G8 recurred, the meta-state entry is recorded with the new ID and the `g8-subcommand-class-entry.test.js` smoke test continues to pass
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: the operator does not run the meta-state report when G8 recurs.** Mitigation: include the entry JSON inline in the plan (SP0 pattern) so the cook can paste it. The cook workflow always includes `meta_state_report` for any unrecorded findings.
- **Risk: the G8 fix is never implemented.** Mitigation: each recurrence records a fresh entry, so the pattern is visible to all agents via `loop_describe({tier:"warm"}).anti_patterns`. Future planners see it during their cross-plan scan.
- **Risk: the `Create` tool fallback is hidden from future agents.** Mitigation: the `createdBy` field in `plan.md` frontmatter explicitly notes the fallback (matches the SP0 pattern). The meta-state entry documents the rationale.

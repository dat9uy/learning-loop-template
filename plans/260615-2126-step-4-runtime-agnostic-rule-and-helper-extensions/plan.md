---
title: Runtime-agnostic rule closure + helper extensions (Step 4)
description: >-
  Ships Step 4 of the planning-order decision (Report 2 Phases 2-5 + 2.5a/b/c
  helper extensions). Adds 3 new helper functions to core/surfaces.js
  (appendToAllSurfaces, readJsonlFromAllSurfaces, readModifyWriteOnAllSurfaces)
  to complete the Simplification Cascade thesis; refactors Step 2's hand-rolled
  code (gate-decision-log.js, gate-override.js) to use them; ships the
  runtime-agnostic regression test, the new consult-checklist pattern type, the
  new check_runtime_agnostic MCP tool, the rule entry, the AGENTS.md amendment,
  and the loop_describe discoverability hint. Closes the rule; future features
  are runtime-agnostic by design.
status: pending
priority: P2
branch: 260614-1259-phase-b-codegen-adoption
tags:
  - meta
  - runtime-agnostic
  - surfaces
  - helper-extension
  - planning-order-step-4
  - tdd
  - consult-checklist
blockedBy:
  - 260615-1500-surfaces-helper-and-refactors
  - 260615-1530-bash-gate-debate-stderr-override-recurrence
blocks:
  - 260615-CLEANUP-batch-cleanup-after-planning-order
created: '2026-06-15T14:30:17.538Z'
createdBy: 'ck:plan'
source: skill
related:
  - >-
    plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md
    (Report 2 — the design this plan implements Phases 2-5 of)
  - >-
    plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md
    (Report 1 — Step 2's hand-rolled code is refactored in this plan's Phases
    1-3)
  - >-
    plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md
    (the planning-order report; this plan is Step 4 of 4)
  - >-
    plans/reports/code-reviewer-260615-1630-bash-gate-step-2-spec-deviations.md
    (the post-ship review; § I-1 is the Q3 this plan resolves)
  - >-
    tools/learning-loop-mcp/core/surfaces.js (the helper being extended in
    Phases 1-3)
  - >-
    tools/learning-loop-mcp/core/gate-decision-log.js (Phase 1 + 2 refactor
    target; lines 37-46, 65-77)
  - >-
    tools/learning-loop-mcp/core/gate-override.js (Phase 3 refactor target;
    lines 108-140)
  - >-
    tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (Phase 5
    target; lines 730-792)
  - >-
    tools/learning-loop-mcp/agent-manifest.json (Phase 6 target; add
    runtime_agnostic group)
  - >-
    tools/learning-loop-mcp/core/loop-introspect.js#DISCOVERABILITY_HINTS (Phase
    7 target; lines 95-106)
  - AGENTS.md (Phase 7 target; new §2 subsection "Runtime-Agnostic Pattern")
---

# Runtime-agnostic rule closure + helper extensions (Step 4)

## Overview

Implements Step 4 of the cross-report planning order. Closes the runtime-agnostic rule (Report 2 Phases 2-5) and **completes the Simplification Cascade thesis** by adding 3 missing helper functions to `core/surfaces.js` (`appendToAllSurfaces`, `readJsonlFromAllSurfaces`, `readModifyWriteOnAllSurfaces`) and refactoring Step 2's hand-rolled code to use them.

The 8 phases are sequential and independently shippable:

| Block | Phase | What ships | Why in this position |
|-------|-------|------------|----------------------|
| **Helper API completion (Phases 1-3)** | 1 | `appendToAllSurfaces` helper + refactor `gate-decision-log.js#appendDecisionLog` | Completes the helper's API; eliminates the first hand-rolled loop |
| | 2 | `readJsonlFromAllSurfaces` helper + refactor `gate-decision-log.js#readDecisionLog` | Completes the helper's read API; eliminates the second hand-rolled loop |
| | 3 | `readModifyWriteOnAllSurfaces` helper + refactor `gate-override.js#writeGateOverride` | Completes the helper's mutation API; eliminates the third hand-rolled loop |
| **Rule closure (Phases 4-7)** | 4 | `__tests__/runtime-agnostic.test.js` (regression test) | Asserts the pattern is now complete; catches future violations |
| | 5 | `consult-checklist` pattern type in `applyPromotedRules` | Recognizes the new rule shape; no-op for command-time |
| | 6 | `check_runtime_agnostic` MCP tool | Audit surface; agents call it when adding a new feature |
| | 7 | Rule entry + AGENTS.md amendment + `loop_describe` hint | Rule is discoverable, codified, documented |
| **Close the planning-order sequence (Phase 8)** | 8 | Annotate `plans/reports/brainstorm-260615-1430-...md` — mark Step 4 `✅ shipped`, flip report `status: in-progress → complete`, annotate Q3 RESOLVED, mark 3 Step 2 cleanup items `→ RESOLVED by Step 4` | Closing tracking artifact; mirrors Step 1 P4, Step 2 P5, Step 3 P3. Step 4 is the LAST step, so the report's `status` flips to `complete`. |

**Why this order (helper-extensions-first, then rule-closure):**

1. **Simplification Cascade completes before the rule ships.** The rule's checklist item #5 ("use the surfaces.js helper") is enforceable only when the helper covers all cross-surface patterns. Extending the helper first means future features start in a "helper covers 100%" world; the rule's enforcement is honest.
2. **Step 2's spec drift is resolved before the rule references it.** The planning-order report's § Cross-surface discipline section in Step 2's plan said the helper would be used; the code didn't. Refactoring the code in Phases 1-3 aligns the spec with the implementation, so Phase 4's regression test asserts a clean state.
3. **No "half-applied thesis".** The planning-order report's whole thesis was that the helper is the one insight. Step 2 partially applied it. Step 4 completes the application.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [appendToAllSurfaces-helper](./phase-01-appendtoallsurfaces-helper.md) | Pending |
| 2 | [readJsonlFromAllSurfaces-helper](./phase-02-readjsonlfromallsurfaces-helper.md) | Pending |
| 3 | [readModifyWriteOnAllSurfaces-helper](./phase-03-readmodifywriteonallsurfaces-helper.md) | Pending |
| 4 | [runtime-agnostic-regression-test](./phase-04-runtime-agnostic-regression-test.md) | Pending |
| 5 | [consult-checklist-pattern-type](./phase-05-consult-checklist-pattern-type.md) | Pending |
| 6 | [check-runtime-agnostic-mcp-tool](./phase-06-check-runtime-agnostic-mcp-tool.md) | Pending |
| 7 | [rule-entry-and-discoverability](./phase-07-rule-entry-and-discoverability.md) | Pending |
| 8 | [annotate-planning-order-report](./phase-08-annotate-planning-order-report.md) | Pending |

## TDD structure

Phases 1-3 follow red-green-refactor: write the test for the new helper, confirm RED (or assert the desired contract in a new test for the helper), ship the implementation, refactor the call site. Phase 4 is greenfield (regression test asserts existing patterns). Phases 5-6 are greenfield additions (no existing tests to break). Phase 7 is meta-state + documentation (no code tests). Phase 8 is a post-ship tracking step (annotate the planning-order report; no code, no tests).

| Phase | Test added (RED) | Implementation (GREEN) | Refactor |
|-------|------------------|------------------------|----------|
| 1 | `__tests__/surfaces-append.test.js` (3 tests) | `core/surfaces.js#appendToAllSurfaces` | `core/gate-decision-log.js#appendDecisionLog` |
| 2 | `__tests__/surfaces-read-jsonl.test.js` (3 tests) | `core/surfaces.js#readJsonlFromAllSurfaces` | `core/gate-decision-log.js#readDecisionLog` |
| 3 | `__tests__/surfaces-rmw.test.js` (3 tests) | `core/surfaces.js#readModifyWriteOnAllSurfaces` | `core/gate-override.js#writeGateOverride` |
| 4 | `__tests__/runtime-agnostic.test.js` (10 tests) | (asserts existing pattern) | n/a |
| 5 | (no new test) | `core/gate-logic.js#applyPromotedRules` adds `consult-checklist` branch | n/a |
| 6 | `__tests__/check-runtime-agnostic-tool.test.js` (4 tests) | `tools/check-runtime-agnostic-tool.js` | n/a |
| 7 | (no new test) | `meta-state.jsonl` rule entry + `AGENTS.md` + `DISCOVERABILITY_HINTS` | n/a |
| 8 | (no new test) | (annotate planning-order report; flip status; mark 3 Step 2 items RESOLVED) | n/a |

## Dependencies

**Same-scope blocks** (this plan is blocked by):
- `260615-1500-surfaces-helper-and-refactors` — Step 1's `core/surfaces.js` helper is the foundation for Phases 1-3. **Shipped 2026-06-15.**
- `260615-1530-bash-gate-debate-stderr-override-recurrence` — Step 2's hand-rolled code is the refactor target in Phases 1-3. **Shipped 2026-06-15.**

**Same-scope blocked** (this plan unblocks):
- `260615-CLEANUP-batch-cleanup-after-planning-order` — the cosmetic + hygiene cleanup batch (Step 1's 5 items + Step 2's 5 items + Step 3's 0 items + this plan's ~0-2 items). Step 4's helper extensions REMOVE 3 items from the Step 2 cleanup backlog (items 2.1, 2.2 partially, 2.4) because the underlying drift is resolved.

**Why 3 cleanup items disappear:** Step 2's cleanup backlog had:
- 2.1: hand-rolled cross-surface loops in `gate-override.js` and `gate-decision-log.js` → RESOLVED by Phases 1-3.
- 2.2: `appendFileSync` vs write-temp+rename in `gate-decision-log.js` → RESOLVED by Phase 1 (the helper's `appendToAllSurfaces` uses `appendFileSync` per surface; the spec is now correct).
- 2.4: `recurrence-check-on-start.js` reads stdin without comment → NOT in this plan's scope; remains in CLEANUP.

The remaining 7 items (Step 1: 1.1-1.5, Step 2: 2.3, 2.5) ship in the CLEANUP plan.

## Test plan

| Phase | Test file | Test count | Coverage |
|-------|-----------|------------|----------|
| 1 | `__tests__/surfaces-append.test.js` (NEW) | 3 | `appendToAllSurfaces` creates files, appends to existing, fail-open |
| 2 | `__tests__/surfaces-read-jsonl.test.js` (NEW) | 3 | `readJsonlFromAllSurfaces` parses JSONL, dedupes across surfaces, returns sorted |
| 3 | `__tests__/surfaces-rmw.test.js` (NEW) | 3 | `readModifyWriteOnAllSurfaces` reads, applies modifier, writes atomically |
| 4 | `__tests__/runtime-agnostic.test.js` (NEW) | 10 | asserts cross-surface pattern: no hard-coded paths, helper is the API, SURFACES is the source of truth, shims exist, manifest is registered |
| 5 | (no new test) | 0 | existing tests verify no regression; `applyPromotedRules` continues to return `ok` for non-matching rules |
| 6 | `__tests__/check-runtime-agnostic-tool.test.js` (NEW) | 4 | tool returns structured feedback; respects all 6 checklist items; emits `fix_suggestion` on failure |
| 7 | (no new test) | 0 | meta-state entry is data; AGENTS.md is prose; `loop_describe` is covered by `loop-describe-warm-tier.test.js` extension |
| 8 | (no new test) | 0 | post-ship tracking step; annotate planning-order report; flip `status: in-progress → complete`; mark 3 Step 2 cleanup items `→ RESOLVED by Step 4`; mark Q3 RESOLVED |

**Total new tests: 23.** Combined with the existing 949/950 baseline (1 skipped), the post-ship test count is **972/973 (1 skipped)**.

**Phase 8 unique consideration**: the planning-order report's `status: in-progress` flips to `status: complete` (Steps 1-3 all kept it `in-progress` because the sequence wasn't done). Step 4 is the LAST step, so the flip happens in Phase 8. The 3 Step 2 cleanup items (2.1, 2.2, 2.4) are annotated as `→ RESOLVED by Step 4 Phases 1-3` rather than removed (audit trail).

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Phase 1-3 refactors regress Step 2's existing behavior (13 + 5 + 8 = 26 existing tests in `gate-override.test.js`, `gate-decision-log.test.js`, `gate-recurrence.test.js`) | The refactors are small (10-15 lines each); the existing tests cover the behavior. If a test fails, the refactor is wrong — revert and re-do. |
| `readModifyWriteOnAllSurfaces` has a complex contract (per-surface read-modify-write with merge semantics); the helper's first implementation may not match `gate-override.js`'s intent | Phase 3's RED tests pin the contract precisely (3 specific scenarios: append to existing, replace with new, empty case). Implementation must pass these before refactor. |
| `consult-checklist` pattern type in Phase 5 may break rule loading (the gate expects only known pattern types) | The branch is a no-op `continue` (matches the existing `resolution-evidence-required` pattern at line 749-755). The rule loads correctly; the gate ignores it. Verified by reading the existing pattern. |
| The 6-item checklist in Phase 7's rule entry is a JSON blob; future agents parsing the registry may not handle it | The `pattern_type: "consult-checklist"` is a new shape; the rule's `description` field carries the human-readable form. The `check_runtime_agnostic` tool (Phase 6) is the canonical parser. |
| `check_runtime_agnostic` (Phase 6) has 6 verification predicates; some may be too strict (false positives) | The tool's output includes `fix_suggestion` for each failure; the agent can see why. The predicates are conservative (only assert existing patterns, not invent new ones). Matches Report 2's Position 4 spec. |
| Step 2's spec text in `plans/260615-1530-.../plan.md` says "write-temp + rename" but the code uses `appendFileSync`; the helper's `appendToAllSurfaces` uses `appendFileSync` (intentional) | Phase 1's plan includes a "Spec alignment" subsection: the existing plan text is annotated to clarify the append semantics. The helper's behavior is the source of truth; the plan's spec text is updated to match. |

## Unresolved questions

None at the start of Step 4. The 3 questions from the planning-order report are resolved:

- **Q1 (RESOLVED 2026-06-15)**: `skipped_via_override` field is aspirational. CLEANUP batch will remove from plan's decision shape.
- **Q2 (RESOLVED 2026-06-15)**: Recurrence-tracker direct writes accepted. Post-4-step brainstorm will reconsider MCP-mediation.
- **Q3 (RESOLVED 2026-06-15 21:26 — this plan)**: Helper extensions ship in Step 4 as Phases 1-3. Step 2's spec drift is resolved by the refactors. The Simplification Cascade is complete.

## Next Steps

After this plan ships:
1. The CLEANUP batch plan (`260615-CLEANUP-batch-cleanup-after-planning-order`) ships the 7 remaining cosmetic items.
2. A follow-up brainstorm (post-4-step) considers MCP-mediation for `recurrence-tracker.js#checkAndEmit` (Q2 follow-up).
3. The `simplification-cascade-complete` change-log entry marks the planning-order sequence as closed.

## Plan completeness check (8 phases)

After Phase 8 ships, the planning-order report's `status: complete` is the final marker. The plan closes the sequence; no further work is required for the original 4-step planning-order decision.

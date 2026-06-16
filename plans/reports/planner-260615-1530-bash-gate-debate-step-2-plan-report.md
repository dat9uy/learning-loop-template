---
title: "Planner + Validation report: Step 2 (bash-gate-debate: decision visibility + override + log + recurrence)"
description: "Created + validated plans/260615-1530-bash-gate-debate-stderr-override-recurrence/ with 4 TDD-structured phases. Standard-tier verification caught 2 unverified load-bearing claims + 1 architectural error; 5-question critical-questions interview produced 5 design refinements that were propagated to phase files. Plan validates clean (0 errors, 0 warnings); 4 tasks hydrated; ready for /ck:cook handoff."
date: "2026-06-15T13:55:00Z"
tags: [meta, planner, plan-creation, validation, tdd, bash-gate, planning-order-step-2, hookSpecificOutput, sessionstart-hook]
status: in-progress
session: 260615-step-2-plan-and-validate
related:
  - plans/260615-1530-bash-gate-debate-stderr-override-recurrence/ (the plan)
  - plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md (Report 1 — the source design)
  - plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md (the planning-order report; this plan is Step 2 of 4)
  - plans/260615-1500-surfaces-helper-and-refactors/ (Step 1 — the dependency)
---

# Planner + Validation report: Step 2 plan creation and validation

## TL;DR

Created `plans/260615-1530-bash-gate-debate-stderr-override-recurrence/` with 4 TDD-structured phases. **Standard-tier verification** (4 phases → Fact Checker + Contract Verifier, 14 claims total) caught **2 UNVERIFIED load-bearing claims** + **1 architectural error**. A **5-question critical-questions interview** produced 5 design refinements that were propagated to all affected phase files. Plan validates clean (0 errors, 0 warnings). 4 tasks hydrated. Ready for `/ck:cook` handoff.

## Plan structure

| Phase | Component | New files | Effort | Dependencies |
|-------|-----------|-----------|--------|--------------|
| 1 | decision visibility (hookSpecificOutput on stdout) | 1 helper + 1 test | 1.5h | — |
| 2 | override marker + `gate_override` tool | 1 core + 1 tool + 1 test | 3h | Phase 1 |
| 3 | decision log (`.gate-decision.log`) | 1 core + 1 test | 2h | Phases 1+2 |
| 4 | recurrence tracker + new SessionStart hook + `gate_check_recurrence` | 1 core + 1 tool + 1 hook + 2 wrappers + 1 test | 4h | Phases 1+2+3 |
| 5 | annotate planning-order report (mark Step 2 complete) | 0 (markdown edit only) | 15m | Phases 1+2+3+4 |

**Total: ~11h** across 5 phases; **~24 new tests**; 2 new MCP tools; 1 new SessionStart hook; 1 post-ship tracking step.

## Verification pass (Standard tier)

- 14 claims checked; 12 verified; 0 failed; **2 unverified**.
- **Unverified #1**: "Both Claude Code and Droid CLI surface stderr to the model on exit-2" — no confirmation in AGENTS.md, protocol-adapter.js, or hooks/. Resolved in Session 1: use `hookSpecificOutput` on stdout instead.
- **Unverified #2**: "Hook runtime still parses stdout for `decision: "ok"`" — no documentation; current code at line 121 is silent (no `console.log` for ok). Resolved in Session 1: ok path stays silent; block/escalate uses `hookSpecificOutput`.
- **Architectural error**: Phase 4 plan said "wire into `inbound-gate.js` (SessionStart hook)" but `inbound-gate.js` is a **UserPromptSubmit** hook per its comment line 4 and AGENTS.md §2. Resolved in Session 1: new SessionStart hook.

## Validation Session 1 (5 questions, all recommended answers chosen)

| # | Question | Decision | Impact |
|---|----------|----------|--------|
| 1 | Phase 1 output channel | `hookSpecificOutput` on stdout (matches `formatSoftWarning` contract) | Phase 1: replaces `process.stderr.write` with `formatHookDecision(decision, { channel: "hookSpecificOutput" })` |
| 2 | Phase 4 hook binding | New `recurrence-check-on-start.js` SessionStart hook (NOT `inbound-gate.js`) | Phase 4: new universal hook + 2 .cjs wrappers + 2 surface settings updates |
| 3 | Phase 2 override read semantics | First valid wins (.claude → .factory) | Phase 2: explicit callout in Architecture section |
| 4 | Phase 4 auto-file concurrency | Accept duplicates (read-time dedup is sufficient) | Phase 4: race-condition note in Risk Assessment |
| 5 | Phase 3 log rotation | Ship without rotation; follow-up plan when file grows | Phase 3: explicit "Validation Session 1 decision" note in Risk Assessment |

## Cross-cutting concerns addressed

- **Cross-surface consistency:** all 4 components write to / read from both `.claude/coordination/` and `.factory/coordination/` via the helper's `SURFACES` constant.
- **Fail-open on log writes:** the decision log and recurrence tracker swallow write errors; the gate's contract (exit code) is preserved.
- **No bypass of the meta-surface:** override + recurrence both go through MCP tools (canonical) and write to the meta-state registry (auditable). No env-var shortcuts.
- **Side-effect-import and hard-block rules are NOT overridable.** The override applies only to the `applyPromotedRules` loop (regex/glob promoted rules). Constraint patterns and path writes remain unconditional.
- **Universal channel:** Phase 1 uses the existing `formatSoftWarning` contract (envelope shape) — no new assumptions about the hook runtime, no surface-specific code.

## Validation results

```
ck plan validate plan.md
[OK] No issues found — 4 phases detected
[OK] Valid — 0 errors, 0 warnings
```

`ck plan status` confirms:
- `Blocked By: [OK] 260615-1500-surfaces-helper-and-refactors` (shipped, dependency satisfied)
- `Blocks: [!] 260615-runtime-agnostic-rule-phases-2-5 (not found)` — forward reference; resolves when Step 4 is planned

## Tasks hydrated

| Task # | Subject | Blocked by |
|--------|---------|------------|
| 1 | Phase 1: decision visibility | — |
| 2 | Phase 2: override marker + tool | Task 1 |
| 3 | Phase 3: decision log | Tasks 1, 2 |
| 4 | Phase 4: recurrence tracker | Tasks 1, 2, 3 |
| 5 | Phase 5: annotate planning-order report | Tasks 1, 2, 3, 4 |

The 3-Task Rule (skip hydration for <3 phases) is satisfied (5 phases → hydrate).

**Phase 5 (added post-validation per operator request):** the plan now includes a post-ship tracking step that annotates `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` to mark Step 2 complete (mirrors Step 1 Phase 4's pattern: append Shipped status row, prefix TL;DR Step 2 with ✅, add cleanup-backlog items). 15 minutes, no code, no tests. This is the same convention used by Step 1.

## Propagation artifacts (per Whole-Plan Consistency Sweep)

The 5 decisions were propagated to 4 files (plan.md + 3 phase files). 2 stale references were caught and fixed in a second sweep (test plan section in plan.md; Phase 4 Requirements section). Final sweep: 0 unresolved contradictions.

## Open questions (resolved during planning + validation)

- **Phase 1 output channel** — `hookSpecificOutput` on stdout (matches `formatSoftWarning`); NOT stderr. Resolved in Validation Session 1.
- **Phase 4 hook binding** — new SessionStart hook; NOT `inbound-gate.js` (which is UserPromptSubmit). Resolved in Validation Session 1.
- **Phase 2 override read** — first valid wins (.claude → .factory); NO merge. Resolved in Validation Session 1.
- **Phase 4 auto-file race** — accept duplicates; read-time dedup is sufficient. Resolved in Validation Session 1.
- **Phase 3 log rotation** — ship without; follow-up plan when file grows. Resolved in Validation Session 1.
- **`command_prefix_normalized` algorithm** — first 50 chars + remove quotes + collapse whitespace. Spec in `phase-04-recurrence-tracker.md`.
- **Override marker caching** — 1-second cache per root, mtime-based invalidation, matching `loadPromotedRules` pattern.
- **`writeToAllSurfaces` vs `appendFileSync` for the decision log** — caught during Phase 3 design; uses `appendFileSync` directly with `SURFACES` from the helper.

## Next step

Recommend `/ck:cook` (plan validates clean, design is locked, 0 unresolved contradictions). The 5-question validation pass closed the load-bearing UNVERIFIED claims and the architectural error; the design is implementation-ready.

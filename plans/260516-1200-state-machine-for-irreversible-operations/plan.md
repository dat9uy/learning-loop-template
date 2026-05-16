---
title: "State-Machine Layer for Irreversible Operations"
status: completed
created: 2026-05-16
brainstorm: plans/reports/brainstorm-20260516-state-machine-for-irreversible-operations.md
phases:
  - id: 1
    title: "Rules + Budget Schema"
    status: completed
  - id: 2
    title: "Budget Checker Tool"
    status: completed
  - id: 3
    title: "Skill Workflow Enhancement"
    status: completed
  - id: 4
    title: "Validation + Retroactive Test"
    status: completed
---

# State-Machine Layer for Irreversible Operations

## Problem

Learning loop has no concept of irreversibility. Agents rationalize past documented constraints because nothing structurally stops them. Three documented failures: skipped reading, rationalized past constraints, no definition of "failure."

## Solution

Add resource budget tracking + hard-stop enforcement. Learning-loop skill becomes gatekeeper: checks state before producing prompts, blocks when budget exhausted. Skill calls `pnpm check:budget` as primary data source; tool returns JSON with values the skill embeds in prompts.

## Key Decisions

- Skill calls `pnpm check:budget` for state (single source of truth); no direct YAML reading
- check-budget tool is a single self-contained file (~50 lines), not modular
- Operator-only budget updates (agent never mutates budget file)
- Validation window is field on budget YAML (single file, single check)
- Fixed 7-day staleness threshold
- Minimum viable test: 2 structural tests (budget exhausted → block, budget available → constrained prompt)

## Validation Log

### Session 1 — 2026-05-16
**Trigger:** Pre-implementation validation
**Questions asked:** 3

#### Verification Results
- **Tier:** Standard (4 phases → Fact Checker + Contract Verifier)
- **Claims checked:** 10
- **Verified:** 8 | **Failed:** 0 | **Unverified:** 2

#### Questions & Answers

1. **[Architecture]** How does the skill 'read' budget YAML?
   - Options: Skill instructs agent to Read file | Skill calls pnpm check:budget | Both
   - **Answer:** Skill calls pnpm check:budget
   - **Rationale:** Skill is a Claude skill (SKILL.md), not executable code. Tool is single source of truth.

2. **[Architecture]** Should check-budget follow validate-records modular pattern or be single file?
   - Options: Single file (Recommended) | Match validate-records pattern
   - **Answer:** Single file
   - **Rationale:** YAGNI — ~50 lines, no modular split needed.

3. **[Assumptions]** Staleness threshold: configurable or fixed?
   - Options: Fixed 7 days (Recommended) | Configurable per budget | No staleness check
   - **Answer:** Fixed 7 days
   - **Rationale:** Simple, covers weekly sessions.

#### Confirmed Decisions
- Tool is primary data source (not backup): skill calls `pnpm check:budget`
- check-budget is single self-contained file
- Fixed 7-day staleness threshold

#### Action Items
- [x] Update plan.md key decisions
- [x] Update phase-02 to single-file pattern
- [x] Update phase-03 to call tool instead of direct YAML read
- [x] Update brainstorm report Q1 decision

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04
- Decision deltas checked: 3 (tool primary, single file, fixed staleness)
- Reconciled stale references: 2 (brainstorm report lines 157, 237)
- Unresolved contradictions: 0

## Source

- Brainstorm: `plans/reports/brainstorm-20260516-state-machine-for-irreversible-operations.md`
- Trigger journal: `docs/journals/260515-loop-harness-context-gate-discussion.md`
- Phase2 critique: `docs/journals/260516-vnstock-phase2-validation-session-critique.md`

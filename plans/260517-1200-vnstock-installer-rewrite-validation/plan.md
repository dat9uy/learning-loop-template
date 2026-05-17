---
title: "Vnstock Installer Rewrite Validation"
description: "Validate the rewritten install-vnstock.sh under the new state-machine enforcement layers. Adds stale-container guard to install script, then runs single-slot Docker validation with fresh-environment protocol."
status: pending
priority: P1
branch: "main"
tags: [vnstock, validation, state-machine, budget, tdd]
blockedBy: []
blocks: []
created: "2026-05-17T04:54:35.836Z"
createdBy: "ck:plan"
source: skill
brainstorm: plans/reports/brainstorm-20260517-vnstock-installer-rewrite-readiness.md
---

# Vnstock Installer Rewrite Validation

## Overview

Validate the rewritten `install-vnstock.sh` under the new state-machine enforcement layers (budget checker, resource-budget rules, skill coordinator). One code change: add stale-container guard to install script (TDD). One validation run in Docker (1 slot). Evidence capture and budget update afterward.

**Key constraint:** 1 device slot available. Budget checker is the gate. ANY failure = STOP.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Pre-Validation Check](./phase-01-pre-validation-check.md) | Pending |
| 2 | [Install Script Stale-Container Guard](./phase-02-install-script-stale-container-guard.md) | Pending |
| 3 | [Validation Run](./phase-03-validation-run.md) | Pending |
| 4 | [Post-Validation and Evidence](./phase-04-post-validation-and-evidence.md) | Pending |

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Validation only (no script rewrite) | Phase 1 of archived plan already done |
| TDD | Yes (Phase 2 only) | Only phase that modifies code |
| Docker reuse prevention | Install script guard + plan rule | Defense in depth |
| Host-side import protection | Plan rule (no host imports during window) | Docker provides structural protection for validation |
| Capability testing | Deferred to separate plan | Single slot; don't risk it on capability scripts |
| Docker execution model | Single `bash -c` batch command (not interactive) | Agent has no PTY; `-it` flag fails in non-interactive bash |
| Docker volume isolation | Named volume for `.venv` | `uv sync` through bind mount mutates host filesystem |
| Budget checker window gate | Add `validation_window_active` exit 1 to check-budget.js | Structural enforcement, not just JSON reporting |

## Dependencies

- State-machine plan (`260516-1200-state-machine-for-irreversible-operations`) — completed
- Skill coordinator plan (`260517-0900-learning-loop-skill-coordinator`) — completed
- Resource budget rules (`.claude/skills/learning-loop/references/resource-budget-rules.md`) — updated with rules 8-10

## Source

- Brainstorm: `plans/reports/brainstorm-20260517-vnstock-installer-rewrite-readiness.md`
- Archived plan: `plans/260515-vnstock-installer-rewrite/plan.md.archived-20260516`
- Phase2 critique: `docs/journals/260516-vnstock-phase2-validation-session-critique.md`
- Install script: `product/api/scripts/install-vnstock.sh`

## Red Team Review

### Session — 2026-05-17
**Findings:** 15 deduplicated from 30 raw (3 reviewers)
**Severity breakdown:** 4 Critical, 5 High, 7 Medium (1 accepted + 1 merged)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Docker `-it` requires TTY, agent has no PTY | Critical | Accept | Phase 3 (bash -c batch) |
| 2 | `--force` only removes `device.id`, not `.vnstock` | Critical | Accept | Phase 2 (--force cleanup) |
| 3 | Guard insertion line contradicts (172 vs 178) | Critical | Accept | Phase 2 (line ref fix) |
| 4 | Budget checker doesn't enforce `validation_window_active` | Critical | Accept | Phase 1 + check-budget.js |
| 5 | `product/api/.vnstock` not checked in Phase 1 | High | Accept | Phase 1 (add check) |
| 6 | `uv sync` modifies host `.venv` through bind mount | High | Accept | Phase 3 (named volume) |
| 7 | Phase 2 Step 5 doesn't verify guard in real env | High | Accept | Phase 2 (add Step 5b) |
| 8 | Test deleted in Step 6, zero regression protection | High | Accept | Phase 2 (keep test) |
| 9 | test_vci_smoke.py referenced but never run | High | Accept | Phase 3 (remove ref) |
| 10 | Test mock `sha256sum` produces empty hash | Medium | Accept | Phase 2 (fix mock) |
| 11 | Test mock `realpath` produces empty `API_HOME` | Medium | Accept | Phase 2 (fix mock) |
| 12 | Test doesn't mock system Python `requests` check | Medium | Accept | Phase 2 (add mock) |
| 13 | Idempotency check line range 168-172 should be 168-178 | Medium | Accept | Phase 1 (fix range) |
| 14 | Phase 1 refs capability scripts but never reads them | Medium | Accept | Phase 1 (remove ref) |
| 15 | Phase 4 budget YAML snippet incomplete | Medium | Accept | Phase 4 (diff format) |

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04
- Stale "line 172" references: 0 (all corrected to 178)
- `test_vci_smoke` references: 0 in phase files (removed from Phase 3 Related Code Files)
- Capability script references in Phase 1: 0 (removed)
- `validation_window_active` gate: referenced in Phase 1 (check-budget.js change), Phase 3 (pre-flight assertion)
- Named volume for .venv: referenced in plan.md, Phase 3, Phase 4
- `bash -c` batch pattern: referenced in plan.md, Phase 3
- Conditional budget update (pass/fail): Phase 3 and Phase 4 aligned
- Unresolved contradictions: 0

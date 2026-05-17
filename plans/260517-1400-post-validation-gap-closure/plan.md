---
title: "Post-Validation Gap Closure"
description: "Close gaps after vnstock installer rewrite validation: fix phase statuses, create Docker cleanup mechanism, strengthen capability definition, re-validate capability scripts."
status: in-progress
priority: P2
branch: "main"
tags: [vnstock, capabilities, cleanup, docs, validation]
blockedBy: []
blocks: [260517-1800-constraint-gate-gap-closure]
created: "2026-05-17T06:23:54.323Z"
createdBy: "ck:plan"
source: skill
---

# Post-Validation Gap Closure

## Overview

After completing the vnstock installer rewrite validation plan, four gaps remain: phase file status discrepancy, root-owned Docker artifacts with no cleanup mechanism, ambiguous capability definition in agent-facing docs, and unverified capability scripts after recent changes. This plan closes all four.

## Context

- Validation plan: `plans/260517-1200-vnstock-installer-rewrite-validation/` (status: completed)
- Brainstorm report: `plans/reports/brainstorm-20260517-post-validation-gap-closure.md`
- Resource budget: `records/observations/observation-vnstock-resource-budget.yaml` (budget: 1, current: 1)
- Capability scripts: `product/api/capabilities/vnstock-data/capability-0[0-4]-*.py`
- Learning-loop self-improvement already completed: `record:decision-20260517T1200Z-observation-state-check-rule`

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Fix Phase Statuses](./phase-01-fix-phase-statuses.md) | Completed | P3 | 10m |
| 2 | [Create Cleanup Script](./phase-02-create-cleanup-script.md) | Completed | P2 | 30m |
| 3 | [Strengthen Capability Docs](./phase-03-strengthen-capability-docs.md) | Completed | P2 | 20m |
| 4 | [Re-validate Capabilities](./phase-04-re-validate-capabilities.md) | Blocked | P1 | 1h |

## Dependencies

- Phase 4 depends on Phase 2 (cleanup must run before re-bootstrap)
- Phase 3 independent (can run in parallel with 1 and 2)

## Key Constraint

Device slot budget is 1/1 (`observation-vnstock-resource-budget`). Cleanup script MUST preserve `.vnstock` (device registration state). If `.vnstock` exists, `.venv` must also be preserved (stale-container guard deadlock: removing `.venv` + preserving `.vnstock` = installer fails, no flag bypasses without consuming slot).

## Red Team Review

### Session — 2026-05-17
**Findings:** 14 (12 accepted, 2 rejected)
**Severity breakdown:** 1 Critical, 5 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Cleanup → Re-bootstrap Deadlock (stale-container guard) | Critical | Accept | Phase 2, Phase 4 |
| 2 | `pnpm check` can't verify phase statuses | High | Accept | Phase 1 |
| 3 | `--yes-i-know` misidentified as stale-guard bypass | High | Accept | Phase 4 |
| 4 | Cleanup script has no dry-run mode | High | Accept | Phase 2 |
| 5 | `uv sync` doesn't install vnstock_data | High | Accept | Phase 4 |
| 6 | Phase 1 commit reference is circular | High | Accept | Phase 1 |
| 7 | Phase 3 adds redundant docs | Medium | Accept | Phase 3 |
| 8 | Plan dependency direction inverted | Medium | Accept | plan.md |
| 9 | Cleanup should use allowlist not blocklist | Medium | Accept | Phase 2 |
| 10 | Phase 3 line reference → content anchor | Medium | Accept | Phase 3 |
| 11 | Phase 4 no error recovery path | Medium | Accept | Phase 4 |
| 12 | Phase 4 dependency chain should include Phase 3 | Medium | Reject | — |
| 13 | Sudo check timing in cleanup script | Medium | Accept | Phase 2 |
| 14 | Phase 4 experiment outcome definitions ambiguous | Medium | Reject | — |

### Whole-Plan Consistency Sweep

Checked after red-team edits:
- plan.md Dependencies: updated direction ("Phase 4 depends on Phase 2")
- plan.md Key Constraint: updated to reflect deadlock (preserve `.venv` if `.vnstock` exists)
- Phase 1: commit reference replaced with experiment record, `pnpm check` replaced with grep verification
- Phase 2: complete rewrite — allowlist approach, dry-run default, conditional `.venv` removal, sudo check first
- Phase 3: reduced from 3-file duplication to single-sentence glossary edit
- Phase 4: `--yes-i-know` step removed, step 1 checks import state first, troubleshooting section added, pass criteria quantified (`len(df) > 0`)
- No stale terms, rejected assumptions, or contradictions remaining across plan files.

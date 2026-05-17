---
title: "Constraint Gate Gap Closure"
description: "Fix 4 gaps in constraint gate: narrow patterns, schema mismatch, budget-check ordering, CJS/ESM duplication"
status: complete
priority: P1
branch: "main"
tags: [infra, mcp, enforcement, hooks, tdd]
blockedBy: [260517-1600-constraint-gate-mcp-server]
blocks: [260517-1400-post-validation-gap-closure]
created: "2026-05-17"
createdBy: "ck:plan"
source: skill
---

# Constraint Gate Gap Closure

## Overview

The constraint gate MCP server is complete but has 4 gaps that prevent it from catching the actual constraint scenarios. `check_gate("pnpm bootstrap:api")` and `check_gate("python -c 'import vnstock_data'")` both return `ok` even though the device budget is exhausted (1/1). The gate is structurally correct but its patterns, schema matching, and decision ordering are wrong.

## Context

- Constraint gate plan: `plans/260517-1600-constraint-gate-mcp-server/` (status: complete)
- Post-validation plan: `plans/260517-1400-post-validation-gap-closure/` (Phase 4 blocked by device budget)
- Journal: `docs/journals/260516-vnstock-phase2-validation-session-critique.md` (documents slot hazard from `import vnstock_data`)
- Budget: `records/observations/observation-vnstock-resource-budget.yaml` (budget: 1, current: 1)
- Brainstorm: `plans/reports/brainstorm-20260517-constraint-gate-architecture.md`

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Expand Gate Patterns](./phase-01-expand-gate-patterns.md) | complete | P1 | 30m |
| 2 | [Fix Observation Schema Matching](./phase-02-fix-observation-schema.md) | complete | P1 | 20m |
| 3 | [Budget-First Decision Ordering](./phase-03-budget-first-ordering.md) | complete | P1 | 30m |
| 4 | [Sync CJS/ESM Patterns](./phase-04-sync-cjs-esm-patterns.md) | complete | P2 | 20m |

## Dependencies

- Phase 1: no dependencies
- Phase 2: no dependencies (can parallel with 1)
- Phase 3: depends on Phase 1+2 (needs expanded patterns + schema fix + migrated observations to test properly). Also updates `bash-coordination-gate.cjs` with same budget-first fix.
- Phase 4: depends on Phase 1 (pattern source of truth must exist first)

## Key Constraint

Gate patterns are duplicated: `gate-logic.js` (ESM, MCP server) and `gate-utils.cjs` (CJS, hooks). Both must stay in sync. The CJS module uses `createRequire` pattern from the brainstorm.

## Red Team Review

### Session — 2026-05-17
**Findings:** 15 (12 accepted, 3 rejected)
**Severity breakdown:** 3 Critical, 4 High, 5 Medium, 3 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | Phase 4 path resolution wrong (../../../ → ../../../../) | Critical | Accept | Phase 4 |
| C2 | Phase 2 test/implementation inconsistency (slug vs pattern name) | Critical | Accept | Phase 2 |
| C3 | CJS hook not updated for budget-first ordering | Critical | Accept | Phase 3 |
| H1 | `import\s+vnstock` regex needs word boundary | High | Accept | Phase 1 |
| H2 | Phase 3 server.js handler underspecified | High | Accept | Phase 3 |
| H3 | "escalate without observation" test unreachable in current flow | High | Accept | Phase 3 |
| H4 | Phase 4 test added to wrong file | High | Accept | Phase 4 |
| M1 | YAML duplicate keys remain confusing | Medium | Reject | — |
| M2 | Budget file serves dual purpose | Medium | Reject | — |
| M3 | patterns.json regex flags lost in conversion | Medium | Accept | Phase 4 |
| M4 | No integration test for MCP server budget exhaustion | Medium | Accept | Phase 3 |
| M5 | Multiple budgets — first-exhausted-wins nondeterministic | Medium | Reject | — |
| L1 | Phase 4 heading misleading | Low | Accept | Phase 4 |
| L2 | No compound command tests for new patterns | Low | Accept | Phase 1 |
| L3 | Plan dependency graph inconsistency | Low | Accept | plan.md |

## Success Criteria

- `check_gate("pnpm bootstrap:api")` returns `escalate` (budget exhausted)
- `check_gate("python -c 'import vnstock_data'")` returns `escalate` (budget exhausted)
- `check_gate("python -c 'import vnstock_data'")` returns `block` when no observation exists
- `check_gate("docker run ...")` returns `escalate` when budget exhausted (regardless of observation)
- All existing tests still pass
- New tests cover all 4 gaps

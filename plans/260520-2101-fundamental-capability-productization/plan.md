---
title: "Fundamental Capability Productization"
description: "Build backend API and frontend UI from capability-03-fundamental.py runtime probe. Productizes income statement, balance sheet, cash flow, and financial ratios endpoints following the reference capability pattern."
status: completed
priority: P1
branch: "main"
tags: [fundamental, vnstock, backend, frontend, capability]
blockedBy: []
blocks: []
created: "2026-05-20T13:56:16.239Z"
createdBy: "ck:plan"
source: skill
---

# Fundamental Capability Productization

## Overview

Productize the fundamental data layer from the `capability-03-fundamental.py` runtime probe into a full stack feature: FastAPI endpoints for income statement, balance sheet, cash flow, and financial ratios; plus a TanStack React frontend with tabbed financial statement views. Follows the same architectural pattern established by the reference capability (`capability-fastapi-reference-rest` + `capability-tanstack-reference-render`).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research and Analysis](./phase-01-research-and-analysis.md) | Complete |
| 2 | [Backend Implementation](./phase-02-backend-implementation.md) | Complete |
| 3 | [Frontend Implementation](./phase-03-frontend-implementation.md) | Complete |
| 4 | [Integration and Testing](./phase-04-integration-and-testing.md) | Complete |
| 5 | [Records and Documentation](./phase-05-records-and-documentation.md) | Complete |

## Pre-Implementation Checklist

Before any implementation phase begins, verify:

- [ ] All Key Decisions have corresponding `records/decisions/` artifacts
- [ ] Decision records cite source evidence and required gates
- [ ] No implementation phase proceeds without decision coverage
- [ ] Evidence creation is delegated to operator; agent drafts only

## Key Decisions

| Decision | Record | Scope |
|----------|--------|-------|
| Reuse `DataFrameEnvelope` pattern for API responses | `record:decision-260521T2101Z-envelope-pattern-reuse` | product |
| No runtime gate — direct passthrough like reference router | `record:decision-260521T2102Z-fundamental-live-gate` | product |
| Frontend route `/fundamental/$symbol` with tabs | `record:decision-260521T2103Z-frontend-route-tabs` | product |
| No data caching layer — passthrough only | `record:decision-260521T2104Z-no-caching-layer` | product |

## Dependencies

- `product/api/.venv` with `vnstock_data` installed (handled by `pnpm bootstrap:api`)
- `capability-03-fundamental.py` runtime probe verified (evidence: `records/evidence/vnstock-data/`)
- Reference capability product pattern as implementation template (`records/capabilities/capability-fastapi-reference-rest.yaml`, `records/capabilities/capability-tanstack-reference-render.yaml`)
- `record:decision-20260517T1200Z-observation-state-check-rule` — observation-first state queries required before asking operator about external system state

## Risks

| Risk | Mitigation |
|------|------------|
| vnstock_data Fundamental API shape differs from probe expectations | Run probe first to capture actual column names; use `extra="allow"` Pydantic config per `record:decision-260521T2101Z-envelope-pattern-reuse` |
| DataFrame column ordering inconsistency across symbols | Return columns dynamically from DataFrame, not hardcoded schema per `record:decision-260521T2101Z-envelope-pattern-reuse` |
| Frontend bundle size from large financial tables | Use virtualized rendering if tables exceed 100 rows; defer to future phase per `record:decision-260521T2103Z-frontend-route-tabs` |
| Device slot budget for live testing | Use mocked tests for CI; no per-request gate per `record:decision-260521T2102Z-fundamental-live-gate` |

## Validation Log

### Session 1 — 2026-05-21
**Trigger:** `/ck:plan validate` after rewrite
**Questions asked:** 2

#### Verification Results
- **Tier:** Standard
- **Claims checked:** 12
- **Verified:** 11 | **Failed:** 1 | **Unverified:** 0

#### Failures
1. [Fact Checker] `product/api/src/routers/reference.py` — plan claimed `VNSTOCK_REFERENCE_LIVE_GATE` exists; grep found no gate. Reference router makes direct live calls.

#### Questions & Answers

1. **[Assumptions]** The plan assumes the reference router uses a live gate pattern (`VNSTOCK_REFERENCE_LIVE_GATE`), but verification shows `product/api/src/routers/reference.py` has NO gate — it makes direct live calls. How should fundamental endpoints handle live calls?
   - Options: Follow reference: no gate, direct passthrough (Recommended) | Add gate to fundamental only (new pattern) | Add gate to BOTH reference and fundamental
   - **Answer:** Follow reference: no gate, direct passthrough (Recommended)
   - **Rationale:** Reference router has no gate; fundamental should match actual behavior, not imagined pattern.

2. **[Architecture]** The plan uses `extra="allow"` Pydantic config to handle dynamic DataFrame columns. Is this acceptable for financial statement data where column names may vary by symbol and reporting period?
   - Options: Yes, extra=allow is sufficient for MVP (Recommended) | No, add a column allowlist per statement type
   - **Answer:** Yes, extra=allow is sufficient for MVP (Recommended)
   - **Rationale:** Dynamic columns with input validation on symbol/limit is the right tradeoff for flexibility.

#### Confirmed Decisions
- Gate pattern: no gate — reference router verified as direct passthrough
- Dynamic columns: `extra="allow"` Pydantic config — sufficient for MVP

#### Impact on Phases
- Phase 2: Removed gate check from Requirements, Architecture, Implementation Steps, Success Criteria
- Phase 4: Removed gate-related smoke test prerequisites
- Decision record `decision-260521T2102Z-fundamental-live-gate`: Updated to approve no-gate passthrough

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-*, phase-02-*, phase-03-*, phase-04-*, phase-05-*
- Decision deltas checked: 1 (gate removed)
- Reconciled stale references: 6 (gate refs removed from plan.md, phase-02, phase-04)
- Unresolved contradictions: 0

## Next Steps

1. Verify the Pre-Implementation Checklist above is satisfied.
2. Confirm all 4 decision records in `records/decisions/` are present and valid (`pnpm validate:records`).
3. After checklist approval: `/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260520-2101-fundamental-capability-productization/plan.md`

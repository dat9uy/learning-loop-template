---
title: "Fundamental Capability Productization"
description: "Build backend API and frontend UI from capability-03-fundamental.py runtime probe. Productizes income statement, balance sheet, cash flow, and financial ratios endpoints following the reference capability pattern."
status: pending
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
| 1 | [Research and Analysis](./phase-01-research-and-analysis.md) | Pending |
| 2 | [Backend Implementation](./phase-02-backend-implementation.md) | Pending |
| 3 | [Frontend Implementation](./phase-03-frontend-implementation.md) | Pending |
| 4 | [Integration and Testing](./phase-04-integration-and-testing.md) | Pending |
| 5 | [Records and Documentation](./phase-05-records-and-documentation.md) | Pending |

## Key Decisions

- Reuse the `DataFrameEnvelope` pattern from `product/api/src/models/reference.py` for API responses.
- Gate live fundamental endpoints behind `VNSTOCK_FUNDAMENTAL_LIVE_GATE=approved`, matching reference router runtime gate pattern.
- Frontend route: `/fundamental/$symbol` with tabs for each statement type.
- No data caching layer — passthrough to vnstock_data per existing reference router behavior.

## Dependencies

- `product/api/.venv` with `vnstock_data` installed (handled by `pnpm bootstrap:api`)
- `capability-03-fundamental.py` runtime probe verified (existing evidence in `records/evidence/`)
- Reference capability product pattern as implementation template

## Risks

| Risk | Mitigation |
|------|------------|
| vnstock_data Fundamental API shape differs from probe expectations | Run probe first to capture actual column names; use `extra="allow"` Pydantic config |
| DataFrame column ordering inconsistency across symbols | Return columns dynamically from DataFrame, not hardcoded schema |
| Frontend bundle size from large financial tables | Use virtualized rendering if tables exceed 100 rows; defer to future phase |
| Device slot budget for live testing | Use mocked tests for CI; live gate requires operator approval |

## Next Steps

After plan approval: `/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/plan.md`

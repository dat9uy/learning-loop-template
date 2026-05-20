---
phase: 1
title: "Research and Analysis"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Research and Analysis

## Overview

Analyze the `capability-03-fundamental.py` runtime probe output to determine actual DataFrame shapes, column names, and data types. Audit the existing reference backend/frontend pattern to establish the replication template. Verify no cross-plan conflicts with active capability work.

## Requirements

- Functional: Document the exact API surface exposed by `vnstock_data.Fundamental`
- Non-functional: Evidence captured in a form suitable for index extraction (`## Findings`)

## Architecture

No code architecture changes. This phase produces findings and a data contract specification for Phase 2.

## Related Code Files

- Read: `product/api/capabilities/vnstock-data/capability-03-fundamental.py`
- Read: `product/api/src/models/reference.py`
- Read: `product/api/src/routers/reference.py`
- Read: `product/api/src/main.py`
- Read: `product/web/src/lib/reference-client.ts`
- Read: `product/web/src/router.tsx`
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Read: `records/capabilities/capability-tanstack-reference-render.yaml`

## Implementation Steps

1. **Run the runtime probe** (operator-gated; if live gate unavailable, inspect source code of `vnstock_data.Fundamental` to infer shapes).
2. **Capture output schemas** for:
   - `Fundamental.equity(SYMBOL).income_statement(limit=N)`
   - `Fundamental.equity(SYMBOL).balance_sheet(limit=N)`
   - `Fundamental.equity(SYMBOL).cash_flow(limit=N)`
   - `Fundamental.equity(SYMBOL).ratio()`
3. **Document column names, types, nullability** in an evidence file under `records/evidence/vnstock-data/`.
4. **Cross-check with reference pattern**: confirm `DataFrameEnvelope`, router prefix, model config, CORS, and client patterns are suitable for replication.
5. **List active plans** in `./plans/` to confirm no file conflicts on `main.py`, `router.tsx`, or shared models.

## Success Criteria

- [ ] Evidence file written with `## Findings` section containing `[fundamental-schema]` assertions
- [ ] Column names for all 4 statement types documented
- [ ] Reference pattern audit complete (models, router, client, route checklist)
- [ ] No blocking cross-plan conflicts detected

## Risk Assessment

- **Probe fails at runtime** (device slot, auth): Fall back to source-code inspection of `vnstock_data` package. Document the fallback in evidence.
- **Data shapes vary by symbol**: Capture shapes for at least 2 symbols (VIC, VNM) and note variance.

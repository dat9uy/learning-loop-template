---
phase: 2
title: "Backend Implementation"
status: complete
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Backend Implementation

## Overview

Build the FastAPI backend for fundamental data: Pydantic models, router with 4 endpoints, and unit tests. Follows the exact pattern of `product/api/src/routers/reference.py`.

## Requirements

- Functional:
  - `GET /fundamental/income/{symbol}?limit={n}` — income statement
  - `GET /fundamental/balance/{symbol}?limit={n}` — balance sheet
  - `GET /fundamental/cashflow/{symbol}?limit={n}` — cash flow statement
  - `GET /fundamental/ratios/{symbol}` — financial ratios
- Non-functional:
  - Response schema: `DataFrameEnvelope` with dynamic columns
  - Input validation: symbol pattern `^[A-Za-z0-9._-]+$`, limit `1 <= limit <= 20`

## Architecture

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Client    │────▶│  /fundamental/*     │────▶│  vnstock_data│
│             │     │  FastAPI Router     │     │  Fundamental │
└─────────────┘     └─────────────────────┘     └──────────────┘
```

## Related Code Files

- Create: `product/api/src/models/fundamental.py`
- Create: `product/api/src/routers/fundamental.py`
- Modify: `product/api/src/main.py` (include router)
- Create: `product/api/tests/test_fundamental.py`
- Read for context: `product/api/src/models/reference.py`
- Read for context: `product/api/src/routers/reference.py`
- Read for context: `product/api/tests/test_reference.py`

## Pre-Implementation Checklist

Before writing code, verify:

- [ ] `record:decision-260521T2101Z-envelope-pattern-reuse` exists and is approved
- [ ] `record:decision-260521T2102Z-fundamental-live-gate` exists and is approved (no-gate passthrough)
- [ ] All decision records pass `pnpm validate:records`

## Implementation Steps

1. **Create `product/api/src/models/fundamental.py`**
   - Define `FundamentalStatementResponse(DataFrameEnvelope)` with `model_config = ConfigDict(extra="allow")`
   - Define `FinancialRatioResponse(DataFrameEnvelope)` with same config
   - No row-level typed models needed (use `extra="allow"` to match dynamic columns)

2. **Create `product/api/src/routers/fundamental.py`**
   - Import `vnstock_env` before `vnstock_data`
   - Import `Fundamental` from `vnstock_data`
   - Reuse `_records_from_frame` helper from reference router (or extract to shared util — decision: inline copy to avoid cross-file coupling during this phase)
   - Four endpoints with `APIRouter(prefix="/fundamental", tags=["fundamental"])`
   - Each endpoint:
     - Call `Fundamental().equity(symbol).{method}(limit=limit)`
     - Convert via `_records_from_frame`
     - Return typed response

3. **Modify `product/api/src/main.py`**
   - Import and `include_router(fundamental_router)`

4. **Create `product/api/tests/test_fundamental.py`**
   - Stub `vnstock_data` and `Fundamental` class with FakeFundamental
   - Fake returns fixed DataFrames with realistic columns (based on Phase 1 findings)
   - Test each endpoint returns correct schema shape
   - Test limit parameter bounds
   - Test invalid symbol pattern

## Success Criteria

- [ ] `product/api/src/models/fundamental.py` created with response models
- [ ] `product/api/src/routers/fundamental.py` created with 4 endpoints
- [ ] `product/api/src/main.py` wires router
- [ ] `product/api/tests/test_fundamental.py` passes (`pytest`)
- [ ] `GET /health` still returns ok
- [ ] `GET /fundamental/income/AAA?limit=2` returns JSON with `columns`, `rows`, `row_count`

## Risk Assessment

- **vnstock_data import requires HOME env**: Ensure `vnstock_env` imported before `vnstock_data` in router. Verified by reference router pattern.
- **DataFrame contains NaT/NaN**: `_records_from_frame` handles this via `astype(object).where(pd.notnull(frame), None)`.
- **Test isolation**: Use monkeypatch to replace `Fundamental` class, same as reference tests.

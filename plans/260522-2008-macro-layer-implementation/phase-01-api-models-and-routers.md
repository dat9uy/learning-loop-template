# Phase 1: API Models and Routers

## Overview

Implement the FastAPI backend for the Macro layer with 3 sub-routers to stay under the 200-line limit.

## Requirements

- All endpoints return `DataFrameEnvelope` (columns + rows + row_count)
- Use existing `_records_from_frame` helper pattern
- Register all routers in `src/main.py`

## Files to Create

- `product/api/src/models/macro.py` — Pydantic models reusing `DataFrameEnvelope`
- `product/api/src/routers/macro_economy.py` — 8 economy endpoints
- `product/api/src/routers/macro_currency.py` — 2 currency endpoints
- `product/api/src/routers/macro_commodity.py` — 11 commodity endpoints

## Files to Modify

- `product/api/src/main.py` — Register 3 new routers with `/macro` prefix

## Implementation Steps

1. **macro.py model**: Define `MacroResponse` extending `DataFrameEnvelope` (same pattern as fundamental models).

2. **macro_economy.py router** (`prefix="/macro/economy"`):
   - `GET /gdp` — query params: `start`, `end`, `period` (default "quarter"), `length`
   - `GET /cpi` — same param pattern
   - `GET /industry-prod` — same param pattern
   - `GET /import-export` — same param pattern
   - `GET /retail` — same param pattern
   - `GET /fdi` — same param pattern
   - `GET /money-supply` — same param pattern
   - `GET /population-labor` — same param pattern

3. **macro_currency.py router** (`prefix="/macro/currency"`):
   - `GET /exchange-rate` — query params: `start`, `end`, `period` (default "day"), `length`
   - `GET /interest-rate` — query params: `start`, `end`, `period` (default "day"), `length`, `format` (default "pivot")

4. **macro_commodity.py router** (`prefix="/macro/commodity"`):
   - `GET /gold` — query param: `market` (default "VN")
   - `GET /gas` — query param: `market` (default "VN")
   - `GET /oil-crude` — no market param
   - `GET /coke` — no market param
   - `GET /steel` — query param: `market` (default "VN")
   - `GET /iron-ore` — no market param
   - `GET /fertilizer-ure` — no market param
   - `GET /soybean` — no market param
   - `GET /corn` — no market param
   - `GET /sugar` — no market param
   - `GET /pork` — query param: `market` (default "VN")

5. **main.py**: Import and include all 3 routers.

## Acceptance Criteria

- `curl http://localhost:8000/macro/economy/gdp?period=quarter&length=4` returns valid JSON envelope
- All 21 endpoints are registered and reachable
- No file exceeds 200 lines
- Existing reference/fundamental endpoints still work

## Risk Assessment

- **Missing vnstock_data methods**: If a method is missing from the installed version, return an empty DataFrame with a clear error message instead of crashing.

# Phase 3: Tests and Integration

## Overview

Write unit tests for macro endpoints and verify full integration.

## Files to Create

- `product/api/tests/test_macro.py` — Unit tests with monkeypatched stubs

## Files to Read (for context)

- `product/api/tests/test_fundamental.py` — Copy the stubbing pattern

## Implementation Steps

1. **Stub `vnstock_data.Macro`**: Create fake classes for `Macro`, `EconomyResource`, `CurrencyResource`, `CommodityResource`.
2. **Test each endpoint**: Verify 200 response, correct columns, row_count, and data shape.
3. **Test param validation**: Verify 422 for invalid `period`, `market`, etc.
4. **Run all tests**: `cd product/api && python -m pytest tests/`
5. **Build frontend**: `cd product/web && pnpm build` (or equivalent)

## Acceptance Criteria

- All 21 endpoints have at least one test
- `pytest` passes with 0 failures
- Frontend builds without errors
- No regression in existing reference/fundamental tests

## Risk Assessment

- **Import failures**: If `vnstock_data.Macro` is not available in the test environment, skip tests with a clear reason.

# Phase 2: Frontend Client and Components

## Overview

Build the TanStack Router frontend for browsing macro data by domain.

## Files to Create

- `product/web/src/lib/macro-client.ts` — Fetch functions for all 21 endpoints
- `product/web/src/components/MacroTabs.tsx` — Tab UI for economy/currency/commodity
- `product/web/src/components/MacroTable.tsx` — Reusable table for macro DataFrame envelope
- `product/web/src/routes/macro/index.tsx` — `/macro` route page

## Files to Modify

- `product/web/src/router.tsx` — Register `/macro` route

## Implementation Steps

1. **macro-client.ts**: Export types and fetch functions matching the API endpoints:
   - `fetchEconomyGdp()`, `fetchEconomyCpi()`, etc.
   - `fetchCurrencyExchangeRate()`, `fetchCurrencyInterestRate()`
   - `fetchCommodityGold()`, `fetchCommodityGas()`, etc.

2. **MacroTable.tsx**: Reusable component rendering a DataFrame envelope (same pattern as FundamentalTable).

3. **MacroTabs.tsx**: Tabs for Economy, Currency, Commodity. Each tab calls the appropriate API and renders MacroTable.

4. **macro/index.tsx**: Route component rendering MacroTabs.

5. **router.tsx**: Add `macroRoute` under `/macro`.

## Acceptance Criteria

- `/macro` page loads without errors
- Tabs switch between domains
- Tables render data with correct columns
- No regression on existing routes

## Risk Assessment

- **API not running**: Show "API unavailable" message gracefully.

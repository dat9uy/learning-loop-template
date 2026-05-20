---
phase: 3
title: "Frontend Implementation"
status: pending
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Frontend Implementation

## Overview

Build the TanStack React frontend for fundamental data: API client, financial statement table component, tabbed view component, and route wiring. Follows the reference frontend pattern (`reference-client.ts`, `CompanyDetail`, `equity.tsx`).

## Requirements

- Functional:
  - Route `/fundamental/$symbol` displaying financial data for a symbol
  - Tabs: Income Statement, Balance Sheet, Cash Flow, Ratios
  - Table view for each tab using the `columns`/`rows` envelope pattern
  - Navigation link from company detail or search to fundamental view
- Non-functional:
  - Reuse `DataFrameEnvelope<T>` type pattern
  - No external UI library dependencies (plain React + CSS, matching existing stack)
  - Accessible: `aria-label`, semantic `<table>`

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│ /fundamental/   │────▶│ FundamentalRoute     │────▶│ fetchIncome │
│   $symbol       │     │ (tabs + table)       │     │ fetchBalance│
└─────────────────┘     └──────────────────────┘     │ fetchCash   │
                                                     │ fetchRatios │
                                                     └──────┬──────┘
                                                            │
                                                     ┌──────┴──────┐
                                                     │ FastAPI     │
                                                     │ /fundamental│
                                                     └─────────────┘
```

## Related Code Files

- Create: `product/web/src/lib/fundamental-client.ts`
- Create: `product/web/src/components/FundamentalTable.tsx`
- Create: `product/web/src/components/FundamentalTabs.tsx`
- Create: `product/web/src/routes/fundamental/$symbol.tsx`
- Modify: `product/web/src/router.tsx` (add route)
- Modify: `product/web/src/routes/index.tsx` (add navigation link)
- Read for context: `product/web/src/lib/reference-client.ts`
- Read for context: `product/web/src/router.tsx`
- Read for context: `product/web/src/components/CompanyDetail.tsx`

## Implementation Steps

1. **Create `product/web/src/lib/fundamental-client.ts`**
   - Define `FundamentalRow` type: `Record<string, string | number | null>`
   - Define `FundamentalResponse = DataFrameEnvelope<FundamentalRow>`
   - Four async fetch functions: `fetchIncomeStatement`, `fetchBalanceSheet`, `fetchCashFlow`, `fetchRatios`
   - Base URL from `import.meta.env.VITE_REFERENCE_API_BASE_URL ?? 'http://localhost:8000'`
   - URL pattern: `/fundamental/{statement}/{symbol}?limit={n}` (ratios omits limit)
   - Error handling: throw on non-ok response

2. **Create `product/web/src/components/FundamentalTable.tsx`**
   - Props: `{ data: FundamentalResponse; title: string }`
   - Render `<table>` with `<thead>` (column headers) and `<tbody>` (rows)
   - Handle empty rows gracefully
   - Use `String(value ?? '')` for cell rendering
   - Add `aria-label` for accessibility

3. **Create `product/web/src/components/FundamentalTabs.tsx`**
   - Props: `{ symbol: string }`
   - State: `activeTab: 'income' | 'balance' | 'cashflow' | 'ratios'`
   - Fetch data in `useEffect` per active tab (or parallel fetch on mount)
   - Loading state while fetching
   - Error state display
   - Render tab buttons + `FundamentalTable` for active tab
   - Limit selector for non-ratio tabs (default 4, options 1-10)

4. **Create `product/web/src/routes/fundamental/$symbol.tsx`**
   - `fundamentalRoutePath = '/fundamental/$symbol'`
   - `loadFundamental` (no-op loader; data fetched client-side by component)
   - `FundamentalRoute` renders `FundamentalTabs` with symbol from params

5. **Modify `product/web/src/router.tsx`**
   - Import new route file
   - Add `fundamentalRoute` as child of `rootRoute`
   - Add to `referenceRoutes` (rename variable to `appRoutes` if appropriate, or keep naming)

6. **Modify `product/web/src/routes/index.tsx`**
   - Add link to `/fundamental/VIC` as demo entry point (below equity list link)

## Success Criteria

- [ ] `product/web/src/lib/fundamental-client.ts` compiles (TypeScript)
- [ ] `FundamentalTable` renders a table with correct headers and rows
- [ ] `FundamentalTabs` switches between 4 tabs and fetches correct endpoint
- [ ] Route `/fundamental/VIC` loads and displays income statement by default
- [ ] Navigation link exists on index page
- [ ] `pnpm dev:web` serves the new route without errors

## Risk Assessment

- **TypeScript strictness issues with dynamic rows**: Use `Record<string, unknown>` or `extra: allow` pattern. `FundamentalRow` as `Record<string, string | number | null>` should suffice.
- **CORS blocked**: API already allows `localhost:5173` in `main.py` CORS config.
- **Large tables cause performance issues**: For typical fundamental data (4-8 periods x ~30 rows), plain table is fine. No virtualization needed.
- **Tab state lost on navigation**: Acceptable for MVP; persist to URL query param as future enhancement.

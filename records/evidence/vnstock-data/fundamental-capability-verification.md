---
capability: fundamental
dimension: product
scope: api+web
validation_status: verified
---

## Findings

- [fundamental-endpoints] `GET /fundamental/income/{symbol}?limit={n}` returns DataFrameEnvelope with columns/rows for income statement. Verified for symbol VIC with limit 4. Columns vary dynamically; 24 columns observed.
- [fundamental-endpoints] `GET /fundamental/balance/{symbol}?limit={n}` returns DataFrameEnvelope for balance sheet. 147 columns observed for symbol VIC.
- [fundamental-endpoints] `GET /fundamental/cashflow/{symbol}?limit={n}` returns DataFrameEnvelope for cash flow. 51 columns observed for symbol VIC.
- [fundamental-endpoints] `GET /fundamental/ratios/{symbol}` returns DataFrameEnvelope for financial ratios. Period, trailing_eps, book_value_per_share, beta, ev_ebit, ev_ebitda columns observed.
- [fundamental-frontend] Route `/fundamental/VIC` renders tabbed UI with Income Statement active by default.
- [fundamental-frontend] Tab switching fetches correct endpoint per active tab.
- [fundamental-frontend] Limit selector (1-20) passes correct query parameter to backend.

source_refs:
  - local:product/api/src/routers/fundamental.py
  - local:product/web/src/routes/fundamental/$symbol.tsx
  - local:product/api/tests/test_fundamental.py
  - record:capability-fastapi-fundamental-rest
  - record:capability-tanstack-fundamental-render

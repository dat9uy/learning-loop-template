---
record_type: evidence
capability: vnstock-data
dimension: runtime
scope: sandbox
validation_status: passed
claim_support: supports
output_level: runtime-captured
created: "2026-05-10T00:00:00Z"
substrate: shared-product-venv-python-3-12
---

# Capability Runtime Output - vnstock-data - 20260510

## Summary

The shared `product/.venv` environment installed and imported `vnstock_data`, then executed the five staged capability scripts against live endpoints.

The runtime covered these domains:

- Discovery: import, API tree, and method documentation inspection.
- Reference: equity listings, VN30 group, company info, shareholders, symbol search, and index groups.
- Market: OHLCV, quote, session stats, foreign flow, and order book.
- Fundamental: income statement, balance sheet, cash flow, and ratios.
- Insights and Macro: gainer/loser rankings, GDP, CPI, and exchange rates.

## Environment

- Python executable class: `product/.venv/bin/python`
- Python version family: `3.12`
- `vnstock_data` package version from package metadata: `3.1.7`
- `vnstock_data.__version__`: `3.0.0`
- `vnstock` core package version from package metadata: `4.0.2`
- Installer URL class: `vnstocks-official-download`
- Credential handling: API key inherited through `VNSTOCK_API_KEY`; value not captured.

## Execution Results

All five capability scripts completed after one API drift correction:

- `capability-00-discovery.py`: passed.
- `capability-01-reference.py`: passed.
- `capability-02-market.py`: passed.
- `capability-03-fundamental.py`: passed.
- `capability-04-insights-macro.py`: passed after changing GDP/CPI period from unsupported `quarter` to supported `year`.

## Metadata-Only Output Capture

No raw row values, full DataFrames, credential values, config contents, or time-series values are included below. The captured output is limited to object type, row count, shape, and column names.

| Call | Type | Rows | Shape | Columns |
|------|------|------|-------|---------|
| `reference.equity.list` | DataFrame | 1741 | 1741 x 2 | `symbol`, `org_name` |
| `reference.equity.list_by_group("VN30")` | Series | 30 | 30 | n/a |
| `reference.company("VIC").info()` | DataFrame | 1 | 1 x 6 | `symbol`, `name`, `sector`, `profile`, `listing_date`, `issued_share` |
| `reference.company("VIC").shareholders()` | DataFrame | 43 | 43 x 5 | `symbol`, `name`, `total_shares`, `rate`, `date` |
| `reference.search.symbol("VNM", limit=5)` | DataFrame | 0 | 0 x 8 | `symbol`, `code`, `name`, `description`, `type`, `country_code`, `pip_value`, `price_scale` |
| `reference.index.groups()` | DataFrame | 16 | 16 x 4 | `group_name`, `group_code`, `category`, `description` |
| `market.equity("VIC").ohlcv(...)` | DataFrame | 7 | 7 x 6 | `time`, `open`, `high`, `low`, `close`, `volume` |
| `market.equity("VIC").quote()` | DataFrame | 1 | 1 x 23 | `symbol`, `exchange`, `reference_price`, `ceiling_price`, `floor_price`, `open_price`, `high_price`, `low_price`, `close_price`, bid/ask price-volume levels, foreign buy/sell volume |
| `market.equity("VIC").session_stats()` | DataFrame | 1 | 1 x 56 | aggregate volume/value, foreign flow, trade volume, unmatched volume metrics |
| `market.equity("VIC").foreign_flow()` | DataFrame | 100 | 100 x 7 | `trading_date`, `buy_vol`, `buy_val`, `sell_vol`, `sell_val`, `net_vol`, `net_val` |
| `market.equity("VIC").order_book()` | DataFrame | 1 | 1 x 12 | three bid price-volume levels and three ask price-volume levels |
| `fundamental.equity("VIC").income_statement(limit=4)` | DataFrame | 57 | 57 x 24 | `period`, revenue/profit/tax/expense/EPS statement fields |
| `fundamental.equity("VIC").balance_sheet(limit=4)` | DataFrame | 57 | 57 x 147 | `period`, asset/liability/equity/inventory/receivable/payable balance sheet fields |
| `fundamental.equity("VIC").cash_flow(limit=4)` | DataFrame | 57 | 57 x 51 | `period`, operating/investing/financing cash-flow fields |
| `fundamental.equity("VIC").ratio()` | DataFrame | 57 | 57 x 10 | `period`, `trailing_eps`, `book_value_per_share`, `pe`, `pb`, `ps`, `dividend_yield`, `beta`, `ev_ebit`, `ev_ebitda` |
| `insights.ranking().gainer()` | DataFrame | 10 | 10 x 9 | `symbol`, `exchange`, `last_price`, `last_updated`, price-change and volume/value fields |
| `insights.ranking().loser()` | DataFrame | 10 | 10 x 7 | `symbol`, `exchange`, `last_price`, `last_updated`, price-change and value fields |
| `macro.economy().gdp(period="year")` | DataFrame | 135 | 135 x 7 | `last_updated`, `group_name`, `name`, `value`, `unit`, `source`, `report_type` |
| `macro.economy().cpi(period="year")` | DataFrame | 126 | 126 x 5 | `last_updated`, `name`, `value`, `unit`, `source` |
| `macro.currency().exchange_rate()` | DataFrame | 596 | 596 x 5 | `last_updated`, `name`, `value`, `unit`, `source` |

## Observations

- Live runtime execution supports the staged capability hypothesis for the tested Reference, Market, Fundamental, Insights, and Macro surfaces.
- The installed macro API rejected `period="quarter"` for GDP/CPI and accepted `period="year"`.
- `reference.search.symbol("VNM", limit=5)` returned an empty DataFrame while preserving the expected search schema.
- `vnstock_data` package metadata and module `__version__` disagree (`3.1.7` vs `3.0.0`); package metadata is treated as the installed distribution version.

## Findings

- [live-api-surfaces-verified] Live API calls across Reference, Market, Fundamental, Insights, and Macro surfaces succeed with metadata-only output capture.
  - Context: Verified in product/api shared venv on 2026-05-10 across 20+ calls.
  - Caveat: `reference.search.symbol("VNM", limit=5)` returned an empty DataFrame while preserving the expected search schema.

## Output Policy Review

- Raw external data values: not retained in this evidence envelope.
- Credentials: not printed or retained.
- Full DataFrames: not retained in this evidence envelope.
- Temp runtime logs: stored outside the repo under `/tmp` during execution only.

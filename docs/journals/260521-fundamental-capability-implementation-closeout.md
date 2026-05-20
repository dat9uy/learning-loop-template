# Fundamental Capability Implementation Closeout

**Date:** 2026-05-21
**Trigger:** `/ck:cook --auto` execution of plan `260520-2101-fundamental-capability-productization`
**Scope:** FastAPI backend + TanStack frontend for income statement, balance sheet, cash flow, and financial ratios

## What Was Built

- **Backend:** 4 FastAPI endpoints under `/fundamental/*` with `DataFrameEnvelope` response pattern and `ConfigDict(extra="allow")` for dynamic columns. No runtime gate — direct passthrough matching reference router behavior.
- **Frontend:** `/fundamental/$symbol` route with tabbed UI (Income Statement, Balance Sheet, Cash Flow, Ratios), generic `FundamentalTable` component, and `fundamental-client.ts` API client.
- **Tests:** 7 backend tests with `FakeFundamental` monkeypatch strategy. All pass.
- **Records:** 2 capability records (`capability-fastapi-fundamental-rest`, `capability-tanstack-fundamental-render`) created and validated.
- **Infra fix:** Added `Fundamental` stub to `fastapi-adapter.js` so `pnpm generate:capabilities` can extract OpenAPI from the new router without import errors.

## Key Patterns Reused

- `DataFrameEnvelope` + `_records_from_frame` from reference capability (`product/api/src/routers/reference.py`)
- `FakeReference` test pattern adapted to `FakeFundamental`
- TanStack route/loader/component pattern from `reference/equity.tsx` and `reference/company.$symbol.tsx`
- Capability YAML schema from reference capability records

## Gaps and Issues Encountered

1. **Reference test `test_endpoint_blocks_without_runtime_gate` is stale.** The reference router has no gate (verified by grep), but the test expects `HTTPException 403`. This caused 1 pre-existing failure in the full `pytest tests/` run. It is unrelated to fundamental work but should be fixed to avoid noise in CI.

2. **Frontend limit selector mismatch.** Phase-03 plan specified limit options 1-10, but backend accepts 1-20. Code review caught this AC mismatch. Fixed by changing `Array.from({ length: 10 }, ...)` to `length: 20` in `FundamentalTabs.tsx`.

3. **`tsc --noEmit` fails repo-wide.** Missing `@types/react` and `@types/react-dom` in `product/web/package.json` causes JSX type errors in ALL components (existing + new). This is pre-existing and does not block Vite build, but it means `npx tsc --noEmit` is not a usable validation gate.

4. **No frontend smoke test for fundamental.** `product/web/tests/` has `smoke-reference.test.mjs` but no fundamental equivalent. Marked optional in Phase-04; deferred.

5. **Evidence file for runtime verification not authored.** The write gate blocks `records/evidence/**`; operator must author the evidence file under `records/evidence/vnstock-data/`. Agent drafted findings; operator needs to write and index.

## Decisions That Held Up

- **No gate:** Following the reference router pattern (no `VNSTOCK_REFERENCE_LIVE_GATE`) was correct. The validation session proved the reference router makes direct live calls.
- **`extra="allow":** Dynamic columns via `ConfigDict(extra="allow")` handled the probe output cleanly — income statement had 24 columns, balance sheet 147, cash flow 51, ratios ~10. All vary by symbol and period.
- **No caching layer:** Kept scope tight. No performance evidence justified the complexity.

## Metrics

- Backend tests: 7/7 new pass, 13/14 total pass (1 pre-existing)
- Frontend build: 279KB bundle, 103ms build time
- `pnpm check`: pass (no drift, 84 records validated, 164 tool tests pass)
- Code review: 90/100

## Evidence Gap — Write Gate Not Surfaced to Operator

The plan Phase-04 and Phase-05 both require an evidence file under `records/evidence/vnstock-data/` with runtime verification of endpoints. The write gate blocks `records/evidence/**` and requires an operator-authored file plus a `write-path` observation.

**What went wrong:** During `/ck:cook --auto` execution, the agent did NOT prompt the operator via `AskUserQuestion` when the write gate blocked the evidence path. The agent silently noted the gate block in planning and deferred the evidence file without surfacing the decision to the operator. This is a process failure — the operator only learned about the missing evidence after the journal was written, when they asked why they were never prompted.

**Draft evidence content (for operator to author):**

```yaml
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
```

**Process fix needed:** When a write-gate block prevents completion of a required artifact, the agent must explicitly prompt the operator with `AskUserQuestion` rather than silently deferring. Auto mode should not skip human-in-the-loop for blocked paths.

## Unresolved Questions

- Should `_records_from_frame` be extracted to a shared utility to eliminate duplication between `reference.py` and `fundamental.py`?
- Should `@types/react` and `@types/react-dom` be added to restore `tsc --noEmit` as a usable gate?
- Should the stale `test_endpoint_blocks_without_runtime_gate` be removed or should a gate be added to the reference router?

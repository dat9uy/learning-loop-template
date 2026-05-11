---
phase: "2b"
title: "Symbol-Search VCI Re-route"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
type: skill
---

# Phase 2b: Symbol-Search VCI Re-route

## Context

Carry-over phase added after the vnstock runtime blocker fix. See `plan.md` → Resumption Context → Decision 1 for the authoritative narrative.

**Short version:** `/reference/search` calls `Reference().search.symbol(q, ...)`, which `vnstock_data` routes through a Dukascopy upstream. Dukascopy publishes Forex / Commodity / International Index data, not Vietnamese tickers (HOSE / HNX / UPCOM). For VN queries the endpoint returns empty — not a runtime failure, a data-universe mismatch. Re-route the endpoint to filter the VCI-backed equity list instead.

## Overview

Invoke `ck:backend-development` (or `ck:fix` if scope feels small enough) to change the internal data source of `GET /reference/search` from `Reference().search.symbol(...)` to a substring filter over `Reference().equity.list()`. Response shape stays identical so phase 4 (TanStack) and its smoke fixtures stay valid.

## Requirements

- Functional: `GET /reference/search?q=<substr>&limit=<n>` returns up to `n` rows from the VN equity universe whose `symbol` or `organ_name` matches `q` (case-insensitive substring).
- Functional: when `q` matches nothing, return `row_count: 0`, empty `rows`, columns list unchanged.
- Non-functional: response model `SymbolSearchResponse(columns, rows, row_count)` shape **must not change** — column set may differ (it will now come from the equity-list catalog), but the envelope is frozen.
- Non-functional: pytest suite still all green; existing `test_reference.py` mocks for search updated to the new internal call.
- Non-functional: opt-in live smoke test confirms a known VN ticker (e.g. `VIC`) is returned for `q=VIC` against live VCI data.

## Related Code Files

- Modify: `product/api/src/routers/reference.py` — replace the body of `search_symbol(...)`.
- Modify: `product/api/tests/test_reference.py` — update the `/reference/search` mock to patch `Reference().equity.list` instead of `Reference().search.symbol`.
- Optional: `product/api/tests/test_vci_smoke.py` — add a network-marked test asserting `q=VIC` returns a non-empty frame containing `VIC`. Mirror existing gating (`VNSTOCK_SMOKE_TEST_ALLOW_LIVE`).
- Read: `product/api/src/models/reference.py` — confirm `SymbolSearchResponse` shape (do not modify).
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml` — confirm route contract (read-only; loop phase will refresh).
- Read: `records/evidence/vnstock-data/runtime-403-fix-20260511.md` — equity-list call already proven live (`row_count: 1742`, columns `symbol,org_name`).

## Implementation Steps

1. Pre-flight: `product/api/.venv/bin/python -c "import vnstock_data; from src import vendor_compat"` from `product/api/`. If it fails, STOP — operator must rerun `pnpm bootstrap:api`.
2. Read `routers/reference.py` and `models/reference.py` to confirm current state.
3. Replace `search_symbol` body. Recommended implementation outline:
   - Call `Reference().equity.list()` once per request (no caching in this phase — KISS).
   - Normalize `q` to upper-case for `symbol`, original case for `organ_name` substring match.
   - Filter rows where `symbol.str.contains(q, case=False, na=False)` OR `organ_name.str.contains(q, case=False, na=False)` (use whichever column the live list actually exposes — confirm column name with the smoke evidence file; the runtime-fix evidence shows `symbol` and `org_name`).
   - Apply `.head(limit)` then pass through `_records_from_frame(...)` (existing helper handles NaN sanitization).
   - Return `SymbolSearchResponse(columns, rows, row_count=len(rows))`.
4. Update `test_reference.py`:
   - Patch `vnstock_data.Reference().equity.list` (not `.search.symbol`) to return a small fixture DataFrame.
   - Assert filter behavior (matching substring returns rows, non-matching returns empty, `limit` is respected).
5. Optional: add `test_vci_search_returns_vn_ticker` in `test_vci_smoke.py` behind `VNSTOCK_SMOKE_TEST_ALLOW_LIVE` / `@pytest.mark.network`.
6. Run `product/api/.venv/bin/pytest product/api/tests/` — all tests pass.
7. Run `pnpm validate:records` and `pnpm check` (must pass — confirms skill phase touched no records).

## Pre-Drafted Constraint Prompt

```text
Task: Re-route the /reference/search endpoint to a VCI-backed catalog source.

Work context: /home/datguy/codingProjects/learning-loop-template

Background:
- The endpoint currently calls Reference().search.symbol(q, limit=...), which vnstock_data
  routes through Dukascopy. Dukascopy serves Forex / Commodity / International Index data,
  not Vietnamese equity tickers, so VN queries return empty.
- Live VCI is proven working via experiment-vnstock-runtime-403-fix-20260511T143500Z
  and product/api/tests/test_vci_smoke.py.

Read first:
- product/api/src/routers/reference.py
- product/api/src/models/reference.py
- product/api/tests/test_reference.py
- product/api/tests/test_vci_smoke.py
- records/evidence/vnstock-data/runtime-403-fix-20260511.md

Pre-flight (must pass before any code change):
- cd product/api && .venv/bin/python -c "import vnstock_data; from src import vendor_compat"
- If this fails, STOP. Report: "Bootstrap missing. Run pnpm bootstrap:api and retry."

Goal:
- Change ONLY the internal data source of search_symbol(...) in routers/reference.py.
- Source becomes a substring filter over Reference().equity.list() against `symbol` and
  the catalog's name column (confirm exact column name — the runtime-fix evidence shows
  `symbol,org_name`; if live response uses `organ_name`, prefer that).
- Match is case-insensitive substring; both columns participate in the OR.
- Apply .head(limit) after filtering, then pass through _records_from_frame.
- Keep SymbolSearchResponse(columns, rows, row_count) shape unchanged — no model edits.

Allowed write paths:
- product/api/src/routers/reference.py
- product/api/tests/test_reference.py
- product/api/tests/test_vci_smoke.py (additions only)

Forbidden actions:
- Do NOT modify product/api/src/models/reference.py.
- Do NOT modify any file under records/ (including capabilities, claims, experiments,
  evidence). Loop phase 3 will refresh the capability record after this phase.
- Do NOT capture raw external data, credentials, or config contents in tests.
- Do NOT make live provider calls in unit tests — only in the network-marked smoke test.
- Do NOT run scripts/install-vnstock.sh.

Validation:
- product/api/.venv/bin/pytest product/api/tests/ — all tests must pass.
- pnpm validate:records and pnpm check must pass (confirms no record edits).
- Optional: VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 product/api/.venv/bin/pytest -m network
  -v product/api/tests/test_vci_smoke.py — must pass against live VCI.

Stop conditions:
- Pre-flight import check fails.
- The live equity list does not expose a usable name column matching the evidence
  observation (symbol / org_name / organ_name).
- A test fails and cannot be fixed within skill context.
```

## Success Criteria

### Process Steps
- [ ] Pre-flight import + vendor_compat check passed.
- [ ] `search_symbol` re-implemented as filter over `Reference().equity.list()`.
- [ ] Response shape (`SymbolSearchResponse`) unchanged.
- [ ] `test_reference.py` mocks updated, all unit tests pass.
- [ ] Optional live smoke test passes for `q=VIC` (returns row containing `VIC`).
- [ ] `pnpm validate:records` and `pnpm check` pass.

### Experiment Outcome
- Skill phase outcome will be captured in phase 3's experiment record (no separate experiment for 2b — see plan.md → Decision 4).

## Risk Assessment

- Risk: Live equity-list column name differs from the evidence file (`symbol` / `org_name` vs `organ_name` etc.). Mitigation: smoke test asserts the actual response; skill agent confirms column name via brief live read before coding the filter.
- Risk: Filter performance — calling `Reference().equity.list()` per request fetches ~1742 rows. Acceptable for MVP (no SLA). If later phases gate on latency, add caching in a separate task.
- Risk: Response shape drifts (different columns than mocked search). Mitigation: pydantic `SymbolSearchResponse` accepts `columns: list[str]` and `rows: list[dict]` — schema-passthrough, so any column set from the equity list works without model edit.
- Risk: Skill phase touches records despite constraint. Mitigation: diff review before phase 3.

## Approval Gate

Operator approval required before phase 3. Review:

- Diff of `routers/reference.py` and `tests/test_reference.py`.
- Confirm no files under `records/` were modified.
- Confirm `SymbolSearchResponse` shape unchanged (so phase 4 fixtures stay valid).

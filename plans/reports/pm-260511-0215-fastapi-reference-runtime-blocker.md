---
title: "FastAPI Reference Runtime Blocker"
created: "2026-05-11T02:15:00Z"
plan: "plans/260511-0030-fastapi-reference-build/plan.md"
status: blocked
---

# FastAPI Reference Runtime Blocker

## Summary

The FastAPI Reference Build is blocked at runtime close-out, not implementation. API tests, web smoke tests, web build, and record validators pass, but live metadata-only runtime proof fails before endpoint metadata can be captured.

## Current Plan State

| Phase | Status | Reason |
|---|---|---|
| 1 Pre-Build Records | completed | Records authored and validate. |
| 2 FastAPI Reference Implementation | completed | FastAPI app and mocked tests pass. |
| 3 Post-Build Records API | blocked | Live metadata-only `Reference().equity.list()` fails with provider JSON decode error. |
| 4 TanStack Reference Implementation | completed | Routes, components, fixture tests, and build pass. |
| 5 Post-Build Records Web | blocked | Runtime promotion depends on verified API endpoint evidence. |

## Error Evidence

Primary evidence:

- `records/evidence/product-build/fastapi-reference-endpoints.md`
  - `claim_support: blocked`
  - `/reference/equity` blocked before metadata completion by provider JSON decode failure.
  - No raw external data, credential values, config contents, row values, or response bodies retained.

Experiment records:

- `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml`
  - `result: blocked`
  - `agent_outcome`: API tests passed; live metadata check blocked by provider JSON decode failure.
  - `observations`: `/reference/equity` blocked with sanitized exception class.
- `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml`
  - Web close-out remains blocked because API runtime evidence is blocked.

Surface claims remain unpromoted:

- `records/claims/claim-product-fastapi-reference.yaml`
  - `verification.runtime.status: claimed`
- `records/claims/claim-product-tanstack-reference-view.yaml`
  - `verification.runtime.status: claimed`

## Capability Script Recheck

Direct capability script execution was rerun:

```bash
product/api/.venv/bin/python product/api/capabilities/vnstock-data/capability-01-reference.py
```

Result: failed at the same provider path:

```text
ref.equity.list()
ConnectionError: API request failed: Expecting value: line 1 column 1 (char 0)
```

This means the failure is not specific to the FastAPI wrapper. The capability script now fails at the same `vnstock_data.Reference().equity.list()` call.

## Version Drift

Earlier passing runtime evidence:

- `records/evidence/vnstock-data/capability-runtime-output.md`
  - `vnstock_data` package metadata: `3.1.7`
  - `vnstock` core package metadata: `4.0.2`
  - `capability-01-reference.py`: passed

Current environment:

```text
vnstock_data=3.1.3
vnstock=4.0.2
vnai=2.4.8
```

The current `product/api/.venv` has older `vnstock_data` than the passing evidence. `product/api/scripts/install-vnstock.sh` skips reinstall whenever `import vnstock_data` succeeds, so a stale but importable package can remain in place.

## Root Cause Assessment

Most likely root cause: runtime environment drift. The current environment imports `vnstock_data 3.1.3`, while successful capability runtime evidence was captured with `vnstock_data 3.1.7`. Both the product endpoint and direct capability script now fail on the same live provider call, so the wrapper is not the trigger.

## Validation Snapshot

Passing validation after implementation fixes:

```bash
product/api/.venv/bin/pytest product/api/tests/
CI=true pnpm --dir product/web test
pnpm --dir product/web build
pnpm validate:records
pnpm check
```

Observed results:

- API tests: `4 passed`
- Web smoke tests: `4 passed`
- Web build: passed
- Record validation: `Validated 27 records`

## Recommended Next Action

Refresh the API runtime to the expected `vnstock_data` version, then rerun:

```bash
product/api/.venv/bin/python product/api/capabilities/vnstock-data/capability-01-reference.py
VNSTOCK_REFERENCE_LIVE_GATE=approved PYTHONPATH=product/api product/api/.venv/bin/python -c 'from src.main import create_app; from fastapi.testclient import TestClient; r=TestClient(create_app()).get("/reference/equity"); print(r.status_code)'
```

Only promote `claim-product-fastapi-reference` and `claim-product-tanstack-reference-view` after metadata-only runtime evidence passes without retaining raw external data.

## Unresolved Questions

- Should bootstrap force reinstall/upgrade when `vnstock_data` imports but version is below the required floor?
- Should the required `vnstock_data` version be explicitly pinned in `product/api/pyproject.toml` or kept vendor-installer managed?

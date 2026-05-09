---
phase: 3
title: "Capability Execution"
status: pending
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Capability Execution

## Overview

Run the five capability scripts against live vnstock_data endpoints using the shared environment. Capture metadata, schema shapes, and redacted sample output.

## Requirements

- Functional: Each capability script executes without error and returns data.
- Non-functional: Output capture respects the `runtime-captured` policy. No raw data committed.

## Architecture

Execution flow:
```
product/.venv/bin/python product/capabilities/vnstock-data/capability-00-discovery.py
  -> capture: API tree structure, import check
product/.venv/bin/python product/capabilities/vnstock-data/capability-01-reference.py
  -> capture: symbol count, column names, row counts
product/.venv/bin/python product/capabilities/vnstock-data/capability-02-market.py
  -> capture: OHLCV columns, quote schema, order book depth
product/.venv/bin/python product/capabilities/vnstock-data/capability-03-fundamental.py
  -> capture: financial statement columns, ratio names
product/.venv/bin/python product/capabilities/vnstock-data/capability-04-insights-macro.py
  -> capture: ranking columns, GDP/CPI schema
```

## Related Code Files

- Existing: `product/capabilities/vnstock-data/capability-*.py`
- Create: `records/evidence/vnstock-data/capability-runtime-output.md` (evidence envelope)

## Implementation Steps

1. Activate the shared environment: `source product/.venv/bin/activate`.
2. Run `capability-00-discovery.py` and capture output.
3. Run `capability-01-reference.py` and capture output.
4. Run `capability-02-market.py` and capture output.
5. Run `capability-03-fundamental.py` and capture output.
6. Run `capability-04-insights-macro.py` and capture output.
7. Curate captured output into an evidence envelope at `records/evidence/vnstock-data/capability-runtime-output.md`.
8. Verify no raw cell values, credentials, or full dataframes are in the envelope.

## Success Criteria

- [ ] All 5 capability scripts execute without `ModuleNotFoundError` or `AuthenticationError`.
- [ ] Each script returns at least one non-empty DataFrame or structured result.
- [ ] Evidence envelope captures: column names, row counts, schema shapes, redacted sample rows.
- [ ] No raw external data or credentials in the envelope.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Rate limiting during execution | Low | Scripts use minimal calls; run sequentially with brief pauses if needed. |
| API schema drift vs. snapshot docs | Medium | Compare output columns to `unified-ui-snapshot/` schemas; note discrepancies. |
| Authentication expiry mid-run | Low | Re-verify auth before execution; scripts are stateless and can be rerun. |
| Output capture includes raw data | Critical | Review envelope manually before any commit. |

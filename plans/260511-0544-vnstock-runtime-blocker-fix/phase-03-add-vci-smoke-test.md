---
phase: 3
title: "Add VCI smoke test"
status: pending
priority: P2
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Add VCI smoke test

## Overview

Add `product/api/tests/test_vci_smoke.py` that imports `vendor_compat`, then calls `vnstock_data.Reference().equity.list()` against the live VietCap API. Asserts a non-empty DataFrame is returned (not 403 HTML, not raises). Marked `@pytest.mark.network` so default `pytest` runs skip it; `pnpm smoke:vci` (or `uv run pytest -m network`) opt-in target invokes it. Becomes the regression detector for future vendor header-schema changes.

## Requirements

- Functional: test passes when patch is active; fails loud when patch removed or upstream changes.
- Non-functional: opt-in via pytest marker; single network call per run; deterministic assertions.

## Architecture

- Test file at `product/api/tests/test_vci_smoke.py`.
- Uses `pytest.mark.network` marker (register in `product/api/pyproject.toml [tool.pytest.ini_options]`).
- Imports `from src import vendor_compat` first to ensure patch in test environment.
- **Env-var gate**: the test must check `os.environ.get("VNSTOCK_SMOKE_TEST_ALLOW_LIVE")`; if unset, skip with a clear message. This prevents accidental CI execution from a different IP (which could flag the bronze-tier slot).
- Calls multiple surfaces to cover all 7 VCI modules:
  - `Reference().equity.list()` (listing.py)
  - `Reference().company("VIC").info()` (company.py)
  - `Reference().search.symbol("VNM", limit=1)` (quote.py or search path)
- Assertions per call:
  - Returned object is a pandas DataFrame or dict (not raises, not HTML str)
  - `len(result) > 0` (or result is non-empty dict)
  - Has expected column/key subset (verify against current schema after first run)

## Related Code Files

- Create: `product/api/tests/test_vci_smoke.py`
- Modify: `product/api/pyproject.toml` (add `[tool.pytest.ini_options] markers = ["network: marks tests requiring external network access"]`)
- Modify (optional): `package.json` (add `"smoke:vci": "cd product/api && VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 uv run pytest -m network -v tests/test_vci_smoke.py"`)

## Implementation Steps

1. Add to `product/api/pyproject.toml`:
   ```toml
   [tool.pytest.ini_options]
   markers = [
       "network: marks tests requiring external network access",
   ]
   ```
2. Create `tests/test_vci_smoke.py`:
   ```python
   import os
   import pytest
   from src import vendor_compat  # noqa: F401 — must run before vnstock_data
   from vnstock_data import Reference

   @pytest.mark.network
   def test_vci_equity_list_returns_dataframe():
       if not os.environ.get("VNSTOCK_SMOKE_TEST_ALLOW_LIVE"):
           pytest.skip("VNSTOCK_SMOKE_TEST_ALLOW_LIVE not set")
       df = Reference().equity.list()
       assert df is not None and len(df) > 0
       assert "symbol" in df.columns or "ticker" in df.columns

   @pytest.mark.network
   def test_vci_company_info_returns_data():
       if not os.environ.get("VNSTOCK_SMOKE_TEST_ALLOW_LIVE"):
           pytest.skip("VNSTOCK_SMOKE_TEST_ALLOW_LIVE not set")
       info = Reference().company("VIC").info()
       assert info is not None
       assert isinstance(info, (dict, type(None))) is False  # must be non-empty
   ```
3. Run `cd product/api && VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 uv run pytest -m network tests/test_vci_smoke.py -v` and verify pass.
4. Verify that without the env var, pytest skips both tests (default `uv run pytest` should show 2 skipped, 0 failed).
5. (Optional) Add `smoke:vci` script to root `package.json` as shown in Related Code Files.

## Todo List

- [ ] Register `network` marker in pyproject.toml
- [ ] Write smoke test file with env-var gate
- [ ] Validate locally with live network (set env var)
- [ ] Validate default run skips smoke tests (no env var)
- [ ] Adjust assertions to match actual column names / return shapes
- [ ] (Optional) Wire `pnpm smoke:vci`

## Related Code Files

- Create: `product/api/tests/test_vci_smoke.py`
- Modify: `product/api/pyproject.toml` (add `[tool.pytest.ini_options] markers = ["network: marks tests requiring network"]`)
- Modify (optional): `package.json` (add `"smoke:vci": "cd product/api && uv run pytest -m network -v tests/test_vci_smoke.py"`)

## Implementation Steps

1. Add the pytest marker registration to `pyproject.toml` to silence the `PytestUnknownMarkWarning`.
2. Create `tests/test_vci_smoke.py`:
   ```python
   import pytest
   from src import vendor_compat  # noqa: F401 — must run before vnstock_data
   from vnstock_data import Reference

   @pytest.mark.network
   def test_vci_equity_list_returns_dataframe():
       df = Reference().equity.list()
       assert df is not None
       assert len(df) > 0
       assert "symbol" in df.columns or "ticker" in df.columns  # adjust after first run
   ```
3. Run `cd product/api && uv run pytest -m network tests/test_vci_smoke.py -v` and verify pass.
4. (Optional) Add `smoke:vci` script to root `package.json` if pnpm orchestration is desired.

## Todo List

- [ ] Register `network` marker in pyproject.toml
- [ ] Write smoke test file
- [ ] Validate locally with live network
- [ ] Adjust assertions to match actual column names
- [ ] (Optional) Wire `pnpm smoke:vci`

## Success Criteria

- [ ] `uv run pytest -m network` passes after Phases 1+2 applied
- [ ] Same command fails (raises or returns 403-HTML-decode error) when `vendor_compat` import is commented out (proves the test is meaningful)
- [ ] Default `uv run pytest` (without `-m network`) skips the smoke test

## Risk Assessment

- **Network flake**: occasional 5xx from VietCap. Mitigation: accept; test is opt-in, not gating.
- **Column names drift**: VietCap schema may add/remove fields. Mitigation: assert on minimum subset, not exact equality.
- **Rate limiting**: low risk for single call/run. Mitigation: don't run in tight CI loop.

## Security Considerations

- Test hits public VietCap endpoint via vendor packages; no credentials in test code.

## Next Steps

- Phase 4 uses this test's output as `proof_refs` for the claim promotion.

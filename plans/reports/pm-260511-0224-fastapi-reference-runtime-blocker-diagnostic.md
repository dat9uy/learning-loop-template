---
title: "FastAPI Reference Runtime Blocker — Diagnostic Report"
created: "2026-05-11T02:24:00Z"
plan: "plans/260511-0030-fastapi-reference-build/plan.md"
status: superseded
superseded_by:
  - "plans/reports/pm-260511-0259-vnstock-installer-deep-dive.md"
  - "plans/reports/pm-260511-0341-vnstock-source-read-findings.md"
reference_doc: "docs/vendor-vnstock-installer.md"
claim: "records/claims/claim-vnstock-runtime-403-root-cause.yaml"
---

# FastAPI Reference Runtime Blocker — Diagnostic Report

> **Update 2026-05-11 03:41** — Source-read of installed packages **falsified** parts of this diagnostic:
> - The "URL trailing-slash bug" claim is **WRONG**. `_TRADING_URL` has no trailing slash in source; the URL is well-formed.
> - The "VNSTOCK_CONFIG_PATH dir-vs-file contract mismatch" framing is misleading. Runtime does not read that env var at all; bug is wrapper-side (env var set one path-segment too deep).
> - Real root causes: (1) wrapper config bug A; (2) missing `Device-Id` header in `vnstock_data`'s VCI requests, bug C'.
> See `plans/reports/pm-260511-0341-vnstock-source-read-findings.md` and `records/claims/claim-vnstock-runtime-403-root-cause.yaml` for revised analysis.
> See `docs/vendor-vnstock-installer.md` for the reference behavior doc.
> Original analysis below preserved for traceability — **do not act on its fix options**.

## Executive Summary

The FastAPI Reference Build is blocked at runtime close-out. The root cause is **not** version drift in `vnstock_data`. The actual cause is a **URL double-slash bug** in the `vnstock` package (v4.0.2) that causes the VietCap API to return 403 HTML instead of JSON.

## What Changed from Passing Evidence

| | Passing (May 10) | Failing (May 11) |
|---|---|---|
| `vnstock_data` metadata | 3.1.7 | 3.1.3 |
| `vnstock_data.__version__` | 3.0.0 | 3.0.0 |
| `vnstock` core | 4.0.2 | 4.0.2 |
| `vnai` | 2.4.8 | 2.4.8 |

The installer log shows it downloaded `vnstock_data-3.1.7` but dist-info reports `3.1.3`. This is a packaging inconsistency, not the root cause.

## Root Cause: Double Slash in API URL

**Bug location:** `vnstock/explorer/vci/const.py`
```python
_TRADING_URL = 'https://trading.vietcap.com.vn/api/'  # trailing slash
```

**Bug location:** `vnstock_data/explorer/vci/listing.py`
```python
F = self.base_url + '/price/symbols/getAll'  # adds another slash
```

**Result:** `https://trading.vietcap.com.vn/api//price/symbols/getAll`

**Server response:** 403 Forbidden with HTML error page

**JSON decoder:** Fails with `Expecting value: line 1 column 1 (char 0)`

## Why This Worked Before

Hypothesis: The VietCap API server previously tolerated double-slash URLs (treating `api//price` as `api/price`). A server-side change now rejects them with 403.

## Installation Process Deep-Dive

The `vnstock_data` package is installed via a **private vendor CLI installer**, not PyPI:

1. `install-vnstock.sh` downloads `vnstock-cli-installer.run` from `vnstocks.com`
2. Installer registers device (consumes 1 bronze-tier slot)
3. Installer downloads `vnstock_data-3.1.7.tar.gz` from vendor CDN
4. Extracts and installs into `.venv`
5. **Import check fails** with `IsADirectoryError: [Errno 21] Is a directory: '.../.vnstock/user.json'`
   - This is because `VNSTOCK_CONFIG_PATH` points to a directory, not a file
   - The `vnstock_data.core.utils.env.idv()` function tries to `open()` the directory as a JSON file

## Key Finding: Config Path Bug

The installer script sets:
```bash
VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock/user.json"
```

But `.vnstock/user.json` is a **directory** containing:
- `api_key.json`
- `auth_state.json`
- `user.json` (the actual file)
- `vnstock_installer.log`

The `vnstock_data` code expects `VNSTOCK_CONFIG_PATH` to point to the actual `user.json` **file**, not the directory. This causes the import check to fail, but the installer reports "success" anyway.

## Verification Commands

```bash
# Reproduce the failure
product/api/.venv/bin/python product/api/capabilities/vnstock-data/capability-01-reference.py

# Verify the double-slash URL returns 403
curl -I 'https://trading.vietcap.com.vn/api//price/symbols/getAll'

# Verify the correct URL works
curl -I 'https://trading.vietcap.com.vn/api/price/symbols/getAll'
```

## Recommended Fix Options

**Option A: Patch `vnstock` const.py**
Remove trailing slash from `_TRADING_URL`. Quick but modifies vendor code.

**Option B: Reinstall from scratch**
Delete `.venv`, run `uv sync`, then `install-vnstock.sh`. May not fix if vendor hasn't updated.

**Option C: Fix config path in install script**
Change `VNSTOCK_CONFIG_PATH` to point to the actual file, not directory. May fix import check.

**Option D: Post-install patch script**
Add a step that patches `const.py` after installation. Reproducible across reinstalls.

## Next Steps

1. Decide which fix option to pursue
2. Delete `.venv` and rebuild cleanly
3. Verify capability scripts pass
4. Verify FastAPI wrapper `/reference/equity` passes
5. Update records with new evidence

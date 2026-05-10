---
title: "vnstock Source-Read Findings — Two Root Causes, Prior Diagnostic Falsified in Part"
created: "2026-05-11T03:41:00+07:00"
parent_reports:
  - "plans/reports/pm-260511-0224-fastapi-reference-runtime-blocker-diagnostic.md"
  - "plans/reports/pm-260511-0259-vnstock-installer-deep-dive.md"
reference_doc: "docs/vendor-vnstock-installer.md"
claim: "records/claims/claim-vnstock-runtime-403-root-cause.yaml"
status: findings-complete
plan: "plans/260511-0030-fastapi-reference-build/plan.md"
---

# vnstock Source-Read Findings — Two Root Causes, Prior Diagnostic Falsified in Part

Source-read of `vnstock_data 3.1.3` + `vnstock 4.0.2` + `vnai` performed on 2026-05-11 against the installed venv copy at `product/api/.venv/lib/python3.12/site-packages/`. Source was staged to `/tmp/vnstock-source-inspect/` for inspection (global `.ckignore` blocks direct `.venv` access). No code modified; no re-install; no slot consumption.

## What the Prior Diagnostic Got Wrong

| Prior claim | Source-read verdict | Where confirmed |
|---|---|---|
| `_TRADING_URL` has trailing slash → `…/api//price/…` → 403 | **FALSE** — source has no trailing slash: `_TRADING_URL = 'https://trading.vietcap.com.vn/api'`. Concatenation produces well-formed URL. | `venv:vnstock/explorer/vci/const.py:2` |
| `vnstock_data.idv()` reads `VNSTOCK_CONFIG_PATH` as a file | **FALSE** — `idv()` reads `PROJECT_DIR/'user.json'` where `PROJECT_DIR = Path.home()/'.vnstock'`. Env var is **not consulted at runtime at all**. | `venv:vnstock_data/core/utils/env.py:60`, `venv:vnstock_data/core/utils/const.py:1-4` |
| `VNSTOCK_CONFIG_PATH` directory-vs-file is bidirectional contract mismatch | Partially. Installer treats it as directory (true). Runtime ignores it entirely (false). The real bug is wrapper-side: we pass a path one segment too deep. | source-read of both layers |

## Two Independent Root Causes

### Cause 1 — Wrapper config bug (causes IsADirectoryError on import)

`install-vnstock.sh:75` sets:
```sh
VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock/user.json"
```

The installer treats this env var as the **directory** to write `api_key.json`, `device.id`, `user.json`, `user_install.json`, `vnstock_installer.log` into. Result: `.vnstock/user.json/` is a directory; runtime opens `.vnstock/user.json` and gets `IsADirectoryError`.

**Fix**: set `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock"`. Installer writes the four files at top of `.vnstock/`. Runtime reads `Path.home()/'.vnstock'/'user.json'` (with HOME=API_HOME) and finds the FILE. No `normalize_vnstock_config` needed; delete it.

### Cause 2 — Vendor bug C': missing `Device-Id` header in vnstock_data (causes 403)

`vnstock_data/core/utils/user_agent.py:get_headers` returns only DEFAULT_HEADERS + User-Agent + Referer/Origin. No Device-Id.

`vnstock/core/utils/user_agent.py:get_headers` lines 289-299:
```python
if data_source.upper() == 'VCI':
    vci_device_id = _generate_vci_device_id()
    headers['Device-Id'] = vci_device_id
    current_cookie = headers.get('Cookie', '')
    if current_cookie:
        headers['Cookie'] = f'device_id={vci_device_id}; {current_cookie}'
    else:
        headers['Cookie'] = f'device_id={vci_device_id}'
```

`vnstock_data` has **zero** references to `Device-Id` in its codebase (`grep` confirms).

`vnstock_data.explorer.vci.listing.Listing` (line 25) imports `get_headers` from `vnstock_data.core.utils.user_agent`, not from `vnstock.core.utils.user_agent`. Every VCI request originating in vnstock_data ships without Device-Id. VietCap's API now requires it → 403 for all such requests.

The two libraries forked their header builders. `vnstock` was updated; `vnstock_data` was not.

**Fix options** (low → high effort):
1. **Monkey-patch at app import**: replace `vnstock_data.core.utils.user_agent.get_headers` with `vnstock.core.utils.user_agent.get_headers`. Lives in our wrapper code, not venv. Reversible. Survives reinstalls.
2. **Patch vendor source in venv**: edit `vnstock_data/core/utils/user_agent.py:get_headers` to mirror vnstock's Device-Id block. Idempotent; needs SHA-style guard so reinstalls re-apply.
3. **Re-route through `vnstock.Listing`**: use the PyPI vnstock's Listing class (already does Device-Id). May lose vnstock_data-specific enhancements.

Recommend option 1: smallest blast radius, lives in our code, easy to remove when vendor ships a fix.

## Version Drift Summary

| Source of truth | Reported version |
|---|---|
| Tarball filename (vendor CDN) | `vnstock_data-3.1.7.tar.gz` |
| dist-info METADATA | `Version: 3.1.3` |
| Source `__version__` constant | `'3.0.0'` |

Three-way disagreement. Confidence in "what version is installed" should be **dist-info `3.1.3`**, since that is what pip/importlib.metadata sees. No action; out of scope.

## Files Created or Modified This Session

| Path | Change |
|---|---|
| `docs/vendor-vnstock-installer.md` | Updated: bug table revised (A only, drop B/C, add C'), env-var contract corrected, decision matrix rewritten, recommendation summary rewritten, unresolved questions resolved/pruned |
| `records/claims/claim-vnstock-runtime-403-root-cause.yaml` | **New** — claim record with static verification status, install/runtime still claimed |
| `plans/reports/pm-260511-0341-vnstock-source-read-findings.md` | **New** — this file |
| `/tmp/vnstock-source-inspect/` | Staged source copy for analysis; can be removed when done |
| `/tmp/vnstock-source-copy.py` | One-shot helper; can be removed when done |

## Recommended Next Steps

1. **Apply the wrapper env-var fix** to `install-vnstock.sh`. Single-line change. Delete `normalize_vnstock_config`. Run the bootstrap.
2. **Add monkey-patch module** in `product/api/` that runs at app import and replaces `vnstock_data.core.utils.user_agent.get_headers` with `vnstock`'s. Verify it patches before `vnstock_data.explorer.vci.listing` is imported.
3. **Run smoke test**: `/reference/equity` capability or direct `vnstock_data.Listing().symbols_by_exchange()` call. Expect JSON 200, not 403 HTML.
4. **Promote claim from draft → reviewed → approved** based on successful runtime experiment.
5. **Clean up**: remove `/tmp/vnstock-source-inspect/` and `/tmp/vnstock-source-copy.py` after the fix is confirmed.

## Unresolved Questions

1. Does the monkey-patch trigger before `vnstock_data.explorer` modules are imported? Order matters — `vnstock_data.__init__.py` imports `.explorer.fmarket` at load time (line 16), and `.explorer.__init__` calls `idv()`. The patch must land before any `import vnstock_data`.
2. Are there OTHER `vnstock_data` modules that also build headers without Device-Id (besides `listing.py`)? Need to grep all explorer/vci/*.py to confirm coverage of the monkey-patch.
3. Does VietCap also enforce Device-Id on non-VCI endpoints (e.g. iq.vietcap.com.vn)? Source shows iq URLs use the same get_headers; if iq also enforces, the same fix applies. If iq does not enforce, only VCI endpoints are affected.
4. Should we file the `vnstock_data.get_headers` bug upstream with the vendor? They may already know; turnaround unknown.

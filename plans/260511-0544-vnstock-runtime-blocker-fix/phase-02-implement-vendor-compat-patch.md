---
phase: 2
title: "Implement vendor compat patch"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 2: Implement vendor compat patch

## Overview

Build `product/api/src/vendor_compat/` package that wraps `vnstock_data.core.utils.user_agent.get_headers` to inject `Device-Id` for VCI. The Device-Id logic is **inlined** (copied from `vnstock/core/utils/user_agent.py:_generate_vci_device_id`, 10 lines) instead of delegating to the `vnstock` module — this eliminates a supply-chain trust boundary. Feature-detects whether `vnstock_data.get_headers` already produces `Device-Id`; if so, patch self-disables. Wire as the **absolute first** internal import in FastAPI and capability scripts.

## Requirements

- Functional: VCI request headers include `Device-Id` and `Cookie: device_id=...` after patch.
- Non-functional: patch self-disables when vendor ships own fix (feature-detect, not version-pin). Log exactly once per process. No edits to `.venv/`. **No dependency on `vnstock` module for the patch logic.**

## Architecture

### Import-order trap

`vnstock_data/__init__.py:16` imports `.explorer.fmarket` at load. `vnstock_data.explorer.vci.listing.py:25` does `from vnstock_data.core.utils.user_agent import get_headers` — once that line runs, the listing module's local `get_headers` name is bound to the original function. Patching the source module afterward has no effect on listing.

**Strategy**: patch the source module **before** any `vnstock_data.explorer.vci.*` module is imported. `vnstock_data/__init__.py` loads `.explorer.fmarket` (not `.explorer.vci.*`) at import time, so the window exists. We patch as early as possible. **After patching, assert no VCI modules are already loaded** — if they are, log CRITICAL.

**Belt-and-braces**: also rebind `vnstock_data.explorer.vci.*.get_headers` directly (if any module already loaded) so we cover late-imported scripts. Iterate `sys.modules` for any key starting with `vnstock_data.explorer.vci.` and rebind its local `get_headers` reference.

**fmarket gap**: `vnstock_data.explorer.fmarket.fund.py:27` also imports `get_headers` but uses `data_source='FMK'` (not VCI). The patch wraps `get_headers` globally but only injects Device-Id when `data_source == 'VCI'`, so fmarket behavior is unchanged.

### Module layout

```
product/api/src/vendor_compat/
  __init__.py             # calls ensure_vci_device_id() once on import
  vnstock_device_id.py    # patch logic + feature-detect + logging
```

### Inlined Device-Id logic (from vnstock 4.0.2 source)

```python
# Copied from vnstock/core/utils/user_agent.py to avoid supply-chain trust boundary
import secrets

def _generate_vci_device_id() -> str:
    return secrets.token_hex(8)  # 16-char hex string

def _inject_device_id_for_vci(headers: dict) -> dict:
    data_source = headers.get("Data-Source", "VCI")
    if data_source.upper() == "VCI":
        vci_device_id = _generate_vci_device_id()
        headers["Device-Id"] = vci_device_id
        current_cookie = headers.get("Cookie", "")
        if current_cookie:
            headers["Cookie"] = f"device_id={vci_device_id}; {current_cookie}"
        else:
            headers["Cookie"] = f"device_id={vci_device_id}"
    return headers
```

### Patch logic (pseudocode)

```python
# vnstock_device_id.py
import importlib.metadata
import logging
import sys

import vnstock_data
import vnstock_data.core.utils.user_agent as _vd_ua

_patched = False
_log = logging.getLogger("vendor_compat.vnstock_device_id")

def _patch_get_headers():
    original = _vd_ua.get_headers
    def wrapped(*args, **kwargs):
        headers = original(*args, **kwargs)
        return _inject_device_id_for_vci(headers)
    return wrapped

def ensure_vci_device_id() -> None:
    global _patched
    if _patched:
        return

    # Self-check: VCI modules must NOT be loaded yet
    vci_loaded = [m for m in sys.modules if m.startswith("vnstock_data.explorer.vci.")]
    if vci_loaded:
        _log.critical("VCI modules already loaded before patch: %s", vci_loaded)

    try:
        sample = _vd_ua.get_headers(data_source="VCI", random_agent=False)
    except Exception as exc:
        _log.warning("vnstock_data.get_headers raised %r; skipping patch", exc)
        _patched = True
        return

    if "Device-Id" in sample:
        _log.info(
            "vnstock_data source=%s dist=%s already injects Device-Id; patch skipped",
            vnstock_data.__version__,
            importlib.metadata.version("vnstock_data"),
        )
        _patched = True
        return

    try:
        _vd_ua.get_headers = _patch_get_headers()
    except TypeError as exc:
        _log.error("Patch failed: get_headers signature incompatible: %r", exc)
        _patched = True
        return

    # Belt-and-braces: rebind all known and dynamically loaded VCI consumers
    _vci_prefix = "vnstock_data.explorer.vci."
    for modname in list(sys.modules):
        if modname.startswith(_vci_prefix) and hasattr(sys.modules[modname], "get_headers"):
            sys.modules[modname].get_headers = _vd_ua.get_headers

    _log.info(
        "vnstock_data source=%s dist=%s patched: Device-Id now injected for VCI",
        vnstock_data.__version__,
        importlib.metadata.version("vnstock_data"),
    )
    _patched = True
```

### Wiring points

- **`product/api/src/main.py`**: insert as the **absolute first internal import** (before any router that may transitively import `vnstock_data`):
  ```python
  # MUST be before any router that imports vnstock_data
  from . import vendor_compat  # noqa: F401
  from .routers.reference import router as reference_router
  ```

- **`product/api/capabilities/vnstock-data/*.py`**: each standalone script prepends a `sys.path` bootstrap **before** any `vnstock_data` import:
  ```python
  import sys
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))
  from vendor_compat import ensure_vci_device_id
  ensure_vci_device_id()
  ```
  Do **not** leave this as an open decision — apply the `sys.path` pattern to all five scripts.

## Related Code Files

- Create: `product/api/src/vendor_compat/__init__.py`
- Create: `product/api/src/vendor_compat/vnstock_device_id.py`
- Modify: `product/api/src/main.py` (add compat import as first internal import)
- Modify: `product/api/capabilities/vnstock-data/capability-00-discovery.py`, `capability-01-reference.py`, `capability-02-market.py`, `capability-03-fundamental.py`, `capability-04-insights-macro.py` (compat import before vnstock_data import)

## Implementation Steps

1. Grep `product/api/.venv/.../vnstock_data/explorer/vci/` (via /tmp staging if `.ckignore` blocks direct read) for every `from ... user_agent import get_headers`. Record the full list in a comment inside `vnstock_device_id.py`.
2. Create `vendor_compat/vnstock_device_id.py` with `ensure_vci_device_id()` per the **inlined** design above.
3. Create `vendor_compat/__init__.py` that calls `ensure_vci_device_id()` on import.
4. Modify `src/main.py`: insert the compat import as the **first internal import** with a loud comment (see Wiring points).
5. For **each** of the five capability scripts, prepend the `sys.path` bootstrap + `ensure_vci_device_id()` pattern exactly as shown in Wiring points. Do not leave as an open decision.
6. Add `logging.basicConfig(level=logging.INFO)` only in capability scripts where logging isn't already configured — main FastAPI app may already have logging.
7. Verify the patch:
   - Temporarily add a print after compat import in `main.py`: `from vnstock_data.core.utils.user_agent import get_headers; print('Device-Id' in get_headers(data_source='VCI', random_agent=False))` → expect True.
   - Run each capability script and confirm no `ModuleNotFoundError` on `vendor_compat`.
   - Check logs for the CRITICAL warning if any VCI module was pre-loaded (should not happen).

## Todo List

- [ ] Enumerate every `vnstock_data` module that imports `get_headers` (grep via /tmp staging)
- [ ] Create vendor_compat package + patch logic
- [ ] Wire compat import into FastAPI main.py
- [ ] Wire compat import into all five capability scripts
- [ ] Manual verify: patched `get_headers` for VCI includes Device-Id

## Success Criteria

- [ ] `vendor_compat` package created and importable
- [ ] Feature-detect path works: confirm by mocking `_vd_ua.get_headers` to return a Device-Id and seeing log "patch skipped"
- [ ] `main.py` imports compat as the **first** internal import, before routers
- [ ] All five capability scripts bootstrap `sys.path` and call `ensure_vci_device_id()` before any `vnstock_data` symbol use
- [ ] After import, `vnstock_data.core.utils.user_agent.get_headers(data_source='VCI', ...)['Device-Id']` is a non-empty string
- [ ] Belt-and-braces loop covers all 7 VCI modules (listing, event, quote, company, screener, trading, financial)
- [ ] Log message uses `importlib.metadata.version('vnstock_data')` as canonical version, not `__version__` alone
- [ ] No `vnstock` module import inside `vendor_compat` (inlined logic only)

## Risk Assessment

- **Import-order regression**: a future contributor adds `from vnstock_data import X` before the compat import. Mitigation: loud comment above the import; add a CI grep check that `vendor_compat` appears before `vnstock_data` in `main.py` and capability scripts.
- **VCI module pre-loaded**: some transitive import loads a VCI module before `vendor_compat` runs. Mitigation: the self-check logs CRITICAL with the pre-loaded module list. Phase 3 smoke test catches functional impact.
- **Vendor signature change**: future `vnstock_data.get_headers` changes kwargs. Mitigation: `TypeError` guard around rebinding logs and skips. The wrapper preserves the original signature via `*args, **kwargs`.
- **Capability scripts run with different sys.path**: import resolution fails. Mitigation: explicit `sys.path.insert` with `Path(__file__).resolve().parents[2] / "src"` — deterministic, not environment-dependent.
- **Device-Id generation drift**: vendor changes expected format from 16-char hex. Mitigation: the inline `_generate_vci_device_id` is a thin wrapper around `secrets.token_hex(8)`. If vendor changes, the smoke test fails and we update the generator.

## Security Considerations

- **Device-Id is sensitive** — stable hardware-bound identifier used for bronze-tier slot accounting. Do NOT log raw Device-Id values, print them to stdout, or commit them in evidence files.
- **No new outbound calls** introduced beyond what `vnstock_data` already makes.
- **Supply-chain isolation**: `vendor_compat` does NOT import `vnstock` (PyPI). The Device-Id logic is inlined (~10 lines) to avoid trusting a potentially updated vendor package for header injection.

## Next Steps

- Phase 3 (smoke test) verifies this patch works in a live call.
- Phase 4 promotes the claim with proof.

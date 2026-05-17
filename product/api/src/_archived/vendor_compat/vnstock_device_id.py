from __future__ import annotations

import importlib.metadata
import logging
import secrets
import sys
from collections.abc import MutableMapping
from typing import Any

import vnstock_data
import vnstock_data.core.utils.user_agent as _vd_user_agent

_log = logging.getLogger("vendor_compat.vnstock_device_id")
_patched = False

# VCI modules importing get_headers in vnstock_data 3.0.0:
# - vnstock_data.explorer.vci.company
# - vnstock_data.explorer.vci.quote
# - vnstock_data.explorer.vci.listing
# - vnstock_data.explorer.vci.trading
# - vnstock_data.explorer.vci.financial
# - vnstock_data.explorer.vci.screener
# - vnstock_data.explorer.vci.event


def _vnstock_data_dist_version() -> str:
    try:
        return importlib.metadata.version("vnstock_data")
    except importlib.metadata.PackageNotFoundError:
        return "unknown"


def _generate_vci_device_id() -> str:
    return secrets.token_hex(8)


def _inject_device_id_for_vci(headers: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    data_source = str(headers.get("Data-Source", "VCI")).upper()
    if data_source != "VCI" or headers.get("Device-Id"):
        return headers

    device_id = _generate_vci_device_id()
    headers["Device-Id"] = device_id
    current_cookie = str(headers.get("Cookie", ""))
    headers["Cookie"] = f"device_id={device_id}; {current_cookie}" if current_cookie else f"device_id={device_id}"
    return headers


def _wrapped_get_headers(original: Any) -> Any:
    def wrapped(*args: Any, **kwargs: Any) -> MutableMapping[str, Any]:
        headers = original(*args, **kwargs)
        if not isinstance(headers, MutableMapping):
            return headers
        return _inject_device_id_for_vci(headers)

    return wrapped


def _rebind_loaded_vci_modules() -> None:
    for module_name, module in list(sys.modules.items()):
        if module_name.startswith("vnstock_data.explorer.vci.") and hasattr(module, "get_headers"):
            setattr(module, "get_headers", _vd_user_agent.get_headers)


def ensure_vci_device_id() -> None:
    global _patched
    if _patched:
        return

    vci_loaded = [name for name in sys.modules if name.startswith("vnstock_data.explorer.vci.")]
    if vci_loaded:
        _log.critical("VCI modules already loaded before vnstock_data Device-Id patch: %s", sorted(vci_loaded))

    try:
        sample_headers = _vd_user_agent.get_headers(data_source="VCI", random_agent=False)
    except TypeError as exc:
        _log.error("vnstock_data get_headers signature incompatible; Device-Id patch skipped: %r", exc)
        _patched = True
        return
    except Exception as exc:
        raise RuntimeError("Cannot verify vnstock_data VCI header behavior before startup") from exc

    if isinstance(sample_headers, MutableMapping) and sample_headers.get("Device-Id"):
        _log.info(
            "vnstock_data source=%s dist=%s already injects Device-Id; patch skipped",
            getattr(vnstock_data, "__version__", "unknown"),
            _vnstock_data_dist_version(),
        )
        _patched = True
        return

    _vd_user_agent.get_headers = _wrapped_get_headers(_vd_user_agent.get_headers)
    _rebind_loaded_vci_modules()
    _patched = True
    _log.info(
        "vnstock_data source=%s dist=%s patched: Device-Id injected for VCI",
        getattr(vnstock_data, "__version__", "unknown"),
        _vnstock_data_dist_version(),
    )

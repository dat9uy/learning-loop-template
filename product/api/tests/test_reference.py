import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

vnstock_data_stub = types.ModuleType("vnstock_data")
vnstock_data_stub.__version__ = "test"
vnstock_data_stub.Reference = object
sys.modules["vnstock_data"] = vnstock_data_stub

user_agent_stub = types.ModuleType("vnstock_data.core.utils.user_agent")
original_get_headers = lambda *args, **kwargs: {"Data-Source": kwargs.get("data_source", "VCI")}
user_agent_stub.get_headers = original_get_headers
sys.modules["vnstock_data.core"] = types.ModuleType("vnstock_data.core")
sys.modules["vnstock_data.core.utils"] = types.ModuleType("vnstock_data.core.utils")
sys.modules["vnstock_data.core.utils.user_agent"] = user_agent_stub

import pandas as pd
import pytest
from fastapi import HTTPException

import src.routers.reference as reference_router
from src import vendor_compat


class FakeEquity:
    def list(self):
        return pd.DataFrame([
            {"symbol": "AAA", "org_name": "Sanitized Organization A"},
            {"symbol": "BBB", "org_name": float("nan")},
        ])


class FakeCompanyResource:
    def info(self):
        return pd.DataFrame([
            {
                "symbol": "AAA",
                "name": "Sanitized Entity",
                "sector": "Sanitized Sector",
                "profile": "Sanitized profile text",
                "listing_date": "2000-01-01",
                "issued_share": 1,
            }
        ])


class FakeSearch:
    def symbol(self, query, limit=5):
        return pd.DataFrame(columns=["symbol", "code", "name", "description", "type", "country_code", "pip_value", "price_scale"])


class FakeReference:
    def __init__(self):
        self.equity = FakeEquity()
        self.search = FakeSearch()

    def company(self, symbol):
        return FakeCompanyResource()


def approve_live_reference(monkeypatch):
    monkeypatch.setattr(reference_router, "Reference", FakeReference)
    monkeypatch.setenv("VNSTOCK_REFERENCE_LIVE_GATE", "approved")


def test_endpoint_blocks_without_runtime_gate(monkeypatch):
    monkeypatch.delenv("VNSTOCK_REFERENCE_LIVE_GATE", raising=False)
    monkeypatch.setattr(reference_router, "Reference", FakeReference)
    with pytest.raises(HTTPException) as exc_info:
        reference_router.list_equity()
    assert exc_info.value.status_code == 403


def test_app_import_applies_vendor_compat_before_router_use() -> None:
    assert user_agent_stub.get_headers is not original_get_headers
    headers = user_agent_stub.get_headers(data_source="VCI")
    assert headers["Device-Id"]
    assert headers["Cookie"].startswith("device_id=")
    assert vendor_compat.ensure_vci_device_id is not None


def test_equity_endpoint_returns_reference_schema(monkeypatch):
    approve_live_reference(monkeypatch)
    payload = reference_router.list_equity().model_dump()
    assert payload["columns"] == ["symbol", "org_name"]
    assert payload["row_count"] == 2
    assert set(payload["rows"][0]) >= {"symbol", "org_name"}
    assert payload["rows"][1]["org_name"] is None


def test_company_endpoint_returns_reference_schema(monkeypatch):
    approve_live_reference(monkeypatch)
    payload = reference_router.company_info("AAA").model_dump()
    assert payload["columns"] == ["symbol", "name", "sector", "profile", "listing_date", "issued_share"]
    assert payload["row_count"] == 1


def test_search_endpoint_returns_reference_schema(monkeypatch):
    approve_live_reference(monkeypatch)
    payload = reference_router.search_symbol("AAA", limit=5).model_dump()
    assert payload["columns"] == ["symbol", "code", "name", "description", "type", "country_code", "pip_value", "price_scale"]
    assert payload["row_count"] == 0

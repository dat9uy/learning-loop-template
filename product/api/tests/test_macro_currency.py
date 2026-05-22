import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

vnstock_data_stub = types.ModuleType("vnstock_data")
vnstock_data_stub.__version__ = "test"
vnstock_data_stub.Macro = object
vnstock_data_stub.Reference = object
vnstock_data_stub.Fundamental = object
sys.modules["vnstock_data"] = vnstock_data_stub

user_agent_stub = types.ModuleType("vnstock_data.core.utils.user_agent")
original_get_headers = lambda *args, **kwargs: {"Data-Source": kwargs.get("data_source", "VCI")}
user_agent_stub.get_headers = original_get_headers
sys.modules["vnstock_data.core"] = types.ModuleType("vnstock_data.core")
sys.modules["vnstock_data.core.utils"] = types.ModuleType("vnstock_data.core.utils")
sys.modules["vnstock_data.core.utils.user_agent"] = user_agent_stub

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import src.routers.macro_currency as macro_currency_router
from src.main import create_app


class FakeCurrencyResource:
    def exchange_rate(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "USD": 24500.0, "EUR": 26800.0}])

    def interest_rate(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "lending_rate": "4.50%", "deposit_rate": "0.80%"}])


class FakeMacro:
    def economy(self):
        return object()

    def currency(self):
        return FakeCurrencyResource()

    def commodity(self):
        return object()


def patch_macro(monkeypatch):
    monkeypatch.setattr(macro_currency_router, "Macro", FakeMacro)


class TestCurrencyEndpoints:
    def test_exchange_rate(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_currency_router.exchange_rate().model_dump()
        assert payload["columns"] == ["report_time", "USD", "EUR"]
        assert payload["row_count"] == 1
        assert payload["rows"][0]["USD"] == 24500.0

    def test_interest_rate(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_currency_router.interest_rate().model_dump()
        assert payload["columns"] == ["report_time", "lending_rate", "deposit_rate"]
        assert payload["row_count"] == 1

    def test_interest_rate_format_param(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        response = client.get("/macro/currency/interest-rate?format=long&period=month")
        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 1

    def test_all_currency_routes_registered(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        for endpoint in ["/macro/currency/exchange-rate", "/macro/currency/interest-rate"]:
            response = client.get(endpoint)
            assert response.status_code == 200, f"{endpoint} failed"

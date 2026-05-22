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

import src.routers.macro_commodity as macro_commodity_router
from src.main import create_app


class FakeCommodityResource:
    def gold(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 80050000.0}])

    def gas(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "ron92_price": 23000.0}])

    def oil_crude(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "brent": 90.5, "wti": 85.25}])

    def coke(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 300.0}])

    def steel(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 15000.0}])

    def iron_ore(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 120.0}])

    def fertilizer_ure(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 500.0}])

    def soybean(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 12.5}])

    def corn(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 4.5}])

    def sugar(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 20.0}])

    def pork(self, **kwargs):
        return pd.DataFrame([{"report_time": "2026-03-06", "price": 65000.0}])


class FakeMacro:
    def economy(self):
        return object()

    def currency(self):
        return object()

    def commodity(self):
        return FakeCommodityResource()


def patch_macro(monkeypatch):
    monkeypatch.setattr(macro_commodity_router, "Macro", FakeMacro)


class TestCommodityEndpoints:
    def test_gold(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.gold().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1
        assert payload["rows"][0]["price"] == 80050000.0

    def test_gas(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.gas().model_dump()
        assert payload["columns"] == ["report_time", "ron92_price"]
        assert payload["row_count"] == 1

    def test_oil_crude(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.oil_crude().model_dump()
        assert payload["columns"] == ["report_time", "brent", "wti"]
        assert payload["row_count"] == 1

    def test_coke(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.coke().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_steel(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.steel().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_iron_ore(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.iron_ore().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_fertilizer_ure(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.fertilizer_ure().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_soybean(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.soybean().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_corn(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.corn().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_sugar(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.sugar().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_pork(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_commodity_router.pork().model_dump()
        assert payload["columns"] == ["report_time", "price"]
        assert payload["row_count"] == 1

    def test_market_param(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        response = client.get("/macro/commodity/gold?market=GLOBAL")
        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 1

    def test_all_commodity_routes_registered(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        endpoints = [
            "/macro/commodity/gold",
            "/macro/commodity/gas",
            "/macro/commodity/oil-crude",
            "/macro/commodity/coke",
            "/macro/commodity/steel",
            "/macro/commodity/iron-ore",
            "/macro/commodity/fertilizer-ure",
            "/macro/commodity/soybean",
            "/macro/commodity/corn",
            "/macro/commodity/sugar",
            "/macro/commodity/pork",
        ]
        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == 200, f"{endpoint} failed"

    def test_nan_values_converted_to_none(self, monkeypatch):
        patch_macro(monkeypatch)
        df = pd.DataFrame([{"report_time": "2026-03-06", "price": float("nan")}])
        columns, rows = macro_commodity_router._records_from_frame(df)
        assert columns == ["report_time", "price"]
        assert rows[0]["price"] is None

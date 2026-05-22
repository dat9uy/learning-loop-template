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

import src.routers.macro_economy as macro_economy_router
from src.main import create_app


class FakeEconomyResource:
    def gdp(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "gdp_growth": 6.5}])

    def cpi(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "cpi_yoy": 3.2}])

    def industry_prod(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "index": 108.5}])

    def import_export(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "export": 90.0, "import": 85.0}])

    def retail(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "growth": 8.1}])

    def fdi(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "fdi_registered": 4500.0}])

    def money_supply(self, **kwargs):
        return pd.DataFrame([{"period": "2025-Q1", "m2": 15000.0}])

    def population_labor(self, **kwargs):
        return pd.DataFrame([{"period": "2025", "population": 100.0, "labor_force": 55.0}])


class FakeMacro:
    def economy(self):
        return FakeEconomyResource()

    def currency(self):
        return object()

    def commodity(self):
        return object()


def patch_macro(monkeypatch):
    monkeypatch.setattr(macro_economy_router, "Macro", FakeMacro)


class TestEconomyEndpoints:
    def test_gdp(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.gdp().model_dump()
        assert payload["columns"] == ["period", "gdp_growth"]
        assert payload["row_count"] == 1
        assert payload["rows"][0]["gdp_growth"] == 6.5

    def test_cpi(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.cpi().model_dump()
        assert payload["columns"] == ["period", "cpi_yoy"]
        assert payload["row_count"] == 1

    def test_industry_prod(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.industry_prod().model_dump()
        assert payload["columns"] == ["period", "index"]
        assert payload["row_count"] == 1

    def test_import_export(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.import_export().model_dump()
        assert payload["columns"] == ["period", "export", "import"]
        assert payload["row_count"] == 1

    def test_retail(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.retail().model_dump()
        assert payload["columns"] == ["period", "growth"]
        assert payload["row_count"] == 1

    def test_fdi(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.fdi().model_dump()
        assert payload["columns"] == ["period", "fdi_registered"]
        assert payload["row_count"] == 1

    def test_money_supply(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.money_supply().model_dump()
        assert payload["columns"] == ["period", "m2"]
        assert payload["row_count"] == 1

    def test_population_labor(self, monkeypatch):
        patch_macro(monkeypatch)
        payload = macro_economy_router.population_labor().model_dump()
        assert payload["columns"] == ["period", "population", "labor_force"]
        assert payload["row_count"] == 1

    def test_query_params_passed(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        response = client.get("/macro/economy/gdp?period=year&length=4")
        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 1


class TestIntegration:
    def test_all_economy_routes_registered(self, monkeypatch):
        patch_macro(monkeypatch)
        client = TestClient(create_app())
        endpoints = [
            "/macro/economy/gdp",
            "/macro/economy/cpi",
            "/macro/economy/industry-prod",
            "/macro/economy/import-export",
            "/macro/economy/retail",
            "/macro/economy/fdi",
            "/macro/economy/money-supply",
            "/macro/economy/population-labor",
        ]
        for endpoint in endpoints:
            response = client.get(endpoint)
            assert response.status_code == 200, f"{endpoint} failed"

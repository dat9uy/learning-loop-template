import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

vnstock_data_stub = types.ModuleType("vnstock_data")
vnstock_data_stub.__version__ = "test"
vnstock_data_stub.Fundamental = object
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
from fastapi.testclient import TestClient

import src.routers.fundamental as fundamental_router
from src.main import create_app


class FakeEquityResource:
    def income_statement(self, limit: int = 4):
        return pd.DataFrame([
            {"period": "2025-Q1", "revenue": 1000000000.0, "net_income": 500000000.0},
            {"period": "2024-Q4", "revenue": 900000000.0, "net_income": 450000000.0},
        ])

    def balance_sheet(self, limit: int = 4):
        return pd.DataFrame([
            {"period": "2025-Q1", "total_assets": 5000000000.0, "total_liabilities": 2000000000.0},
            {"period": "2024-Q4", "total_assets": 4800000000.0, "total_liabilities": 1900000000.0},
        ])

    def cash_flow(self, limit: int = 4):
        return pd.DataFrame([
            {"period": "2025-Q1", "operating_cash_flow": 300000000.0, "investing_cash_flow": -100000000.0},
            {"period": "2024-Q4", "operating_cash_flow": 250000000.0, "investing_cash_flow": -80000000.0},
        ])

    def ratio(self):
        return pd.DataFrame([
            {"period": "2025-Q1", "roe": 0.15, "roa": 0.08, "eps": 5000.0},
            {"period": "2024-Q4", "roe": 0.14, "roa": 0.07, "eps": 4800.0},
        ])


class FakeFundamental:
    def equity(self, symbol: str):
        return FakeEquityResource()


def patch_fundamental(monkeypatch):
    monkeypatch.setattr(fundamental_router, "Fundamental", FakeFundamental)


def test_income_statement_endpoint_returns_schema(monkeypatch):
    patch_fundamental(monkeypatch)
    payload = fundamental_router.income_statement("VIC", limit=2).model_dump()
    assert payload["columns"] == ["period", "revenue", "net_income"]
    assert payload["row_count"] == 2
    assert payload["rows"][0]["period"] == "2025-Q1"
    assert payload["rows"][0]["revenue"] == 1000000000.0


def test_balance_sheet_endpoint_returns_schema(monkeypatch):
    patch_fundamental(monkeypatch)
    payload = fundamental_router.balance_sheet("VIC", limit=2).model_dump()
    assert payload["columns"] == ["period", "total_assets", "total_liabilities"]
    assert payload["row_count"] == 2
    assert payload["rows"][0]["total_assets"] == 5000000000.0


def test_cash_flow_endpoint_returns_schema(monkeypatch):
    patch_fundamental(monkeypatch)
    payload = fundamental_router.cash_flow("VIC", limit=2).model_dump()
    assert payload["columns"] == ["period", "operating_cash_flow", "investing_cash_flow"]
    assert payload["row_count"] == 2
    assert payload["rows"][0]["operating_cash_flow"] == 300000000.0


def test_ratios_endpoint_returns_schema(monkeypatch):
    patch_fundamental(monkeypatch)
    payload = fundamental_router.financial_ratios("VIC").model_dump()
    assert payload["columns"] == ["period", "roe", "roa", "eps"]
    assert payload["row_count"] == 2
    assert payload["rows"][0]["roe"] == 0.15


def test_limit_parameter_bounds(monkeypatch):
    patch_fundamental(monkeypatch)
    client = TestClient(create_app())
    response = client.get("/fundamental/income/VIC?limit=0")
    assert response.status_code == 422

    response = client.get("/fundamental/income/VIC?limit=21")
    assert response.status_code == 422


def test_invalid_symbol_pattern(monkeypatch):
    patch_fundamental(monkeypatch)
    client = TestClient(create_app())
    response = client.get("/fundamental/income/VIC@BAD?limit=4")
    assert response.status_code == 422


def test_nan_values_converted_to_none(monkeypatch):
    patch_fundamental(monkeypatch)
    df = pd.DataFrame([
        {"period": "2025-Q1", "revenue": float("nan"), "net_income": 500000000.0},
    ])
    columns, rows = fundamental_router._records_from_frame(df)
    assert columns == ["period", "revenue", "net_income"]
    assert rows[0]["revenue"] is None
    assert rows[0]["net_income"] == 500000000.0

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd
from fastapi.testclient import TestClient

from src.main import create_app
import src.routers.reference as reference_router


class FakeEquity:
    def list(self):
        return pd.DataFrame([
            {"symbol": "AAA", "org_name": "Sanitized Organization A"},
            {"symbol": "BBB", "org_name": "Sanitized Organization B"},
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


def client(monkeypatch):
    monkeypatch.setattr(reference_router, "Reference", FakeReference)
    monkeypatch.setenv("VNSTOCK_REFERENCE_LIVE_GATE", "approved")
    return TestClient(create_app())


def test_endpoint_blocks_without_runtime_gate(monkeypatch):
    monkeypatch.delenv("VNSTOCK_REFERENCE_LIVE_GATE", raising=False)
    monkeypatch.setattr(reference_router, "Reference", FakeReference)
    response = TestClient(create_app()).get("/reference/equity")
    assert response.status_code == 403


def test_equity_endpoint_returns_reference_schema(monkeypatch):
    response = client(monkeypatch).get("/reference/equity")
    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"] == ["symbol", "org_name"]
    assert payload["row_count"] == 2
    assert set(payload["rows"][0]) >= {"symbol", "org_name"}


def test_company_endpoint_returns_reference_schema(monkeypatch):
    response = client(monkeypatch).get("/reference/company/AAA")
    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"] == ["symbol", "name", "sector", "profile", "listing_date", "issued_share"]
    assert payload["row_count"] == 1


def test_search_endpoint_returns_reference_schema(monkeypatch):
    response = client(monkeypatch).get("/reference/search", params={"q": "AAA", "limit": 5})
    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"] == ["symbol", "code", "name", "description", "type", "country_code", "pip_value", "price_scale"]
    assert payload["row_count"] == 0

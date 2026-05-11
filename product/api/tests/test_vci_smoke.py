import os
import sys
from pathlib import Path

import pandas as pd
import pytest

if not os.environ.get("VNSTOCK_SMOKE_TEST_ALLOW_LIVE"):
    pytest.skip("VNSTOCK_SMOKE_TEST_ALLOW_LIVE not set", allow_module_level=True)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src import vendor_compat  # noqa: F401
from vnstock_data import Market, Reference


def _assert_non_empty_frame(result: object, expected_columns: set[str]) -> None:
    assert isinstance(result, pd.DataFrame)
    assert not result.empty
    assert expected_columns.intersection(result.columns)


@pytest.mark.network
def test_vci_equity_list_returns_dataframe() -> None:
    result = Reference().equity.list()

    _assert_non_empty_frame(result, {"symbol", "ticker", "organ_code"})


@pytest.mark.network
def test_vci_equity_list_contains_vic_for_reference_search() -> None:
    result = Reference().equity.list()
    assert "symbol" in result.columns
    assert result["symbol"].astype("string").str.contains("VIC", case=False, na=False, regex=False).any()


@pytest.mark.network
def test_vci_company_info_returns_dataframe() -> None:
    result = Reference().company("VIC").info()

    _assert_non_empty_frame(result, {"symbol", "ticker", "organ_code", "icb_name3"})


@pytest.mark.network
def test_vci_market_quote_returns_dataframe() -> None:
    result = Market().equity("VIC").quote()

    _assert_non_empty_frame(result, {"symbol", "exchange", "close_price"})

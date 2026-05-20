from typing import Any

import pandas as pd
import vnstock_env
from fastapi import APIRouter, Path, Query
from vnstock_data import Fundamental

from ..models.fundamental import FinancialRatioResponse, FundamentalStatementResponse

router = APIRouter(prefix="/fundamental", tags=["fundamental"])


def _records_from_frame(frame: pd.DataFrame) -> tuple[list[str], list[dict[str, Any]]]:
    safe = frame.astype(object).where(pd.notnull(frame), None)
    return list(safe.columns), safe.to_dict(orient="records")


@router.get("/income/{symbol}", response_model=FundamentalStatementResponse)
def income_statement(
    symbol: str = Path(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$"),
    limit: int = Query(4, ge=1, le=20),
) -> FundamentalStatementResponse:
    columns, rows = _records_from_frame(Fundamental().equity(symbol).income_statement(limit=limit))
    return FundamentalStatementResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/balance/{symbol}", response_model=FundamentalStatementResponse)
def balance_sheet(
    symbol: str = Path(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$"),
    limit: int = Query(4, ge=1, le=20),
) -> FundamentalStatementResponse:
    columns, rows = _records_from_frame(Fundamental().equity(symbol).balance_sheet(limit=limit))
    return FundamentalStatementResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/cashflow/{symbol}", response_model=FundamentalStatementResponse)
def cash_flow(
    symbol: str = Path(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$"),
    limit: int = Query(4, ge=1, le=20),
) -> FundamentalStatementResponse:
    columns, rows = _records_from_frame(Fundamental().equity(symbol).cash_flow(limit=limit))
    return FundamentalStatementResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/ratios/{symbol}", response_model=FinancialRatioResponse)
def financial_ratios(
    symbol: str = Path(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$"),
) -> FinancialRatioResponse:
    columns, rows = _records_from_frame(Fundamental().equity(symbol).ratio())
    return FinancialRatioResponse(columns=columns, rows=rows, row_count=len(rows))

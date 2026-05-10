import os
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Path, Query
from vnstock_data import Reference

from ..models.reference import CompanyInfoResponse, EquityListResponse, SymbolSearchResponse

router = APIRouter(prefix="/reference", tags=["reference"])


def _ensure_live_reference_gate() -> None:
    if os.getenv("VNSTOCK_REFERENCE_LIVE_GATE") != "approved":
        raise HTTPException(
            status_code=403,
            detail="Live Reference calls require VNSTOCK_REFERENCE_LIVE_GATE=approved.",
        )


def _records_from_frame(frame: pd.DataFrame) -> tuple[list[str], list[dict[str, Any]]]:
    safe = frame.where(pd.notnull(frame), None)
    return list(safe.columns), safe.to_dict(orient="records")


@router.get("/equity", response_model=EquityListResponse)
def list_equity() -> EquityListResponse:
    _ensure_live_reference_gate()
    columns, rows = _records_from_frame(Reference().equity.list())
    return EquityListResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/company/{symbol}", response_model=CompanyInfoResponse)
def company_info(symbol: str = Path(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._-]+$")) -> CompanyInfoResponse:
    _ensure_live_reference_gate()
    columns, rows = _records_from_frame(Reference().company(symbol).info())
    return CompanyInfoResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/search", response_model=SymbolSearchResponse)
def search_symbol(q: str = Query(..., min_length=1), limit: int = Query(5, ge=1, le=50)) -> SymbolSearchResponse:
    _ensure_live_reference_gate()
    columns, rows = _records_from_frame(Reference().search.symbol(q, limit=limit))
    return SymbolSearchResponse(columns=columns, rows=rows, row_count=len(rows))

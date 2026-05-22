from typing import Any

import pandas as pd
import vnstock_env
from fastapi import APIRouter, Query
from vnstock_data import Macro

from ..models.macro import MacroResponse

router = APIRouter(prefix="/macro/currency", tags=["macro"])


def _records_from_frame(frame: pd.DataFrame) -> tuple[list[str], list[dict[str, Any]]]:
    safe = frame.astype(object).where(pd.notnull(frame), None)
    return list(safe.columns), safe.to_dict(orient="records")


def _build_kwargs(start: str | None, end: str | None, period: str, length: int | None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"period": period}
    if start is not None:
        kwargs["start"] = start
    if end is not None:
        kwargs["end"] = end
    if length is not None:
        kwargs["length"] = length
    return kwargs


@router.get("/exchange-rate", response_model=MacroResponse)
def exchange_rate(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("day"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().currency().exchange_rate(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/interest-rate", response_model=MacroResponse)
def interest_rate(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("day"),
    length: int | None = Query(None, ge=1),
    format: str = Query("pivot"),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    kwargs["format"] = format
    columns, rows = _records_from_frame(Macro().currency().interest_rate(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))

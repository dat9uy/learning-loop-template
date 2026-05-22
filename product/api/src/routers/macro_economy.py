from typing import Any

import pandas as pd
import vnstock_env
from fastapi import APIRouter, Query
from vnstock_data import Macro

from ..models.macro import MacroResponse

router = APIRouter(prefix="/macro/economy", tags=["macro"])


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


@router.get("/gdp", response_model=MacroResponse)
def gdp(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().gdp(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/cpi", response_model=MacroResponse)
def cpi(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().cpi(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/industry-prod", response_model=MacroResponse)
def industry_prod(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().industry_prod(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/import-export", response_model=MacroResponse)
def import_export(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().import_export(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/retail", response_model=MacroResponse)
def retail(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().retail(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/fdi", response_model=MacroResponse)
def fdi(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().fdi(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/money-supply", response_model=MacroResponse)
def money_supply(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().money_supply(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/population-labor", response_model=MacroResponse)
def population_labor(
    start: str | None = Query(None),
    end: str | None = Query(None),
    period: str = Query("quarter"),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, period, length)
    columns, rows = _records_from_frame(Macro().economy().population_labor(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))

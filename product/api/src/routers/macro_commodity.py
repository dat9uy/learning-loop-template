from typing import Any

import pandas as pd
import vnstock_env
from fastapi import APIRouter, Query
from vnstock_data import Macro

from ..models.macro import MacroResponse

router = APIRouter(prefix="/macro/commodity", tags=["macro"])


def _records_from_frame(frame: pd.DataFrame) -> tuple[list[str], list[dict[str, Any]]]:
    safe = frame.astype(object).where(pd.notnull(frame), None)
    return list(safe.columns), safe.to_dict(orient="records")


def _build_kwargs(start: str | None, end: str | None, length: int | None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {}
    if start is not None:
        kwargs["start"] = start
    if end is not None:
        kwargs["end"] = end
    if length is not None:
        kwargs["length"] = length
    return kwargs


@router.get("/gold", response_model=MacroResponse)
def gold(
    market: str = Query("VN"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    kwargs["market"] = market
    columns, rows = _records_from_frame(Macro().commodity().gold(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/gas", response_model=MacroResponse)
def gas(
    market: str = Query("VN"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    kwargs["market"] = market
    columns, rows = _records_from_frame(Macro().commodity().gas(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/oil-crude", response_model=MacroResponse)
def oil_crude(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().oil_crude(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/coke", response_model=MacroResponse)
def coke(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().coke(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/steel", response_model=MacroResponse)
def steel(
    market: str = Query("VN"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    kwargs["market"] = market
    columns, rows = _records_from_frame(Macro().commodity().steel(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/iron-ore", response_model=MacroResponse)
def iron_ore(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().iron_ore(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/fertilizer-ure", response_model=MacroResponse)
def fertilizer_ure(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().fertilizer_ure(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/soybean", response_model=MacroResponse)
def soybean(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().soybean(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/corn", response_model=MacroResponse)
def corn(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().corn(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/sugar", response_model=MacroResponse)
def sugar(
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    columns, rows = _records_from_frame(Macro().commodity().sugar(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))


@router.get("/pork", response_model=MacroResponse)
def pork(
    market: str = Query("VN"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    length: int | None = Query(None, ge=1),
) -> MacroResponse:
    kwargs = _build_kwargs(start, end, length)
    kwargs["market"] = market
    columns, rows = _records_from_frame(Macro().commodity().pork(**kwargs))
    return MacroResponse(columns=columns, rows=rows, row_count=len(rows))

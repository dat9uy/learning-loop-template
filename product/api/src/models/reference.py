from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DataFrameEnvelope(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int = Field(ge=0)


class EquityRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    symbol: str | None = None
    org_name: str | None = None


class CompanyInfoRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    symbol: str | None = None
    name: str | None = None
    sector: str | None = None
    profile: str | None = None
    listing_date: str | None = None
    issued_share: float | int | str | None = None


class SymbolSearchRow(BaseModel):
    model_config = ConfigDict(extra="allow")

    symbol: str | None = None
    code: str | None = None
    name: str | None = None
    description: str | None = None
    type: str | None = None
    country_code: str | None = None
    pip_value: float | int | str | None = None
    price_scale: float | int | str | None = None


class EquityListResponse(DataFrameEnvelope):
    rows: list[EquityRow]


class CompanyInfoResponse(DataFrameEnvelope):
    rows: list[CompanyInfoRow]


class SymbolSearchResponse(DataFrameEnvelope):
    rows: list[SymbolSearchRow]

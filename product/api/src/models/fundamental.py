from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DataFrameEnvelope(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    row_count: int = Field(ge=0)


class FundamentalStatementResponse(DataFrameEnvelope):
    model_config = ConfigDict(extra="allow")


class FinancialRatioResponse(DataFrameEnvelope):
    model_config = ConfigDict(extra="allow")

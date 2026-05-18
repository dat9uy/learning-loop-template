# capability-03-fundamental.py
# Minimal feasibility test: Fundamental layer (financial statements, ratios).
# Run as script: python capability-03-fundamental.py
# Run cell-by-cell: VS Code "Jupyter: Run Current Cell" (Interactive Python)

# %% Imports
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import vnstock_env

logging.basicConfig(level=logging.INFO)

from vnstock_data import Fundamental

fun = Fundamental()
SYMBOL = "VIC"

# %% Income statement (last 4 periods)
print(f"\n=== Income Statement: {SYMBOL} ===")
df_income = fun.equity(SYMBOL).income_statement(limit=4)
print(df_income)

# %% Balance sheet (last 4 periods)
print(f"\n=== Balance Sheet: {SYMBOL} ===")
df_bs = fun.equity(SYMBOL).balance_sheet(limit=4)
print(df_bs)

# %% Cash flow (last 4 periods)
print(f"\n=== Cash Flow: {SYMBOL} ===")
df_cf = fun.equity(SYMBOL).cash_flow(limit=4)
print(df_cf)

# %% Financial ratios
print(f"\n=== Financial Ratios: {SYMBOL} ===")
df_ratio = fun.equity(SYMBOL).ratio()
print(df_ratio)

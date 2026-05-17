# capability-03-fundamental.py
# Minimal feasibility test: Fundamental layer (financial statements, ratios).
# Run as script: python capability-03-fundamental.py
# Run cell-by-cell: VS Code "Jupyter: Run Current Cell" (Interactive Python)

# %% Imports
import logging
import os
from pathlib import Path

# vnstock_data reads $HOME/.vnstock/api_key.json via Path.home().
# Set HOME to product/api so the installed config is found.
_api_root = Path(__file__).resolve().parents[2]
os.environ["HOME"] = str(_api_root)

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

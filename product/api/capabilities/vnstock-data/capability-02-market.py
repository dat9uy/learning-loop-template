# capability-02-market.py
# Minimal feasibility test: Market layer (OHLCV, quote, order book, trades).
# Run as script: python capability-02-market.py
# Run cell-by-cell: VS Code "Jupyter: Run Current Cell" (Interactive Python)

# %% Imports
from vnstock_data import Market

mkt = Market()
SYMBOL = "VIC"

# %% OHLCV historical (short window to keep call minimal)
print(f"\n=== OHLCV: {SYMBOL} (last 10 days) ===")
df_ohlc = mkt.equity(SYMBOL).ohlcv(
    start="2026-04-20",
    end="2026-05-01"
)
print(df_ohlc)

# %% Current quote
print(f"\n=== Quote: {SYMBOL} ===")
quote = mkt.equity(SYMBOL).quote()
print(quote)

# %% Session stats
print(f"\n=== Session Stats: {SYMBOL} ===")
stats = mkt.equity(SYMBOL).session_stats()
print(stats)

# %% Foreign flow (sample)
print(f"\n=== Foreign Flow: {SYMBOL} ===")
flow = mkt.equity(SYMBOL).foreign_flow()
print(flow.head())

# %% Order book (depth)
print(f"\n=== Order Book: {SYMBOL} ===")
ob = mkt.equity(SYMBOL).order_book()
print(ob)

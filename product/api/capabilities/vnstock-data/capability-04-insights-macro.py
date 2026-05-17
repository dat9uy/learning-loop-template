# capability-04-insights-macro.py
# Minimal feasibility test: Insights (rankings) and Macro (economy) layers.
# Run as script: python capability-04-insights-macro.py
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

from vnstock_data import Insights, Macro

ins = Insights()
mac = Macro()

# %% Top gainers
print("\n=== Top Gainers ===")
gainers = ins.ranking().gainer()
print(gainers.head())

# %% Top losers
print("\n=== Top Losers ===")
losers = ins.ranking().loser()
print(losers.head())

# %% GDP data
print("\n=== GDP (yearly) ===")
gdp = mac.economy().gdp(period="year")
print(gdp.tail())

# %% CPI data
print("\n=== CPI (yearly) ===")
cpi = mac.economy().cpi(period="year")
print(cpi.tail())

# %% Exchange rate
print("\n=== Exchange Rate ===")
exchange = mac.currency().exchange_rate()
print(exchange.head())

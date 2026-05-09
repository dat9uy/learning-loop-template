# capability-04-insights-macro.py
# Minimal feasibility test: Insights (rankings) and Macro (economy) layers.
# Run as script: python capability-04-insights-macro.py
# Run cell-by-cell: VS Code "Jupyter: Run Current Cell" (Interactive Python)

# %% Imports
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
print("\n=== GDP (quarterly) ===")
gdp = mac.economy().gdp(period="quarter")
print(gdp.tail())

# %% CPI data
print("\n=== CPI (quarterly) ===")
cpi = mac.economy().cpi(period="quarter")
print(cpi.tail())

# %% Exchange rate
print("\n=== Exchange Rate ===")
exchange = mac.currency().exchange_rate()
print(exchange.head())

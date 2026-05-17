# capability-01-reference.py
# Minimal feasibility test: Reference layer (listings, company info, search).
# Run as script: python capability-01-reference.py
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

from vnstock_data import Reference

ref = Reference()

# %% List all equity symbols (sample first 5 rows)
print("\n=== All Equity Symbols (first 5) ===")
all_symbols = ref.equity.list()
print(all_symbols.head())
print(f"Total symbols: {len(all_symbols)}")

# %% List VN30 group symbols
print("\n=== VN30 Symbols ===")
vn30 = ref.equity.list_by_group("VN30")
print(vn30)

# %% Company profile for a single symbol
print("\n=== Company Profile: VIC ===")
df_profile = ref.company("VIC").info()
print(df_profile)

# %% Company shareholders
print("\n=== Shareholders: VIC ===")
df_shareholders = ref.company("VIC").shareholders()
print(df_shareholders.head())

# %% Global symbol search
print("\n=== Search: VNM ===")
results = ref.search.symbol("VNM", limit=5)
print(results)

# %% List indices
print("\n=== Index Groups ===")
groups = ref.index.groups()
print(groups)

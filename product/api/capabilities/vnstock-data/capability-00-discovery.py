# capability-00-discovery.py
# Minimal feasibility test: discover API surface and verify environment.
# Run as script: python capability-00-discovery.py
# Run cell-by-cell: VS Code "Jupyter: Run Current Cell" (Interactive Python)

# %% Setup and imports
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import vnstock_env

logging.basicConfig(level=logging.INFO)

from vnstock_data import show_api, show_doc, Reference, Market, Fundamental

print("vnstock_data imported successfully")

# %% Inspect Reference API tree
print("\n=== Reference API Tree ===")
show_api(Reference())

# %% Inspect Market API tree (commented to reduce output noise)
# print("\n=== Market API Tree ===")
# show_api(Market())

# %% Inspect Fundamental API tree (commented to reduce output noise)
# print("\n=== Fundamental API Tree ===")
# show_api(Fundamental())

# %% Show doc for a specific method
print("\n=== Doc for Reference.company ===")
show_doc(Reference().company)

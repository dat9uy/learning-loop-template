# vnstock_env.py
# vnstock_data reads $HOME/.vnstock/ via Path.home() at import time.
# This module sets HOME to product/api so the installed config is found.
# Usage: import vnstock_env  (must come before vnstock_data import)

import os
from pathlib import Path

_api_root = Path(__file__).resolve().parent  # product/api
os.environ["HOME"] = str(_api_root)

#!/usr/bin/env python3
"""Generate OpenAPI JSON from the FastAPI app, stubbing vnstock_data."""

import json
import sys
import types
from pathlib import Path

# Stub vnstock_data and vnstock_env so no external calls happen
vnstock_data_stub = types.ModuleType("vnstock_data")
vnstock_data_stub.Reference = object
sys.modules["vnstock_data"] = vnstock_data_stub

vnstock_env_stub = types.ModuleType("vnstock_env")
vnstock_env_stub.__version__ = "stub"
sys.modules["vnstock_env"] = vnstock_env_stub

# Ensure product/api is on the path so `src.main` resolves
api_root = Path(__file__).resolve().parents[2] / "product" / "api"
if str(api_root) not in sys.path:
    sys.path.insert(0, str(api_root))

from src.main import app

print(json.dumps(app.openapi()))

---
phase: 1
title: "Create vnstock_env.py"
status: completed
priority: P2
effort: "10m"
dependencies: []
---

# Phase 1: Create vnstock_env.py

## Overview

Create `product/api/src/vnstock_env.py` — a shared module that auto-sets `HOME` to `product/api` on import, so vnstock_data can find `.vnstock/api_key.json`.

## Related Code Files

- Create: `product/api/src/vnstock_env.py`

## Implementation Steps

1. Create `product/api/src/vnstock_env.py` with:
   ```python
   # vnstock_env.py
   # vnstock_data reads $HOME/.vnstock/ via Path.home() at import time.
   # This module sets HOME to product/api so the installed config is found.
   # Usage: import vnstock_env  (must come before vnstock_data import)

   import os
   from pathlib import Path

   _api_root = Path(__file__).resolve().parents[1]  # product/api
   os.environ["HOME"] = str(_api_root)
   ```
2. Verify the path resolves correctly: `_api_root` should equal `product/api/`.

## Success Criteria

- [ ] `product/api/src/vnstock_env.py` exists
- [ ] `python -c "import sys; sys.path.insert(0, 'product/api/src'); import vnstock_env; import os; assert os.environ['HOME'].endswith('product/api')"` passes

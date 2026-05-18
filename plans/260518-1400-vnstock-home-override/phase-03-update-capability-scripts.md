---
phase: 3
title: "Update capability scripts"
status: pending
priority: P2
effort: "15m"
dependencies: [1]
---

# Phase 3: Update capability scripts

## Overview

Replace the 3-line HOME override boilerplate in all 5 vnstock capability scripts with `import vnstock_env`.

## Related Code Files

- Modify: `product/api/capabilities/vnstock-data/capability-00-discovery.py`
- Modify: `product/api/capabilities/vnstock-data/capability-01-reference.py`
- Modify: `product/api/capabilities/vnstock-data/capability-02-market.py`
- Modify: `product/api/capabilities/vnstock-data/capability-03-fundamental.py`
- Modify: `product/api/capabilities/vnstock-data/capability-04-insights-macro.py`

## Implementation Steps

For each of the 5 capability scripts:

1. Remove these 4 lines (the boilerplate):
   ```python
   import os
   from pathlib import Path

   # vnstock_data reads $HOME/.vnstock/api_key.json via Path.home().
   # Set HOME to product/api so the installed config is found.
   _api_root = Path(__file__).resolve().parents[2]
   os.environ["HOME"] = str(_api_root)
   ```
2. Add `import vnstock_env` before the `from vnstock_data import ...` line.
3. Keep `import os` only if used elsewhere in the file; remove if only used for HOME override.
4. Keep `from pathlib import Path` only if used elsewhere; remove if only used for HOME override.

## Success Criteria

- [ ] All 5 scripts have `import vnstock_env` before vnstock_data import
- [ ] No script contains `os.environ["HOME"]` or `_api_root` boilerplate
- [ ] Unused `import os` and `from pathlib import Path` removed where applicable

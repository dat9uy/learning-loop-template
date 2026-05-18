---
phase: 4
title: "Update FastAPI router"
status: completed
priority: P2
effort: "5m"
dependencies: [1]
---

# Phase 4: Update FastAPI router

## Overview

Add `import vnstock_env` to `routers/reference.py` which imports `vnstock_data` without setting HOME.

## Related Code Files

- Modify: `product/api/src/routers/reference.py`

## Implementation Steps

1. Add `import vnstock_env` before line 5 (`from vnstock_data import Reference`).
2. No other changes needed — the file doesn't use the HOME boilerplate currently (it was missing it entirely).

## Success Criteria

- [ ] `routers/reference.py` has `import vnstock_env` before `from vnstock_data import Reference`
- [ ] No other changes to the file

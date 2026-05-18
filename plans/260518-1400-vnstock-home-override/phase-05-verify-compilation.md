---
phase: 5
title: "Verify compilation"
status: completed
priority: P2
effort: "10m"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Verify compilation

## Overview

Verify all modified files compile and vnstock_data imports correctly with the new vnstock_env module.

## Implementation Steps

1. Run `python -c "import sys; sys.path.insert(0, 'product/api/src'); import vnstock_env; import os; print(os.environ['HOME'])"` — verify HOME is set correctly.
2. Run `python -m py_compile product/api/src/vnstock_env.py` — verify syntax.
3. For each modified capability script: `python -m py_compile <script>` — verify no syntax errors.
4. Run `python -m py_compile product/api/src/routers/reference.py` — verify no syntax errors.
5. Run `uv run python -c "import vnstock_data; print('OK')"` from `product/api/` — verify vnstock_data still imports.

## Success Criteria

- [ ] All modified files pass `py_compile`
- [ ] `vnstock_data` imports successfully with the new vnstock_env module
- [ ] HOME is set to `product/api` path after importing vnstock_env

---
phase: 1
title: "Environment Setup"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Environment Setup

## Overview

Create a persistent Python project environment under `product/` that will be shared between capability scripts and future product code.

## Requirements

- Functional: `product/` contains a Python environment with dependency management.
- Non-functional: Environment is reproducible, version-controlled (manifest only, not venv), and respects the device limit constraint.

## Architecture

```
product/
├── pyproject.toml          # Project metadata + dependencies (vnstock_data to be added post-install)
├── .venv/                  # Shared virtual environment (gitignored)
├── src/                    # Future product code
└── capabilities/
    └── vnstock-data/       # Existing capability scripts
```

## Related Code Files

- Create: `product/pyproject.toml`
- Modify: `.gitignore` (ensure `.venv/` is ignored)
- Existing: `product/capabilities/vnstock-data/*`

## Implementation Steps

1. Check if `product/pyproject.toml` exists. If not, scaffold a minimal Python project file.
2. Ensure `.gitignore` excludes `.venv/`, `__pycache__/`, `*.egg-info/`.
3. Create `product/.venv/` using `python3 -m venv` or `uv venv`.
4. Verify the environment activates correctly and `python` is isolated.

## Success Criteria

- [x] `product/pyproject.toml` exists with project name and Python version requirement.
- [x] `product/.venv/` exists and activates successfully.
- [x] `product/.venv/bin/python -c "import sys; print(sys.executable)"` points inside `product/.venv`.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Wrong Python version | Pin `requires-python = ">=3.10"` in pyproject.toml |
| Venv leaks into git | Verify `.gitignore` before any commit |

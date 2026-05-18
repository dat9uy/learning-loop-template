# Research Report: uv + External Package Environment Management

## Executive Summary

vnstock_data reads `$HOME/.vnstock/api_key.json` via `pathlib.Path.home()` at import time. No env var override exists in the library. Every script must set `os.environ["HOME"]` before importing vnstock_data. Research evaluated 4 approaches to eliminate this boilerplate using uv's features and Python's site mechanisms.

**Decision:** 2-layer approach — `vnstock_env.py` module (primary) + `.env` file (uv convenience).

## Research Methodology

- Sources: uv official docs, Python `site` module docs, GitHub issues, project source inspection
- Date range: uv 0.11.x (current), Python 3.13, Sep 2025 GitHub issue
- Search terms: uv env-file, sitecustomize, UV_ENV_FILE, external package env management

## Key Findings

### 1. uv's `--env-file` and `UV_ENV_FILE`

`uv run --env-file .env` loads a dotenv file before execution. The persistent equivalent is:

```bash
export UV_ENV_FILE="/path/to/project/.env"
```

Set in `.zshrc`/`.bashrc`, this auto-loads the .env for all `uv run` invocations without per-command flags.

**Limitation:** Only works through `uv run`. Direct `python`, `uvicorn`, `pytest` calls don't benefit.

### 2. pyproject.toml env-file: NOT available

GitHub issue [#15714](https://github.com/astral-sh/uv/issues/15714) (Sep 2025, still open) requests `[tool.uv] env-file = ".env"`. Not implemented. The only persistent config path is the `UV_ENV_FILE` env var.

### 3. Python `sitecustomize.py`

Placed in the venv's `site-packages/`, it runs at every Python startup before user code. Can set `os.environ["HOME"]` automatically.

**Pros:** Zero per-file changes, works for ALL Python invocations.
**Cons:** Lives in `.venv/`, gets wiped on `uv sync`, hidden magic, affects all code in venv.

### 4. vnstock_data internals (source inspection)

- `const.py`: `HOME_DIR=pathlib.Path.home()`, `PROJECT_DIR=HOME_DIR/".vnstock"`
- `env.py`: uses `PROJECT_DIR` for `user.json` resolution
- `startup.py`: uses `Path.home()` directly for state tracking
- Library is obfuscated (byte-encoded strings), making monkey-patching fragile across updates

## Evaluated Approaches

| Approach | Per-file changes | Survives uv sync | Works everywhere | Explicit |
|----------|-----------------|-------------------|-----------------|----------|
| vnstock_env.py module | 1 import/file | Yes | Yes | Yes |
| .env + UV_ENV_FILE | 0 | Yes | uv run only | Medium |
| sitecustomize.py | 0 | No | Yes | No |
| Symlink ~/.vnstock | 0 | Yes | Yes | No |

## Decision: 2-Layer Design

### Layer 1: `product/api/src/vnstock_env.py`

```python
import os
from pathlib import Path
os.environ["HOME"] = str(Path(__file__).resolve().parents[1])
```

- Auto-sets HOME on import (no function call needed)
- Replaces 5x copy-pasted 3-line blocks in capability scripts
- Works in FastAPI, pytest, direct python, Docker — everywhere

### Layer 2: `product/api/.env`

```
HOME=/absolute/path/to/product/api
```

- Convenience for `uv run --env-file .env` CLI usage
- Can be set persistently via `UV_ENV_FILE` env var in shell profile

### What this does NOT change

- `install-vnstock.sh` — already handles HOME in bash, unaffected
- vnstock_data internals — no monkey-patching
- pyproject.toml / uv.toml — no config changes

## Unresolved Questions

None — all research questions answered.

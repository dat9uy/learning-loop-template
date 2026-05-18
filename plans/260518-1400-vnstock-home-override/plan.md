---
title: "vnstock HOME Override: Shared Module + .env"
description: "Replace 5x copy-pasted HOME override boilerplate with a shared vnstock_env.py module and .env file for uv convenience."
status: pending
priority: P2
branch: "main"
tags: [vnstock, drdy, env, refactor]
blockedBy: []
blocks: []
created: "2026-05-18T08:14:18.008Z"
createdBy: "ck:plan"
source: skill
brainstorm: plans/reports/research-260518-1400-uv-external-package-env-management.md
---

# vnstock HOME Override: Shared Module + .env

## Overview

vnstock_data reads `$HOME/.vnstock/api_key.json` via `Path.home()` at import time. Currently every script copy-pastes 3 lines to set `os.environ["HOME"]`. This plan replaces that with a shared module (`vnstock_env.py`) that auto-sets HOME on import, plus a `.env` file for `uv run` convenience.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Create vnstock_env.py](./phase-01-create-vnstock-env-py.md) | Pending |
| 2 | [Create .env file](./phase-02-create-env-file.md) | Pending |
| 3 | [Update capability scripts](./phase-03-update-capability-scripts.md) | Pending |
| 4 | [Update FastAPI router](./phase-04-update-fastapi-router.md) | Pending |
| 5 | [Verify compilation](./phase-05-verify-compilation.md) | Pending |

## Dependencies

No cross-plan dependencies. All related vnstock plans are completed.

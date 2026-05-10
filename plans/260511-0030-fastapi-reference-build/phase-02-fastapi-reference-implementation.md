---
phase: 2
title: "FastAPI Reference Implementation"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: FastAPI Reference Implementation

## Overview

Invoke `ck:backend-development` to implement the FastAPI service wrapping the three verified Reference surfaces. Skill reads capability records and capability scripts as substrate; writes code and tests only.

## Requirements

- Functional: 3 endpoints — `GET /reference/equity`, `GET /reference/company/{symbol}`, `GET /reference/search`.
- Non-functional: Pydantic models are schema-passthrough (column names match DataFrame columns from `capability-01-reference.py`). Pytest suite. No raw data in tests.

## Related Code Files

- Create: `product/api/src/main.py`
- Create: `product/api/src/routers/reference.py`
- Create: `product/api/src/models/reference.py`
- Create: `product/api/tests/test_reference.py`
- Create: `product/api/pyproject.toml` additions (fastapi, uvicorn, pydantic — if not already present)
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Read: `product/api/capabilities/vnstock-data/capability-01-reference.py`
- Read: `records/evidence/vnstock-data/capability-runtime-output.md`

## Implementation Steps

1. Pre-flight: verify `product/api/.venv/bin/python -c 'import vnstock_data'` succeeds. If not, stop — operator must run `pnpm bootstrap:api`.
2. Read capability record `capability-fastapi-reference-rest.yaml` for route mapping.
3. Read `capability-01-reference.py` and `capability-runtime-output.md` for column names and return shapes.
4. Scaffold FastAPI app under `product/api/src/`:
   - `main.py` with app factory, CORS, health check.
   - `routers/reference.py` with 3 endpoints calling `vnstock_data.Reference`.
   - `models/reference.py` with Pydantic passthrough models.
5. Write `tests/test_reference.py`:
   - Mock `vnstock_data.Reference` responses using recorded metadata (shape, columns).
   - Assert status codes and response schema.
   - No live calls in tests.
6. Run tests via `product/api/.venv/bin/pytest product/api/tests/`.
7. Run `pnpm validate:records` and `pnpm check` (ensure skill phase did not touch records).

## Pre-Drafted Constraint Prompt

```text
Task: Implement the FastAPI Reference slice.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- records/capabilities/capability-fastapi-reference-rest.yaml
- product/api/capabilities/vnstock-data/capability-01-reference.py
- records/evidence/vnstock-data/capability-runtime-output.md

Pre-flight check (MUST pass before any code):
- Run: product/api/.venv/bin/python -c 'import vnstock_data'
- If this fails, STOP. Report: "Bootstrap missing. Run pnpm bootstrap:api and retry."
- Do NOT run scripts/install-vnstock.sh or any installer.

Goal:
- Build FastAPI app under product/api/src/ exposing 3 Reference endpoints.
- Pydantic models are schema-passthrough (columns from capability-runtime-output.md).
- Pytest suite with mocked vnstock_data responses.

Allowed write paths:
- product/api/src/*.py
- product/api/tests/*.py
- product/api/pyproject.toml (add fastapi/uvicorn/pydantic deps only)

Forbidden actions:
- Do NOT create or modify any file under records/.
- Do NOT create or modify any file under records/evidence/.
- Do NOT create or modify any file under records/capabilities/.
- Do NOT capture raw external data, credentials, or config contents.
- Do NOT make live provider calls in tests.
- Do NOT use bare "capability" or "user" language.

Validation:
- Run product/api/.venv/bin/pytest product/api/tests/ — all tests must pass.
- Run pnpm validate:records and pnpm check — must pass (confirms no record edits).

Stop conditions:
- Pre-flight import check fails.
- Any test fails and cannot be fixed within skill context.
- Skill attempts to write outside allowed paths.
```

## Success Criteria

### Process Steps
- [x] Pre-flight import check passed.
- [x] Capability record and capability script read.
- [x] FastAPI app scaffolded with 3 endpoints.
- [x] Pydantic passthrough models match capability evidence columns.
- [x] Pytest suite passes.
- [x] `pnpm validate:records` and `pnpm check` pass.

### Experiment Outcome
- `supports` — all 3 endpoints respond correctly in tests; no record files modified.

## Risk Assessment
- Risk: Skill phase edits records despite constraint prompt. Mitigation: diff review before operator approval of phase 03.
- Risk: Pydantic model drift from DataFrame columns. Mitigation: post-build experiment in phase 03 compares observed vs pinned columns.
- Risk: Skill triggers installer. Mitigation: constraint prompt explicitly forbids it; pre-flight is import-only.

## Approval Gate
Operator approval required before phase 03. Review:
- Diff of `product/api/src/` and `product/api/tests/`.
- Confirm no files under `records/` were modified.

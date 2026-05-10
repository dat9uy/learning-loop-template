---
phase: 3
title: "Post-Build Records API"
status: blocked
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Post-Build Records API

## Overview

Close the loop for the API build: run tests against live capability substrate, capture metadata-only evidence, fill the experiment, flip the surface claim runtime dimension to verified, and record evidence.

## Requirements

- Functional: Experiment filled with method, observations, result. Evidence MD captures per-endpoint metadata.
- Non-functional: No raw data in evidence. Cleanup confirmed.

## Related Code Files

- Modify: `records/experiments/experiment-product-build-fastapi-reference-<ts>.yaml`
- Create: `records/evidence/product-build/fastapi-reference-endpoints.md`
- Modify: `records/claims/claim-product-fastapi-reference.yaml`
- Read: `product/api/tests/test_reference.py`
- Read: `product/api/src/routers/reference.py`
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`

## Implementation Steps

1. Read phase-02 outputs: `product/api/src/`, `product/api/tests/`.
2. Read `capability-fastapi-reference-rest.yaml` and `claim-product-fastapi-reference.yaml`.
3. Run `product/api/.venv/bin/pytest product/api/tests/` — confirm 3/3 pass.
4. Run a live metadata-only check (operator-approved gate):
   - Start FastAPI dev server briefly or use TestClient against live `vnstock_data`.
   - Capture per-endpoint metadata: route, status, columns, row count.
   - No raw row values, no credentials.
5. Write evidence MD: `records/evidence/product-build/fastapi-reference-endpoints.md`.
   - Include envelope fields: `run_id`, `temp_root_class`, `approval_gate`, `command_class`, `allowed_outputs`, `blocked_outputs`, `cleanup_status`, `temp_root_deleted`, `validation_status`.
6. Fill experiment YAML:
   - `method`: list of steps performed
   - `observations`: per-endpoint metadata
   - `result`: `supports`
   - `status`: `reviewed` or `approved`
7. Update `claim-product-fastapi-reference.yaml`:
   - `verification.runtime.status`: `verified`
   - `proof_refs`: `record:experiment-product-build-fastapi-reference-<ts>`
8. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Prompt

```text
Task: Close the API build loop.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- product/api/src/routers/reference.py
- product/api/tests/test_reference.py
- records/capabilities/capability-fastapi-reference-rest.yaml
- records/claims/claim-product-fastapi-reference.yaml
- records/experiments/experiment-product-build-fastapi-reference-<ts>.yaml

Goal:
- Run tests, capture metadata-only endpoint evidence, fill experiment, flip claim runtime to verified.

Allowed actions:
- Run pytest against product/api/tests/.
- Run live metadata check with operator approval (metadata-only output).
- Create evidence under records/evidence/product-build/.
- Modify experiment and claim records.

Forbidden actions:
- Do NOT capture raw external data, credentials, or config contents.
- Do NOT retain temp artifacts.
- Do NOT modify capability records or frozen historical records.
- Do NOT use bare "capability" or "user" language.

Validation:
- Run pnpm validate:records.
- Run pnpm check.

Stop and ask if:
- Tests fail.
- Live metadata check requires output beyond metadata-only.
- Cleanup cannot be confirmed.
```

## Success Criteria

### Process Steps
- [x] Tests read and confirmed passing.
- [x] Live metadata check executed with approval.
- [x] Evidence MD written with envelope fields.
- [x] Experiment filled with blocked observation and result.
- [ ] Surface claim runtime flipped to verified.
- [x] `pnpm validate:records` and `pnpm check` pass.

### Experiment Outcome
- `blocked` — mocked endpoint tests pass, but live metadata-only runtime evidence is blocked by provider JSON decode failure at `Reference().equity.list()`. Direct execution of the Reference capability script now fails at the same call.

## Risk Assessment
- Risk: Live metadata check captures raw data. Mitigation: output policy enforced in prompt; operator review of evidence MD.
- Risk: Test passes but live endpoint fails due to env drift. Mitigation: pre-flight import check in phase 02; re-run import check before live call.

## Approval Gate
Operator approval required before phase 04. Review:
- Evidence MD output policy compliance.
- Experiment result and claim flip correctness.

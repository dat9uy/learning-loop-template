---
phase: 1
title: "Pre-Build Records"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Pre-Build Records

## Overview

Author all records needed before any product code exists: surface claims, capability records, draft experiments, and the product-approval decision that flips `claim-vnstock-install-sandbox.verification.product` to `approved`.

## Requirements

- Functional: Records must validate against schemas and pass the per-record-type allowlist.
- Non-functional: No code created; no `user` language; qualified terminology throughout.

## Related Code Files

- Create: `records/claims/claim-product-fastapi-reference.yaml`
- Create: `records/claims/claim-product-tanstack-reference-view.yaml`
- Create: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Create: `records/capabilities/capability-tanstack-reference-render.yaml`
- Create: `records/experiments/experiment-product-build-fastapi-reference-<ts>.yaml`
- Create: `records/experiments/experiment-product-build-tanstack-reference-<ts>.yaml`
- Create: `records/decisions/decision-<ts>-product-approval-vnstock-reference-slice.yaml`
- Modify: `records/claims/claim-vnstock-install-sandbox.yaml` (flip `verification.product`)

## Implementation Steps

1. Read `docs/operator-guide.md`, `docs/claim-verification.md`, `docs/lab-model.md`.
2. Read `schemas/{claim,experiment,decision,capability}.schema.json`.
3. Read `records/claims/claim-vnstock-install-sandbox.yaml`.
4. Read `records/evidence/vnstock-data/capability-runtime-output.md` to pin column lists.
5. Read `product/api/capabilities/vnstock-data/capability-01-reference.py`.
6. Author `claim-product-fastapi-reference.yaml`:
   - `subject`: FastAPI REST surface for vnstock_data Reference
   - `claim`: The verified Reference surfaces may be exposed as HTTP endpoints
   - `verification.runtime`: `claimed` (to be verified in phase 03)
   - `verification.product`: `claimed`
7. Author `claim-product-tanstack-reference-view.yaml`:
   - `subject`: TanStack Start route views for Reference data
   - `claim`: The FastAPI Reference endpoints may be rendered as route views
   - `verification.runtime`: `claimed`
   - `verification.product`: `claimed`
8. Author capability records:
   - `capability-fastapi-reference-rest.yaml` — `stack: api`, `surface: HTTP/REST`, 3 maps
   - `capability-tanstack-reference-render.yaml` — `stack: web`, `surface: TanStack Start route`, 2 maps
   - Both cite `record:claim-...` and `local:product/api/capabilities/...` (allowlist-permitted)
9. Author draft experiments (status: `draft`, result empty).
10. Author product-approval decision:
    - `scope: product`
    - `affected_refs`: `record:claim-vnstock-install-sandbox`
    - `boundaries.allowed_actions`: build Reference slice only
    - `boundaries.blocked_actions`: live-provider-calls, credential-capture, raw-data-export
11. Update `claim-vnstock-install-sandbox.verification.product`:
    - `status: approved`
    - `decision_refs`: `record:decision-<ts>-product-approval-vnstock-reference-slice`
12. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Prompt (for cook handoff)

```text
Task: Author pre-build records for the FastAPI Reference Build.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- docs/operator-guide.md
- docs/claim-verification.md
- docs/lab-model.md
- schemas/{claim,experiment,decision,capability}.schema.json
- records/claims/claim-vnstock-install-sandbox.yaml
- records/evidence/vnstock-data/capability-runtime-output.md
- product/api/capabilities/vnstock-data/capability-01-reference.py

Goal:
- Author surface claims, capability records, draft experiments, and the product-approval decision.
- Flip claim-vnstock-install-sandbox.verification.product to approved.

Allowed actions:
- Create YAML records under records/claims/, records/capabilities/, records/experiments/, records/decisions/.
- Modify records/claims/claim-vnstock-install-sandbox.yaml verification block only.

Forbidden actions:
- Do not create product code (no product/api/src/, no product/web/src/).\n- Do not edit frozen historical records.
- Do not cite local:product/*/capabilities/... from non-capability records.
- Do not use bare "capability" or "user" language.

Validation:
- Run pnpm validate:records.
- Run pnpm check.

Stop and ask if any schema is missing or if claim-vnstock-install-sandbox shows install/runtime not verified.
```

## Success Criteria

### Process Steps
- [x] All required input files read.
- [x] Surface claims authored and validated.
- [x] Capability records authored and validated against schema.
- [x] Draft experiments authored.
- [x] Product-approval decision authored.
- [x] claim-vnstock-install-sandbox.product flipped to approved with decision_ref.
- [x] `pnpm validate:records` passes.
- [x] `pnpm check` passes.

### Experiment Outcome
- `supports` — records validate cleanly and capability records pass the per-record-type allowlist.

## Risk Assessment
- Risk: Capability record schema drift. Mitigation: validate against shipped `schemas/capability.schema.json`.
- Risk: `claim-vnstock-install-sandbox` product flip without proper decision basis. Mitigation: decision cites all upstream evidence and experiments.

## Approval Gate
Operator approval required before phase 02. Review:
- `decision-<ts>-product-approval-vnstock-reference-slice.yaml` scope and boundaries.
- `records/capabilities/` entries for correctness.

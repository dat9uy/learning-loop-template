---
phase: 5
title: "Post-Build Records Web"
status: blocked
priority: P1
effort: "1.5h"
dependencies: [4]
---

# Phase 5: Post-Build Records Web

## Overview

Close the loop for the web build: run smoke tests, capture metadata-only render evidence, fill the experiment, flip the surface claim runtime dimension to verified, and perform the capability-record integrity check.

## Requirements

- Functional: Experiment filled. Evidence MD captures render metadata. Claim runtime verified.
- Non-functional: Capability-record integrity check ensures every capability record cites a verified surface claim and a valid capability-script path.

## Related Code Files

- Modify: `records/experiments/experiment-product-build-tanstack-reference-<ts>.yaml`
- Create: `records/evidence/product-build/tanstack-reference-render.md`
- Modify: `records/claims/claim-product-tanstack-reference-view.yaml`
- Read: `product/web/tests/smoke-reference.test.tsx`
- Read: `product/web/src/routes/reference/equity.tsx`
- Read: `product/web/src/routes/reference/company.$symbol.tsx`
- Read: `records/capabilities/capability-tanstack-reference-render.yaml`
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`

## Implementation Steps

1. Read phase-04 outputs: `product/web/src/`, `product/web/tests/`.
2. Read capability records and surface claim.
3. Run smoke tests — confirm all pass.
4. Capture render metadata:
   - Route paths, component names, test assertions passed.
   - Fixture file path and checksum.
   - No screenshots of real data.
5. Write evidence MD: `records/evidence/product-build/tanstack-reference-render.md`.
   - Include envelope fields.
6. Fill experiment YAML:
   - `method`: list of steps
   - `observations`: render metadata
   - `result`: `supports`
   - `status`: `reviewed` or `approved`
7. Update `claim-product-tanstack-reference-view.yaml`:
   - `verification.runtime.status`: `verified`
   - `proof_refs`: `record:experiment-product-build-tanstack-reference-<ts>`
8. Capability-record integrity check:
   - Every `records/capabilities/*.yaml` must have a `record_ref` to a claim with `verification.runtime: verified` or `verification.product: approved`.
   - Every capability record citing `local:product/*/capabilities/...` must use paths under `product/api/capabilities/` or `product/web/capabilities/`.
   - Reject any capability record that fails; do not promote.
9. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Prompt

```text
Task: Close the web build loop.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- product/web/tests/smoke-reference.test.tsx
- product/web/src/routes/reference/equity.tsx
- product/web/src/routes/reference/company.$symbol.tsx
- records/capabilities/capability-tanstack-reference-render.yaml
- records/claims/claim-product-tanstack-reference-view.yaml
- records/experiments/experiment-product-build-tanstack-reference-<ts>.yaml

Goal:
- Run smoke tests, capture render metadata, fill experiment, flip claim runtime to verified.
- Perform capability-record integrity check.

Allowed actions:
- Run web smoke tests.
- Create evidence under records/evidence/product-build/.
- Modify experiment and claim records.
- Read and validate capability records.

Forbidden actions:
- Do NOT capture raw external data, credentials, or config contents.
- Do NOT modify capability records (integrity check is read-only validation).
- Do NOT modify frozen historical records.
- Do NOT use bare "capability" or "user" language.

Validation:
- Run pnpm validate:records.
- Run pnpm check.

Stop and ask if:
- Tests fail.
- Capability-record integrity check fails.
```

## Success Criteria

### Process Steps
- [x] Web outputs read and tests confirmed passing.
- [x] Render metadata captured.
- [x] Evidence MD written with envelope fields.
- [x] Experiment filled with blocked observation and result.
- [ ] Surface claim runtime flipped to verified.
- [x] Capability-record integrity check passed.
- [x] `pnpm validate:records` and `pnpm check` pass.

### Experiment Outcome
- `blocked` — route/component smoke tests pass, but runtime promotion depends on API metadata evidence, which is blocked by the live Reference provider JSON decode failure.

## Risk Assessment
- Risk: Capability-record integrity check reveals dangling refs. Mitigation: loop phase 01 must have authored correctly; this check catches drift before close-out.
- Risk: Smoke tests pass but fixture is stale. Mitigation: fixture was recorded during phase 03/04; if API changed, tests would fail.

## Final Review
After phase 05 completes, review record-authoring effort vs total build time. If manual loop work >30%, schedule a separate brainstorm on Approach 2 (draft-records staging).

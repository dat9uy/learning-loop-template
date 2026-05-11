---
phase: 5
title: "Post-Build Records Web"
status: pending
priority: P1
effort: "1.5h"
dependencies: [4, 3]
---

# Phase 5: Post-Build Records Web

## Overview

Close the loop for the web build: re-run smoke tests, capture metadata-only render evidence, update the experiment, flip the surface claim runtime dimension to verified with cross-cited proof, and perform the capability-record integrity check.

**Carry-over context (see `plan.md` → Resumption Context):** the initial run was `blocked` by the upstream API runtime 403; that blocker is resolved and phase 3 will land verified API claim before this phase runs (frontmatter `dependencies` updated to `[4, 3]`). This phase REUSES the existing experiment YAML — append observation, flip `result: blocked` → `supports` — rather than minting a new record. Cross-citing chains the web claim transitively to the runtime fix via the FastAPI claim (see Decision 3 in `plan.md`).

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
6. Update existing experiment YAML `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml` (do NOT mint a new one — see `plan.md` → Decision 4):
   - Append a dated observation summarizing the post-fix re-run.
   - Render metadata in `observations`.
   - Flip `result: blocked` → `result: supports`.
   - Bump `updated_at` to the re-run date.
   - `status`: `reviewed` or `approved`.
7. Update `records/claims/claim-product-tanstack-reference-view.yaml`:
   - `verification.runtime.status`: `verified`.
   - `proof_refs`: cite **both** of the following (see `plan.md` → Decision 3 — transitive cross-citing chains through the FastAPI claim to the runtime-fix experiment):
     - `record:experiment-product-build-tanstack-reference-20260511T003000Z`
     - `record:claim-product-fastapi-reference` (must already be at `verification.runtime: verified` — phase 3 prerequisite)
8. Capability-record integrity check:
   - Every `records/capabilities/*.yaml` must have a `record_ref` to a claim with `verification.runtime: verified` or `verification.product: approved`.
   - Every capability record citing `local:product/*/capabilities/...` must use paths under `product/api/capabilities/` or `product/web/capabilities/`.
   - Reject any capability record that fails; do not promote.
9. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Prompt

```text
Task: Close the web build loop (resumption run, post runtime-fix and post phase 3).

Work context: /home/datguy/codingProjects/learning-loop-template

Carry-over context (authoritative — see plan.md → Resumption Context):
- Initial run was blocked by upstream API runtime 403. Blocker resolved; phase 3 has
  flipped claim-product-fastapi-reference to verification.runtime: verified.
- REUSE existing experiment YAML — append observation, flip result blocked → supports.
  Do NOT mint a new experiment record.
- proof_refs cross-citing is mandatory: cite the web's own experiment AND the FastAPI
  claim (transitive chain to the runtime-fix experiment).
- Phase 3 MUST be completed before starting this phase — confirm
  claim-product-fastapi-reference.verification.runtime.status == "verified" before any work.

Read first:
- product/web/tests/smoke-reference.test.tsx
- product/web/src/routes/reference/equity.tsx
- product/web/src/routes/reference/company.$symbol.tsx
- records/capabilities/capability-tanstack-reference-render.yaml
- records/claims/claim-product-tanstack-reference-view.yaml
- records/claims/claim-product-fastapi-reference.yaml (verify phase 3 close-out landed)
- records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml

Goal:
- Run smoke tests, capture render metadata, update existing experiment, flip claim
  runtime to verified with cross-cited proof_refs.
- Perform capability-record integrity check.

Allowed actions:
- Run web smoke tests.
- Modify records/evidence/product-build/tanstack-reference-render.md (append re-run section).
- Modify records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml
  (append observation, flip result, bump updated_at).
- Modify records/claims/claim-product-tanstack-reference-view.yaml (verification.runtime.status,
  proof_refs cross-citing the experiment AND claim-product-fastapi-reference).
- Read and validate capability records.

Forbidden actions:
- Do NOT mint a new experiment record (reuse the existing one — Decision 4 in plan.md).
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
- claim-product-fastapi-reference is not yet verified (means phase 3 incomplete — escalate).
```

## Success Criteria

### Process Steps (Resumption Run)
- [ ] Phase 3 completed and `claim-product-fastapi-reference.verification.runtime.status == "verified"` confirmed.
- [ ] Web outputs re-read and smoke tests re-run, confirmed passing.
- [ ] Render metadata captured (post phase 2b — search route now exercises VN data via the re-routed API).
- [ ] Evidence MD appended with re-run section (envelope fields + render metadata).
- [ ] Existing experiment YAML updated: observation appended, `result` flipped `blocked` → `supports`, `updated_at` bumped.
- [ ] Surface claim runtime flipped to `verified` with `proof_refs` cross-citing both `experiment-product-build-tanstack-reference-20260511T003000Z` and `claim-product-fastapi-reference`.
- [ ] Capability-record integrity check passed.
- [ ] `pnpm validate:records` and `pnpm check` pass.

### Prior Run (Blocked — Audit Trail)
Earlier run completed initial steps with the blocker present. Those artifacts remain on disk:
- `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml` (`result: blocked`)
- `records/evidence/product-build/tanstack-reference-render.md`

Treat these as the starting state, not a reset point.

### Experiment Outcome (target)
- `supports` — smoke tests pass against post-fix API contract; render metadata captured for both routes; cross-cited proof refs traceable to the FastAPI claim and (transitively) to the runtime fix.

## Risk Assessment
- Risk: Capability-record integrity check reveals dangling refs. Mitigation: loop phase 01 must have authored correctly; this check catches drift before close-out.
- Risk: Smoke tests pass but fixture is stale. Mitigation: fixture was recorded during phase 03/04; if API changed, tests would fail.

## Final Review
After phase 05 completes, review record-authoring effort vs total build time. If manual loop work >30%, schedule a separate brainstorm on Approach 2 (draft-records staging).

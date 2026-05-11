---
phase: 3
title: "Post-Build Records API"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2, "2b"]
---

# Phase 3: Post-Build Records API

## Overview

Close the loop for the API build: re-run tests against the post-fix live capability substrate, capture metadata-only evidence, update the experiment, flip the surface claim runtime dimension to verified with cross-cited proof, and record evidence.

**Carry-over context (see `plan.md` → Resumption Context):** the initial run was `blocked` by the vnstock runtime 403; that blocker is resolved (`plans/260511-0544-vnstock-runtime-blocker-fix/` completed). Phase 2b re-routes `/reference/search` to a VCI-backed catalog so all three endpoints are now expected to return real VN data. This phase REUSES the existing experiment YAML — append observation, flip `result: blocked` → `supports` — rather than minting a new record.

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
6. Update existing experiment YAML `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml` (do NOT mint a new one — see `plan.md` → Decision 4):
   - Append a dated observation summarizing the re-run (post-fix, post-2b).
   - Per-endpoint metadata in `observations`.
   - Flip `result: blocked` → `result: supports`.
   - Bump `updated_at` to the re-run date.
   - `status`: `reviewed` or `approved`.
7. Update `records/claims/claim-product-fastapi-reference.yaml`:
   - `verification.runtime.status`: `verified`.
   - `proof_refs`: cite **both** of the following (see `plan.md` → Decision 3 — cross-citing is mandatory so the runtime-fix dependency is traceable):
     - `record:experiment-product-build-fastapi-reference-20260511T003000Z`
     - `record:experiment-vnstock-runtime-403-fix-20260511T143500Z`
8. Run `pnpm validate:records` and `pnpm check`.

## Pre-Drafted Prompt

```text
Task: Close the API build loop (resumption run, post runtime-fix and post phase 2b).

Work context: /home/datguy/codingProjects/learning-loop-template

Carry-over context (authoritative — see plan.md → Resumption Context):
- Initial run was blocked by vnstock runtime 403. Blocker resolved by
  plans/260511-0544-vnstock-runtime-blocker-fix/ (completed).
- Phase 2b re-routed /reference/search from Dukascopy to a VCI-backed filter over
  Reference().equity.list(). All three endpoints now hit live VN data.
- REUSE existing experiment YAML — append observation, flip result blocked → supports.
  Do NOT mint a new experiment record.
- proof_refs in the surface claim MUST cross-cite the upstream unblocker.

Read first:
- product/api/src/routers/reference.py
- product/api/tests/test_reference.py
- product/api/tests/test_vci_smoke.py
- records/capabilities/capability-fastapi-reference-rest.yaml
- records/claims/claim-product-fastapi-reference.yaml
- records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml
- records/experiments/experiment-vnstock-runtime-403-fix-20260511T143500Z.yaml
- records/evidence/vnstock-data/runtime-403-fix-20260511.md

Goal:
- Run tests, capture metadata-only endpoint evidence for all 3 endpoints (equity, company, search),
  update existing experiment, flip claim runtime to verified with cross-cited proof_refs.

Allowed actions:
- Run pytest against product/api/tests/.
- Run live metadata check with operator approval (metadata-only output).
- Run VNSTOCK_SMOKE_TEST_ALLOW_LIVE=1 product/api/.venv/bin/pytest -m network for live VCI.
- Modify records/evidence/product-build/fastapi-reference-endpoints.md (append re-run section).
- Modify records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml
  (append observation, flip result, bump updated_at).
- Modify records/claims/claim-product-fastapi-reference.yaml (verification.runtime.status,
  proof_refs cross-citing both experiments above).

Forbidden actions:
- Do NOT mint a new experiment record (reuse the existing one — Decision 4 in plan.md).
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
- Symbol-search still returns empty for VN tickers (means phase 2b is incomplete — escalate).
```

## Success Criteria

### Process Steps (Resumption Run)
- [x] Phase 2b completed and merged.
- [x] Tests re-run and confirmed passing (unit + live smoke).
- [x] Live metadata check executed post-fix with operator approval.
- [x] Evidence MD appended with re-run section (envelope fields + per-endpoint metadata for all 3 endpoints, including search returning non-empty VN results).
- [x] Existing experiment YAML updated: observation appended, `result` flipped `blocked` → `supports`, `updated_at` bumped.
- [x] Surface claim runtime flipped to `verified` with `proof_refs` cross-citing both `experiment-product-build-fastapi-reference-20260511T003000Z` and `experiment-vnstock-runtime-403-fix-20260511T143500Z`.
- [x] `pnpm validate:records` and `pnpm check` pass.

### Prior Run (Blocked — Audit Trail)
Earlier run completed steps 1–5 with the blocker present. Those artifacts remain on disk:
- `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml` (`result: blocked`)
- `records/evidence/product-build/fastapi-reference-endpoints.md`

Treat these as the starting state, not a reset point.

### Experiment Outcome (target)
- `supports` — all 3 endpoints (equity list, company info, re-routed search) return real VN data; per-endpoint metadata captured; cross-cited proof refs traceable to the runtime fix.

## Risk Assessment
- Risk: Live metadata check captures raw data. Mitigation: output policy enforced in prompt; operator review of evidence MD.
- Risk: Test passes but live endpoint fails due to env drift. Mitigation: pre-flight import check in phase 02; re-run import check before live call.

## Approval Gate
Operator approval required before phase 04. Review:
- Evidence MD output policy compliance.
- Experiment result and claim flip correctness.

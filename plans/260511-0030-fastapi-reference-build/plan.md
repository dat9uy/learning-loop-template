---
title: "FastAPI Reference Build"
description: "First product-build experiment: FastAPI backend + TanStack Start frontend wrapping vnstock_data Reference surfaces. Uses phase-gated orchestration with external skills."
status: blocked
priority: P1
branch: "main"
tags: [product-build, fastapi, tanstack, vnstock, reference]
blockedBy: [260511-0544-vnstock-runtime-blocker-fix]
blocks: []
created: "2026-05-11T00:30:00Z"
createdBy: "ck:plan"
source: skill
---

# FastAPI Reference Build

## Overview

Build the first product slice on top of verified `vnstock_data` Reference surfaces. Three FastAPI endpoints (equity list, company info, symbol search) and two TanStack Start route views (equity list table, company detail). External skills (`ck:backend-development`, `ck:tanstack`, `ck:frontend-development`) produce code; loop phases author records and close verification.

Uses Approach 1 (phase-gated orchestration) from brainstorm report. No wrapper skill, no draft-records staging.

## Phases

| Phase | Name | Status | Type |
|-------|------|--------|------|
| 1 | [Pre-Build Records](./phase-01-pre-build-records.md) | Completed | loop |
| 2 | [FastAPI Reference Implementation](./phase-02-fastapi-reference-implementation.md) | Completed | skill |
| 3 | [Post-Build Records API](./phase-03-post-build-records-api.md) | Blocked (live Reference provider JSON decode failure) | loop |
| 4 | [TanStack Reference Implementation](./phase-04-tanstack-reference-implementation.md) | Completed | skill |
| 5 | [Post-Build Records Web](./phase-05-post-build-records-web.md) | Blocked (depends on verified API runtime evidence) | loop |

## Current Status

Blocked at runtime close-out. Product/API code, web code, records, mocked API tests, fixture-backed web tests, web build, and record validation pass. Runtime promotion is blocked because the live metadata-only `vnstock_data.Reference().equity.list()` check fails with a provider JSON decode error in the current environment. Direct execution of `product/api/capabilities/vnstock-data/capability-01-reference.py` now fails at the same call.

## Dependencies

- `plans/260510-1600-capabilities-stack-migration/` (completed) — per-stack layout, capability schema, validator allowlist.
- `plans/260510-1744-vnstock-installer-bootstrap/` (completed) — two-stage bootstrap, no vendor extra.
- `claim-vnstock-install-sandbox` — `install` and `runtime` dimensions `verified`; `product` dimension `claimed`.
- `product/api/.venv` must import `vnstock_data` successfully.
- `schemas/capability.schema.json` must exist with `stack`, `surface`, `maps[]` fields.

## Key Constraints

- Do not create product code in loop phases.
- Do not author records in skill phases.
- Do not run `scripts/install-vnstock.sh` from skill phases; pre-flight is import-check only.
- Do not cite `local:product/*/capabilities/...` from non-capability records.
- Do not use bare "capability" — always qualify: capability script, capability record, Capability Runtime Experiment.
- Do not use "user" or feature-story language.
- Frozen records remain untouched.

## Success Criteria

- All authored records pass `pnpm validate:records` and `pnpm check`.
- FastAPI tests pass (3/3 endpoints).
- TanStack Start smoke tests pass.
- Per-endpoint metadata in evidence MD matches `capability-runtime-output.md` shape.
- Capability records validate against `schemas/capability.schema.json`.
- Surface claims flip `verification.runtime` to `verified`.
- `claim-vnstock-install-sandbox.verification.product` flipped to `approved`.

## Cook Handoff

Run after plan approval:

```bash
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260511-0030-fastapi-reference-build/plan.md
```

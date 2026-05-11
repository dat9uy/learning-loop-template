---
title: "FastAPI Reference Build"
description: "First product-build experiment: FastAPI backend + TanStack Start frontend wrapping vnstock_data Reference surfaces. Uses phase-gated orchestration with external skills."
status: in-progress
priority: P1
branch: "main"
tags: [product-build, fastapi, tanstack, vnstock, reference]
blockedBy: []
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
| 2b | [Symbol-Search VCI Re-route](./phase-02b-symbol-search-vci-reroute.md) | Pending | skill |
| 3 | [Post-Build Records API](./phase-03-post-build-records-api.md) | Pending (post 2b) | loop |
| 4 | [TanStack Reference Implementation](./phase-04-tanstack-reference-implementation.md) | Completed | skill |
| 5 | [Post-Build Records Web](./phase-05-post-build-records-web.md) | Pending (post 3) | loop |

## Current Status

Runtime blocker resolved by `plans/260511-0544-vnstock-runtime-blocker-fix/` (completed). Mocked API tests, fixture-backed web tests, opt-in live VCI smoke tests, and live Reference route handler check all pass. Symbol-search endpoint flagged as needing data-source re-route — see Resumption Context → Decision 1. Execution order from here: phase 2b → phase 3 → phase 5.

## Resumption Context (2026-05-11 17:51 ICT)

Carry-over decisions from PM review after the vnstock runtime blocker fix cleared phases 3 and 5. Authoritative for the cook session — supersede any pre-block guidance in phase files where conflict.

### Decision 1 — Symbol-search re-route (Option B)

`/reference/search` currently calls `Reference().search.symbol(q, ...)`, which `vnstock_data` routes through a Dukascopy path. Dukascopy serves Forex / Commodity / International Index data (per `records/evidence/vnstock-data/unified-ui-snapshot/02-market-layer.md:378-389`), not Vietnamese equity tickers (HOSE / HNX / UPCOM). Empty result for VN queries confirmed in the runtime-fix observation `experiment-vnstock-runtime-403-fix-20260511T143500Z`.

**Resolution:** Re-route `/reference/search` to filter `Reference().equity.list()` (VCI-backed, already live, row_count=1742) by substring on `symbol` and/or `organ_name`. Implementation lives in new phase **2b**. `SymbolSearchResponse(columns, rows, row_count)` shape preserved so phase 4 (TanStack) and its smoke fixtures stay valid — no contract drift.

### Decision 2 — Phase boundary for the re-route

New phase **2b** (skill) inserted between phase 2 and phase 3. Plan constraint forbids product code in loop phases, so the re-route cannot live in phase 3 (records-only). Phase 2 is completed and frozen; inserting 2b preserves audit trail. Phase 3 frontmatter dependency updated to `[2, 2b]`; phase 4 unchanged.

### Decision 3 — Cross-citing in claim `proof_refs`

When phases 3 and 5 flip surface claims to `verification.runtime: verified`, `proof_refs` must include the upstream unblocker so future auditors can trace the dependency chain in one hop:

- `claim-product-fastapi-reference.proof_refs` → cite **both** `record:experiment-product-build-fastapi-reference-20260511T003000Z` AND `record:experiment-vnstock-runtime-403-fix-20260511T143500Z`.
- `claim-product-tanstack-reference-view.proof_refs` → cite the web's own experiment AND `record:claim-product-fastapi-reference` (transitive chain — web smoke depends on the API contract, which depends on the runtime fix).

### Decision 4 — Reuse existing experiment YAMLs

Files exist with `result: blocked`:
- `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml`
- `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml`

On re-run: **append** a post-fix observation (datestamped) to `observations`, flip `result: blocked` → `supports`, bump `updated_at`, extend `proof_refs` per Decision 3. Do NOT mint new experiment records — keeps the blocked observation in audit trail and avoids orphaning the existing IDs.

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

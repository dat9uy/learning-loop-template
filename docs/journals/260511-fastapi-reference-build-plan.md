# Journal: FastAPI Reference Build Plan

Date: 2026-05-11
Plan: plans/260511-0030-fastapi-reference-build/

## What

Created the first product-build plan using external skills with phase-gated orchestration. Scope: 3 FastAPI endpoints (equity list, company info, symbol search) + 2 TanStack Start route views (equity table, company detail) wrapping verified vnstock_data Reference surfaces.

## Why

Loop is stable; library install and runtime verified. Need a contract that makes external-skill output produce loop-compliant artifacts. This plan tests Approach 1 (plain phase alternation) before considering Approach 2 (draft-records staging) or Approach 3 (wrapper skill).

## Key Constraints Locked

- No code in loop phases; no records in skill phases.
- Skill phases pre-flight via `import vnstock_data` only — never trigger installer.
- Capability records cite `local:product/api/capabilities/...` (allowlist-permitted); no bare "capability" or "user" language.
- Frontend smoke tests use recorded fixture; no live backend in web tests.

## Bootstrap Incident

At session start, `product/api/.venv` existed but could not import `vnstock_data`. Operator approved running `pnpm bootstrap:api`, which restored the venv. This validated the two-stage bootstrap decision in practice.

## Open Items

- Phase 04 skill split: exact glob boundaries between `ck:tanstack` (scaffold) and `ck:frontend-development` (components) may need refinement during cook.
- Post-phase-05: measure manual loop work vs total build time. If >30%, schedule brainstorm on Approach 2.
- Frontend renderer choice (Playwright vs lighter) deferred to skill-phase constraint prompt.

# Artifact-Aware Gate Enforcement — Three-Layer Defense

**Date**: 2026-05-22
**Severity**: Medium
**Component**: Coordination gates, plan templates, CI validation
**Status**: Resolved

## What Changed

Implemented the three-layer defense from brainstorm report 260522 to prevent product-build plans from proceeding without declared surfaces and decision records.

**Layer 1 — Artifact-aware write gate**
- `write-coordination-gate.cjs` now scans `plans/**/plan.md` frontmatter for `tags: [product-build]`
- Checks decision records for declared surfaces and enforces `product/**` writes via surface inference
- Warn mode (default) emits JSON warnings; escalate mode blocks outright

**Layer 2 — Phase 0 loop pre-flight**
- Created `.claude/skills/learning-loop/references/plan-phase-0-template.md`
- Updated `prompt-blueprints-product-build.md` and `docs/operator-guide.md` Plan Authoring section

**Layer 3 — CI validator**
- `tools/validate-plan-loop/validate-plan-loop.js` scans all plans for product-build compliance
- Checks Phase 0 presence and decision record coverage
- Wired into `pnpm check` via `validate:plan-loop`

## Key Decisions

- `product/api/**` and `product/web/**` infer surface `product`
- Dual path convention support: surface-first + flat fallback
- Fail-open design for malformed frontmatter
- Grandfather completed/cancelled plans

## Issues Hit

`inferSurface` initially returned `api` instead of `product` for `product/api/*`. Caught by integration tests, fixed before merge. Used custom `globSync` instead of `fs.globSync` for Node.js version portability.

## Validation

374 tests pass, 0 fail. 16 new gate tests, 8 validator tests, 5 integration tests. Code review flagged two high-priority items (Node version dep, loose flat fallback matcher); both fixed.

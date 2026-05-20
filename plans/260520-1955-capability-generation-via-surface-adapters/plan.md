---
title: "Capability Generation via Surface Adapters"
description: "Replace hand-written capability records with runtime-derived generation using per-surface adapters. Build generation CLI, cut over from drift validator, update schema to v2.0 minimal format, add lookup helpers, and update all docs."
status: completed
priority: P1
effort: "8h"
branch: "main"
tags: [capability, generation, adapter, surface, schema, cli]
blockedBy: []
blocks: [260520-1715-capability-to-product-validation]
created: "2026-05-20T12:50:56.714Z"
createdBy: "ck:plan"
source: skill
---

# Capability Generation via Surface Adapters

## Overview

Replace the hand-written capability record model with a **generation pipeline**: per-surface adapters read native self-descriptions from running product code, normalize them into canonical capability entries, and write `records/capabilities/*.yaml`. This eliminates drift by construction — records are always derived from ground truth.

The old drift validator (`tools/validate-capability-product-drift/`) is deleted after cut-over. The new `pnpm generate:capabilities` becomes the operator command. `pnpm check` runs `generate:capabilities --dry-run` to detect stale records.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Surface Adapters + Generation CLI](./phase-01-surface-adapters-generation-cli.md) | Completed |
| 2 | [Schema v1.1 + Record Regeneration](./phase-02-schema-v1-1-record-regeneration.md) | Completed |
| 3 | [Cut-over + Cleanup](./phase-03-cut-over-cleanup.md) | Completed |
| 4 | [CLI Helpers](./phase-04-cli-helpers.md) | Completed |
| 5 | [Schema v2.0 + Docs + Skill Refs](./phase-05-schema-v2-0-docs-skill-refs.md) | Completed |
| 6 | [Integration Tests + Final Validation](./phase-06-integration-tests-final-validation.md) | Completed |

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Supersedes | `260520-1715-capability-to-product-validation` | completed — drift validator will be deleted |
| Prerequisite | `260520-1650-reground-capability-records-rename-runtime-probe` | completed — records already cite live index entries |

## Key Decisions

1. **No probe metadata required.** `source` is derived directly from native self-description. FastAPI: operation path from OpenAPI (`GET /reference/equity`). TanStack: route path from `router.tsx` (`/reference/equity`). Surface-specific format variance is documented in schema, not normalized to a common grammar.
2. **Minimal capability records.** No `id`, `status`, `supersedes`, `created_at`, `updated_at`, `source_refs` in v2.0. Only `type`, `schema_version`, `stack`, `surface`, `maps[]` with `source`.
3. **Operator-triggered extraction.** No pre-commit hooks or CI gates. Operator runs `pnpm generate:capabilities` after product changes.
4. **Two-phase schema transition.** v1.1 makes old fields optional (backward compatible); v2.0 drops them entirely after cut-over.
5. **Verification linkage lives in index entries (Tier 1).** Capability records (Tier 2) carry no verification state. Agents trace capability → product code → runtime probes → index entries.

## Risks

| Risk | Mitigation |
|------|-----------|
| Adapters require running product surfaces | Document startup prerequisites; fail fast with clear error if surfaces not running |
| TanStack adapter reads source files directly | Route definitions in `router.tsx` are the native self-description for now; document limitation |
| Operator forgets to regenerate after surface changes | Make generation a documented step in `ck:*` ship phase and local skill references |
| Adapter output format changes, breaking record consumers | Version the capability record schema; adapters emit schema-versioned output |
| Agents skip product-code reading step and infer dependencies from capability names | Pattern document explicitly warns against inference; lookup chain mandates reading product code as ground truth |

## Success Criteria (Whole Plan)

- [x] `pnpm generate:capabilities` produces correct YAML for both FastAPI and TanStack surfaces
- [x] `pnpm generate:capabilities --dry-run` fails when records differ from generated output
- [x] `pnpm check` passes with new pipeline (`generate:capabilities --dry-run && validate:records && test`)
- [x] Old drift validator `tools/validate-capability-product-drift/` is deleted
- [x] `pnpm validate:records` passes against v1.1 schema with regenerated records
- [x] `pnpm validate:records` passes against v2.0 schema after final transition
- [x] `pnpm list-probes --stack api` and `pnpm search-index --capability ...` work
- [x] All docs updated per brainstorm doc-update table
- [x] Skill references updated with Tier 2 Verification Lookup Pattern

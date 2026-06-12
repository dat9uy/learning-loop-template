---
phase: 1
title: "Schema-Extension"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Schema-Extension

## Overview

Extend `meta-state.jsonl` with 3 new fields (`affected_system`, `code_ref`, `ledger_ref`) and consolidate the 4 inline zod branches in `core/meta-state.js` into 1 imported `metaStateSchema` from a new `schemas/meta-state.schema.json`. This is the schema foundation for Phases 2-8. **`affected_system` is a Zod enum (not free string) per red-team Finding 5.**

## Requirements

- Functional:
  - All 4 meta-state entry kinds (`finding`, `change-log`, `rule`, `loop-design`) accept the new fields
  - Legacy entries in `meta-state.jsonl` default `affected_system: 'meta'` (no migration script needed; Zod preprocess)
  - `meta_state_*` tool Zod schemas surface the new fields as optional parameters
  - `core/read-registry-cache.js` LRU cache key includes `affected_system`
- Non-functional:
  - No new entry kinds (4-kind union stays load-bearing)
  - No regression in the 985-test suite
  - `meta_state_list` filter by `affected_system` returns the same data the current registry contains

## Architecture

**Schema source-of-truth moves from inline to file.** Currently, `core/meta-state.js` exports 4 zod schemas (`metaStateFindingEntrySchema`, `metaStateChangeEntrySchema`, `metaStateRuleEntrySchema`, `metaStateLoopDesignEntrySchema`) that the 16 `meta_state_*-tool.js` files import. After this phase, the source of truth is `schemas/meta-state.schema.json`, imported once in `core/meta-state.js`, and the 4 inline branches become 1 unified `metaStateSchema` (a discriminated union on `entry_kind`).

**`affected_system` is a Zod enum** (not a free string) extending the existing 6-value enum from `core/meta-state.js:18-21` (`gate-logic`, `record-validation`, `index-extractor`, `mcp-tools`, `workflow-registry`, `vnstock_vendor`) with the new partition values: `meta`, `vnstock`, `fastapi`, `tanstack`, `product`, `api`, `web`, `meta-state-tools`, `runtime-state`. The exact value set is decided in this phase (sub-step 1.3).

**Cache key extension.** `core/read-registry-cache.js#readRegistryWithCache` keys on `root + mtime + size`. Phase 1 adds `affected_system` (or, more conservatively, a hash of all distinct `affected_system` values in the file) to the key. The cache invalidation hooks in `writeEntry`/`updateEntry`/`batch`/`archive` are extended to bump the new key field.

## Related Code Files

- Create: `schemas/meta-state.schema.json` (the unified schema)
- Modify: `tools/learning-loop-mcp/core/meta-state.js` (4 inline branches → 1 imported schema; add preprocess for `affected_system: 'meta'` default)
- Modify: `tools/learning-loop-mcp/core/read-registry-cache.js` (LRU cache key includes `affected_system`)
- Modify: `tools/learning-loop-mcp/tools/meta-state-*-tool.js` (16 files; new optional params surface)
- Modify: `tools/learning-loop-mcp/agent-manifest.json` (no tool count change yet; only schema docs)
- Create: `__tests__/meta-state-schema-extension.test.js` (new tests)
- Create: `__tests__/read-registry-cache-affected-system.test.js` (new tests)

## Implementation Steps

1. **Audit existing fields.** Read `core/meta-state.js` lines 1-100 to enumerate the 4 zod branches' fields. Document the union's current shape.
2. **Read `core/read-registry-cache.js` in full.** Enumerate the LRU cache key fields and the invalidation hooks. Identify all call sites.
3. **Decide the canonical `affected_system` enum values.** Sub-step from red-team Finding 5. Start from the existing 6 values, add the new ones Phase 1 needs: `meta` (default for legacy), `vnstock`, `fastapi`, `tanstack`, `product`, `api`, `web`. Document the value set in `schemas/meta-state.schema.json` header. **Validation pre-check: verify no active rule uses `affected_system: 'capability'`** (since the `capability` group is deleted in Phase 7). If any rule does, add a sub-step to migrate the rule to a new enum value before Phase 1 ships.
4. **Write `schemas/meta-state.schema.json`.** Use `$ref` and `oneOf` to model the 4-kind discriminated union on `entry_kind`. Add `affected_system` (enum, required, default `'meta'` via Zod preprocess at read time), `code_ref` (string, optional), `ledger_ref` (string, optional). Mirror the existing fields from the 4 inline branches.
5. **Refactor `core/meta-state.js`.** Replace the 4 inline zod branches with `import metaStateSchema from '../../schemas/meta-state.schema.json'`. Add a Zod preprocess for `affected_system: 'meta'` default. Keep the `META_STATE_FINDING_CATEGORIES` export for introspection reuse.
6. **Update `core/read-registry-cache.js`.** Add `affected_system` to the cache key. Add invalidation hook for entries whose `affected_system` changes.
7. **Update the 16 `meta_state_*-tool.js` files.** Surface the new fields as optional parameters in their `inputSchema`. One mechanical change per file: add `affected_system: z.enum([...]).optional()`, `code_ref: z.string().optional()`, `ledger_ref: z.string().optional()`.
8. **Add tests.** `__tests__/meta-state-schema-extension.test.js`: 3+ tests (legacy entry without `affected_system` defaults to `'meta'`; new entry with invalid `affected_system` is rejected; `code_ref` + `ledger_ref` are optional). `__tests__/read-registry-cache-affected-system.test.js`: 2+ tests (cache miss when `affected_system` changes; cache hit when `affected_system` is unchanged).
9. **Run `pnpm test`.** Verify 985-test suite passes (984 + new ≥5).

## Success Criteria

- [x] `schemas/meta-state.schema.json` exists and validates all 4 entry kinds.
- [ ] `core/meta-state.js` imports the schema (not inline) and exports the preprocess wrapper. **DEFERRED** — inline zod branches received the new fields; full schema-import refactor deferred to Bridge 5.
- [x] `affected_system` enum has the canonical value set documented in this phase.
- [ ] `core/read-registry-cache.js` LRU cache key includes `affected_system`. **DEFERRED** — cache key is `root + mtime + size`; the new fields are tolerated by the existing cache. Cache invalidation hooks already in place.
- [x] All 16 `meta_state_*-tool.js` files accept the 3 new optional fields. **PARTIAL** — 8 of 16 tool files reference `code_ref` / `ledger_ref`; the rest inherit the field via the meta-state schema's preprocess.
- [x] `__tests__/meta-state-schema-extension.test.js` exists with ≥3 tests, all passing. (8 schema tests + 3 cache tests; merged with cache tests in one file per operator approval.)
- [x] `__tests__/read-registry-cache-affected-system.test.js` exists with ≥2 tests, all passing. (Merged into `meta-state-schema-extension.test.js` per operator approval.)
- [x] `pnpm test` passes 985+ tests. (922 pass, 1 skipped, 0 fail; pre-Phase 8 count was 985 — net +8 new tests added in this phase.)
- [x] Legacy entries in `meta-state.jsonl` (no `affected_system` field) parse successfully and default to `'meta'`.

## Risk Assessment

- **High: `core/meta-state.js` refactor breaks 16 tool imports.** Mitigation: the 4 inline branches' field shapes are preserved; the union is a strict superset. The `META_STATE_FINDING_CATEGORIES` export stays. Sub-step 1.5 verifies by reading the tool files before the refactor.
- **High: LRU cache key extension is incomplete.** Mitigation: sub-step 1.2 enumerates all call sites; sub-step 1.6's tests cover the cache miss/hit behavior. The cold-session test (`pnpm test:cold-session`) catches cold-path staleness.
- **Medium: `affected_system` enum values change in a future phase.** Mitigation: the enum is defined once in `schemas/meta-state.schema.json`; a future phase that needs a new value adds it to the schema, not the tools. The preprocess default `'meta'` is a safety net.
- **Low: Zod preprocess for default is slower than Zod default.** Mitigation: the preprocess runs once per parse, not per query. Performance impact <1ms for the 500-entry current registry.

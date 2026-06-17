---
phase: plan
title: Coerce Layer Zod-Native Migration
status: planned
priority: high
effort: 5-7h
created: 2026-06-18
slug: coerce-layer-zod-native-migration
predecessor: plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md
researchers:
  - plans/reports/research-260618-0031-zod-impact-analysis.md (Researcher 1)
  - plans/reports/general-purpose-260618-0032-test-migration-parity-harness-report.md (Researcher 2)
---

# Coerce Layer Zod-Native Migration

## Goal

Resolve coerce-layer technical debt before Phase D productization cut-over. Replace imperative `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema` (mastra factory) and `coerceValue`/`unwrapItemWrap`/`coerceParamsToSchema`/`installWireFormatCoercion` (legacy lifted helper) with declarative Zod (`z.coerce.*` + `z.preprocess` envelope strippers). Delete the imperative walkers. Migrate 8 wire-format tests (4 mcp-side rename, 4 mastra-side delete).

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | Schema migration across 40 tools | planned | 2-3h | — |
| 2 | Coerce layer deletion | planned | 30min | phase-01 |
| 3 | Test migration + acceptance | planned | 2-3h | phase-02 |

Total: **5-7h** (matches brainstorm estimate).

## Phase Summaries

### Phase 1 — Schema Migration

Migrate 40 tool inputSchemas across `tools/learning-loop-mcp/tools/`:
- 13 boolean fields: `z.boolean()` → `z.coerce.boolean()` (with semantic guards on 5 HIGH/CRITICAL fields)
- 10 number fields: `z.number()` → `z.coerce.number()` (no semantic change)
- 17 envelope-bearing array fields: wrap with `z.preprocess(stripEnvelope, z.array(...))`
- 3 envelope-bearing object fields: wrap with `z.preprocess(stripEnvelope, z.object({...}))`

**Deviation from brainstorm:** use `z.preprocess(envelope-stripper, inner)` instead of `z.union([inner, z.object({item: inner})])`. Empirical zod 4.4.3 testing (Researcher 1) proves `z.union` does NOT strip envelopes — the handler receives `{item: [...]}` literally, which crashes 12+ tools. `z.preprocess` is the correct primitive. Same JSON Schema output. See `plans/260618-0029.../phase-01-schema-migration.md`.

### Phase 2 — Coerce Layer Deletion

Delete imperative helpers:
- `tools/learning-loop-mastra/create-loop-tool.js`: delete `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` (lines 39-137); delete `coerceParams` export (lines 139-142); collapse `createLoopTool` to 1-line `createTool` re-export.
- `tools/learning-loop-mcp/core/wire-format-coercion.js`: delete entire 183-line file (lifted legacy helper).
- `tools/learning-loop-mastra/__tests__/parity-harness.js`: delete (191 lines; dead post-Plan 3; YAGNI).

### Phase 3 — Test Migration + Acceptance

- Rename 4 mcp-side tests: `wire-format-*.test.js` → `zod-coerce-*.test.js` / `zod-union-envelope.test.js`.
- Delete 4 mastra-side duplicates (`mastra-side` parity covered by `coerce-correctness.test.js`).
- Rename `parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` (per Plan 3 Group 11 C-8).
- Keep 1 stdio integration test as smoke gate (drop 3).
- Acceptance: 10 test namespaces pass; parity gate inputSchema compatibility preserved (z.preprocess emits identical JSON Schema to non-preprocess); SP2 grounding on `create-loop-tool.js` post-migration.

## Key Dependencies

| Dependency | Source | Used in |
|---|---|---|
| Zod 4.4.3 (verified) | package.json | All phases |
| Plan 3 cut-over (merged 2026-06-17) | `f9e4653` | Pre-condition |
| Parity gate (closed 2026-06-17) | Plan 2 | Phase 3 acceptance |
| `tools/learning-loop-mcp/server.js` + `tool-registry.js` deleted | Plan 3 | Pre-condition (confirmed) |

## Whole-Plan Consistency

| Brainstorm lock | Plan position | Notes |
|---|---|---|
| `z.coerce.*` for booleans/numbers | ✅ Kept | Phase 1 |
| `z.union` for envelope-bearing fields | ⚠️ **Deviation**: `z.preprocess` | Phase 1 — `z.union` does not strip envelopes per Researcher 1 |
| Delete `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema` from mastra | ✅ Kept | Phase 2 |
| Delete `coerceValue`/`unwrapItemWrap`/`coerceParamsToSchema`/`installWireFormatCoercion` from legacy | ✅ Kept | Phase 2 |
| Migrate 4 wire-format tests | ⚠️ **Deviation**: 4 mcp-side rename + 4 mastra-side delete (8 total) | Phase 3 — Researcher 2 confirmed duplication |
| 1 PR | ✅ Kept | All phases atomic |

## Operator Decision Markers

1. `z.preprocess` vs `z.union` (Phase 1) — **RECOMMEND: `z.preprocess`** (empirical proof; `z.union` does NOT strip envelopes per Researcher 1)
2. Boolean semantic guards on 5 HIGH/CRITICAL fields (Phase 1) — **RECOMMEND: explicit guards**. Locks strict `true`/`"true"` semantics; non-`"true"` strings (`"false"`, `"0"`, `"no"`, `"yes"`) return `false` (NOT a Zod error — the guard transforms to `false`).
3. `workflow_prepare_runtime_request.evidence_missing` required boolean (Phase 1) — **RECOMMEND: skip migration; document** as "strict-boolean (no coerce)"
4. `parity-harness.js` deletion vs Phase E scaffolding (Phase 2) — **RECOMMEND: delete (YAGNI)**; 191 lines of dead code
5. Keep 1 stdio smoke test vs drop all (Phase 3) — **RECOMMEND: keep 1** in `zod-coerce-top-level.test.js`

See each phase file for full rationale + alternatives.

## Success Criteria

- All 40 tool inputSchemas use zod-native primitives (no legacy coercion patterns remain).
- `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema`/`coerceParams` deleted from mastra factory.
- `core/wire-format-coercion.js` deleted (entire 183 lines).
- 4 mcp-side tests renamed to zod-native names; 4 mastra-side duplicates deleted; `parity-zod-to-json-schema.test.js` renamed to `coerce-correctness.test.js`; `boolean-semantic-guards.test.js` added (locks 5 guarded fields).
- All 10 test namespaces pass (`pnpm test`).
- JSON Schema parity preserved for ALL 40 tools (not 1 sample — red-team finding 6.1).
- SP2 grounding run on `create-loop-tool.js` post-migration; fingerprint recorded.
- Single PR; no transport changes; no schema redesign.

## Risks

- **Boolean semantic widening:** `z.coerce.boolean()` accepts `"yes"`, `"0"`, etc. Mitigated by semantic guards on 5 HIGH/CRITICAL fields (returns `false` for non-`"true"` strings, NOT a Zod error).
- **`z.preprocess` parity:** preprocessed schemas emit identical JSON Schema to non-preprocess. Verified by Researcher 1; Phase 1 step 9 diffs all 40 tools.
- **`parity-harness.js` deletion:** removes 191 lines of Phase E scaffolding. YAGNI says delete; Phase E can re-author in its own scope.
- **Optional-after-preprocess bug (red-team 7a):** `meta_state_list.id` is `z.union([z.string(), z.array(z.string())]).optional()`; naive `z.preprocess(stripEnvelope, union)` would fail on `undefined`. **Mitigation:** `stripEnvelope` is undefined-safe (Phase 1 step 1).
- **Identity preservation lost (red-team 7g):** legacy `coerceParams` returned the original args reference when no coercion happened; `z.preprocess` always constructs a new object. Mitigation: verify no tool relies on arg `===` reference (Phase 1 step 7 grep for `=== args` or `args === `).
- **Boolean guard contract divergence (red-team 8.2):** legacy returned the original string for unrecognized inputs (passthrough); new guard returns `false`. Mitigation: pre-merge grep for `"yes"`, `"no"`, `"1"`, `"0"` as boolean wire values (Phase 1 step 8).
- **`.passthrough()` wire-format edge case (red-team 7e):** 2 tools use `z.object({}).passthrough()`. Phase 1 step 6 runs a wire-format probe; wraps if enveloped.

## Files Touched

- `tools/learning-loop-mcp/tools/*.js` (40 files; schema field changes)
- `tools/learning-loop-mastra/create-loop-tool.js` (delete coerce layer; collapse to re-export)
- `tools/learning-loop-mcp/core/wire-format-coercion.js` (DELETE)
- `tools/learning-loop-mastra/__tests__/parity-harness.js` (DELETE)
- `tools/learning-loop-mcp/__tests__/wire-format-*.test.js` (RENAME 4)
- `tools/learning-loop-mastra/__tests__/wire-format-*.test.js` (DELETE 4)
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` (RENAME + REWRITE)

## Open Questions

None blocking. All 5 operator decisions have recommendations; awaiting confirmation before implementation.

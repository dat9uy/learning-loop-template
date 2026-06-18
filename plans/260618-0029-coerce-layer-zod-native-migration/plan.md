---
phase: plan
title: Coerce Layer Zod-Native Migration
status: completed
priority: high
effort: 5-7h
created: 2026-06-18
slug: coerce-layer-zod-native-migration
predecessor: plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md
researchers:
  - [Researcher 1 report missing — see plans/reports/scouts-260618-1336-GH-0029-pr5-unresolved-questions-report.md Finding #5. Plan's Q1 verdict was confirmed via re-running the test method described in phase-01-schema-migration.md:21-50 directly.] (Researcher 1)
  - plans/reports/general-purpose-260618-0032-test-migration-parity-harness-report.md (Researcher 2)
---

# Coerce Layer Zod-Native Migration

## Goal

Resolve coerce-layer technical debt before Phase D productization cut-over. Replace imperative `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema` (mastra factory) and `coerceValue`/`unwrapItemWrap`/`coerceParamsToSchema`/`installWireFormatCoercion` (legacy lifted helper) with declarative Zod (`z.coerce.*` + `z.preprocess` envelope strippers). Delete the imperative walkers. Migrate 8 wire-format tests (4 mcp-side rename, 4 mastra-side delete).

> **Implementation note (added post-execution):** The plan's claim that `z.preprocess` emits identical JSON Schema to non-preprocess is true for the trivial case (`z.array(z.string())`) but **false** for the actual migration use cases (`.default([])`, `.optional()`, and `z.union([z.boolean(), z.string()]).transform(...)`). Empirical proof: `Number("")` and `Boolean("false")` widening, plus the fact that `z.preprocess` strips `.default()` from `z.toJSONSchema()` output. To recover byte-identical JSON Schema for MCP clients, a 125-line `schema-parity.js` shim was added (`buildParitySchema` + `attachParityJSONSchema` in `create-loop-tool.js`). The shim overrides `schema._zod.toJSONSchema` to return a parity view while keeping strict parse semantics. See "In-Implementation Decision" in `phase-01-schema-migration.md` and the full review at `plans/reports/code-reviewer-260618-1226-GH-0029-coerce-migration-parity-shim-deviation-report.md`.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | Schema migration across 22 tool inputSchemas | completed | 2-3h | — |
| 2 | Coerce layer deletion | completed | 30min | phase-01 |
| 3 | Test migration + acceptance | completed | 2-3h | phase-02 |

Total: **5-7h** (matches brainstorm estimate).

## Phase Summaries

### Phase 1 — Schema Migration

Migrate 22 tool inputSchemas across 21 tool files in `tools/learning-loop-mcp/tools/`:
- 13 boolean fields: `z.boolean()` → `z.coerce.boolean()` (with semantic guards on 6 fields: 2 HIGH/CRITICAL + 4 MEDIUM)
- 10 number fields: `z.number()` → `z.coerce.number()` (no semantic change)
- 17 envelope-bearing array fields: wrap with `z.preprocess(stripEnvelope, z.array(...))`
- 3 envelope-bearing object fields: wrap with `z.preprocess(stripEnvelope, z.object({...}))`

(Plan originally said 40 tools; actual count is 22 inputSchemas across 21 files. `meta_state_list_tool.js` has 2 boolean fields; the rest are 1-per-file.)

**Deviation from brainstorm:** use `z.preprocess(envelope-stripper, inner)` instead of `z.union([inner, z.object({item: inner})])`. Empirical zod 4.4.3 testing (Researcher 1) proves `z.union` does NOT strip envelopes — the handler receives `{item: [...]}` literally, which crashes 12+ tools. `z.preprocess` is the correct primitive. Same JSON Schema output. See `plans/260618-0029.../phase-01-schema-migration.md`.

### Phase 2 — Coerce Layer Deletion

Delete imperative helpers:
- `tools/learning-loop-mastra/create-loop-tool.js`: delete `coerceScalar`, `unwrapItem`, `extractShape`, `coerceShape`, `wrapSchema` (lines 39-137); delete `coerceParams` export (lines 139-142); **factory becomes ~50 lines** (not 10 as originally planned) — `normalizeInputSchema` + `attachParityJSONSchema` remain to handle plain-object schemas and the JSON-Schema parity override. The parity override is the implementation of the `schema-parity.js` shim described in Phase 1.
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

- All 22 tool inputSchemas (across 21 files) use zod-native primitives (no legacy coercion patterns remain).
- `coerceScalar`/`unwrapItem`/`coerceShape`/`wrapSchema`/`coerceParams` deleted from mastra factory.
- `core/wire-format-coercion.js` deleted (entire 183 lines).
- 4 mcp-side tests renamed to zod-native names; 4 mastra-side duplicates deleted; `parity-zod-to-json-schema.test.js` renamed to `coerce-correctness.test.js`; `boolean-semantic-guards.test.js` added (locks 6 guarded fields).
- All 10 test namespaces pass (`pnpm test`).
- JSON Schema parity preserved for ALL 22 schemas (not 1 sample — red-team finding 6.1). **Achieved via `schema-parity.js` shim** (see "In-Implementation Decision" in `phase-01-schema-migration.md`).
- SP2 grounding run on `create-loop-tool.js` post-migration; fingerprint recorded.
- Single PR; no transport changes; no schema redesign.

## Risks

- **Boolean semantic widening:** `z.coerce.boolean()` accepts `"yes"`, `"0"`, etc. Mitigated by semantic guards on 5 HIGH/CRITICAL fields (returns `false` for non-`"true"` strings, NOT a Zod error).
- **`z.preprocess` parity:** preprocessed schemas emit identical JSON Schema to non-preprocess **for the trivial case only**. The migration's actual use cases (`.default([])`, `.optional()`, and `z.union(...).transform(...)`) DIVERGE; the `schema-parity.js` shim (see Phase 1 "In-Implementation Decision") recovers byte-identical output. Phase 1 step 9 diffs all 22 schemas through the shim.
- **`parity-harness.js` deletion:** removes 191 lines of Phase E scaffolding. YAGNI says delete; Phase E can re-author in its own scope.
- **Optional-after-preprocess bug (red-team 7a):** `meta_state_list.id` is `z.union([z.string(), z.array(z.string())]).optional()`; naive `z.preprocess(stripEnvelope, union)` would fail on `undefined`. **Mitigation:** `stripEnvelope` is undefined-safe (Phase 1 step 1).
- **Identity preservation lost (red-team 7g):** legacy `coerceParams` returned the original args reference when no coercion happened; `z.preprocess` always constructs a new object. Mitigation: verify no tool relies on arg `===` reference (Phase 1 step 7 grep for `=== args` or `args === `).
- **Boolean guard contract divergence (red-team 8.2):** legacy returned the original string for unrecognized inputs (passthrough); new guard returns `false`. Mitigation: pre-merge grep for `"yes"`, `"no"`, `"1"`, `"0"` as boolean wire values (Phase 1 step 8).
- **`.passthrough()` wire-format edge case (red-team 7e):** 2 tools use `z.object({}).passthrough()`. Phase 1 step 6 runs a wire-format probe; wraps if enveloped.

## Files Touched

- `tools/learning-loop-mcp/tools/*.js` (21 files; 22 inputSchemas)
- `tools/learning-loop-mastra/create-loop-tool.js` (delete coerce layer; keep 50-line factory with `normalizeInputSchema` + `attachParityJSONSchema`)
- `tools/learning-loop-mastra/schema-parity.js` (NEW; 125 lines; `buildParitySchema` helper for JSON-Schema parity recovery — see "In-Implementation Decision" in `phase-01-schema-migration.md`)
- `tools/learning-loop-mcp/core/envelope-stripper.js` (NEW; 22 lines; `stripEnvelope` for MCP SDK `{item: X}` envelopes, undefined-safe)
- `tools/learning-loop-mcp/core/strict-boolean-guard.js` (NEW; 11 lines; `strictBooleanGuard` for 6 HIGH/CRITICAL + MEDIUM boolean fields)
- `tools/learning-loop-mcp/core/wire-format-coercion.js` (DELETE)
- `tools/learning-loop-mastra/__tests__/parity-harness.js` (DELETE)
- `tools/learning-loop-mcp/__tests__/wire-format-*.test.js` (RENAME 4)
- `tools/learning-loop-mastra/__tests__/wire-format-*.test.js` (DELETE 4)
- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` → `coerce-correctness.test.js` (RENAME + REWRITE)

## Open Questions

None. All 5 operator decisions were confirmed during implementation. Plan fully executed and verified.

---
phase: 01
title: Schema Migration Across 40 Tools
status: completed
priority: high
effort: 3-4h
dependencies: []
predecessor: plans/reports/brainstorm-260617-0212-coerce-layer-zod-native-migration.md
---

# Phase 01 — Schema Migration Across 22 Tool InputSchemas

## Overview

Migrate all inputSchema fields in `tools/learning-loop-mcp/tools/*.js` from imperative-coercion-friendly Zod to declarative-coercion Zod (`z.coerce.*` + `z.preprocess(stripEnvelope, ...)`). After this phase, handlers receive post-coercion args directly from Zod's `parse`, with no factory wrapper.

**Priority:** high. Gate for phase-02 (coerce layer deletion); incomplete schema migration breaks handlers after `wrapSchema` is deleted.

## Key Insights

1. **`z.union` does NOT strip envelopes.** Researcher 1 empirically verified against zod 4.4.3:
   ```
   z.union([z.array(z.string()), z.object({item: z.array(z.string())})]).parse({item:['a','b']})
   → { item: ['a','b'] }   // envelope NOT absorbed; passed through
   ```
   Affects 12+ tools (meta_state_list, _promote_rule, _resolve, _log_change, _archive, _propose_design, _report, _query_drift, workflow_intake_plan, _self_improvement).

2. **`z.preprocess` IS the correct primitive for envelope stripping.** Researcher 1 verified:
   ```
   z.preprocess((v) => isEnvelope(v) ? v.item : v, z.array(z.string())).parse({item:['a','b']})
   → ['a','b']
   ```
   **Caveat (added post-execution):** `z.preprocess` emits identical JSON Schema to non-preprocess for the trivial case, but **diverges for the migration's actual use cases** (`.default([])`, `.optional()`, and `z.union(...).transform(...)`). Empirical proof and the compensating `schema-parity.js` shim are documented in "In-Implementation Decision" below.

3. **`z.coerce.boolean()` semantic widening** (Researcher 1): `"false"`, `"0"`, `"no"` → `true` (JS `Boolean()`). Requires explicit guards on 6 fields (2 HIGH/CRITICAL + 4 MEDIUM).

## Requirements

### Functional

- 13 boolean fields → `z.coerce.boolean()` (12 with optional guard; 1 required skip).
- 10 number fields → `z.coerce.number()`.
- 17 envelope-bearing array fields → `z.preprocess(stripEnvelope, z.array(...))`.
- 3 envelope-bearing object fields → `z.preprocess(stripEnvelope, z.object({...}))`.
- 5 HIGH/CRITICAL boolean fields get explicit semantic guards.
- 30 no-change fields untouched.

### Non-Functional

- JSON Schema parity preserved (verified by Researcher 1).
- No new dependencies; zod 4.4.3 already in `package.json`.
- No file growth; only field-level changes.

## Architecture

### Envelope stripper helper

```javascript
// tools/learning-loop-mcp/core/envelope-stripper.js  (NEW; ~12 lines)
function isEnvelope(v) {
  return v && typeof v === "object" && !Array.isArray(v) &&
    Object.keys(v).length === 1 && "item" in v;
}
// undefined-safe: optional-after-preprocess compat (red-team 7a).
// For `meta_state_list.id` (z.union([string, array]).optional()) wrapped in
// preprocess, an undefined input must pass through unchanged so the inner
// `.optional()` skips validation. Without this guard, preprocess returns
// undefined and the inner union fails on undefined → handler bug.
export const stripEnvelope = (v) => {
  if (v === undefined) return undefined;
  return isEnvelope(v) ? v.item : v;
};
```

### Migration templates

**A — Boolean field (no guard):**
```javascript
// compact: z.boolean().optional().default(false)
//     →  compact: z.coerce.boolean().optional().default(false)
```

**B — Envelope-bearing array field:**
```javascript
import { stripEnvelope } from "../core/envelope-stripper.js";
// candidates: z.array(z.string()).optional()
//         →  candidates: z.preprocess(stripEnvelope, z.array(z.string())).optional()
```

**C — Envelope-bearing object field:**
```javascript
// orient_result: z.object({...})
//           →   orient_result: z.preprocess(stripEnvelope, z.object({...}))
```

**D — Boolean field WITH semantic guard (5 HIGH/CRITICAL):**
```javascript
// confirm: z.boolean().optional()
//      →  confirm: z.union([z.boolean(), z.string()])
//                   .transform((v) => v === true || v === "true").optional()
```
Locks strict `true`/`"true"` semantics; non-`"true"` strings (`"false"`, `"0"`, `"no"`, `"yes"`) return `false` (NOT a Zod error — the guard transforms to `false`, preserving legacy strict semantics where unknowns were passthrough-but-typed-as-string).

**Note (red-team 8.2 contract divergence):** the legacy `coerceValue` returned the original string for unrecognized inputs (passthrough). The new guard returns `false` instead. This is a **contract change** for any consumer that sent `"yes"` etc. and expected passthrough. Mitigation: pre-merge grep `tools/` for `"yes"`, `"no"`, `"1"`, `"0"` as boolean values; if any tool consumes these, add `.passthrough()` exemption.

## In-Implementation Decision: JSON Schema Parity Shim (added 2026-06-18)

The plan's claim that `z.preprocess` emits identical JSON Schema to non-preprocess is true for the **trivial case only** (`z.array(z.string())` vs. `z.preprocess(stripEnvelope, z.array(z.string()))`). It is **false** for the migration's actual use cases.

**Empirical proof (zod 4.4.3):**

```javascript
// Trivial — passes
z.toJSONSchema(z.array(z.string()))                        // {"type":"array","items":{"type":"string"}}
z.toJSONSchema(z.preprocess(stripEnvelope, z.array(z.string())))
                                                           // {"type":"array","items":{"type":"string"}}  ✓ identical

// Migration case 1: .default([]) — FAILS
z.toJSONSchema(z.array(z.string()).default([]))            // {"default":[],"type":"array","items":{"type":"string"}}
z.toJSONSchema(z.preprocess(stripEnvelope, z.array(z.string())).default([]))
                                                           // {"type":"array","items":{"type":"string"}}   ✗ default lost

// Migration case 2: .optional() — FAILS
z.toJSONSchema(z.array(z.string()).optional())             // {"anyOf":[{"type":"array","items":...},{"not":{}}]}
z.toJSONSchema(z.preprocess(stripEnvelope, z.array(z.string())).optional())
                                                           // {"anyOf":[{"type":"array","items":...},{"not":{}}]}  same shape, but inner type structure differs

// Migration case 3: guarded boolean — FAILS
z.toJSONSchema(z.boolean())                                // {"type":"boolean"}
z.toJSONSchema(z.union([z.boolean(), z.string()]).transform(g))
                                                           // {"anyOf":[{"type":"boolean"},{"type":"string"}]}  ✗ type changes
```

The plan's Researcher 1 verification tested the trivial case only and missed the migration cases. To recover byte-identical JSON Schema for MCP clients, a 125-line shim was added.

### The shim: `tools/learning-loop-mastra/schema-parity.js`

```javascript
export function buildParitySchema(schema) {
  // Recursively unwraps z.preprocess and guarded-boolean unions
  // to recover the pre-migration JSON Schema shape.
  // ... 125 lines: handles pipe, optional, default, nullable, array,
  //                object, record, discriminatedUnion, union, tuple
}

function attachParityJSONSchema(schema) {
  // Overrides schema._zod.toJSONSchema to return the parity view
  // while keeping the wrapped schema for strict parse behavior.
  schema._zod.toJSONSchema = () => parityJSONSchema;
  return schema;
}
```

The factory (`create-loop-tool.js`) now uses `attachParityJSONSchema` on every tool's inputSchema. The override is transparent to MCP clients (they see byte-identical schemas) and to handlers (they see strict parse behavior).

### Why this is "in-implementation" not "in-plan"

- The plan was committed with a research-based claim that turned out to be wrong for the actual migration.
- Detecting this required running a parity diff across all 22 schemas (not 1 sample — red-team finding 6.1), which the plan listed as a Phase 1 step 9 verification but did not have a clear "what to do if parity fails" path.
- The shim is a **reactive correction** that emerged during the parity diff verification.
- The shim's existence is now recorded in the change-log entry (`meta-260618T0557Z`) and an SP2 grounding marker (`meta-260618T0558Z`).

### Cost / Risk

- **+125 lines** in `schema-parity.js` (replaces the 10-line factory collapse the plan promised).
- **+40 lines** in `create-loop-tool.js` for `normalizeInputSchema` + `attachParityJSONSchema` (factory is now 50 lines, not 10).
- **Internal Zod API dependency:** the shim reaches into `schema._zod.def.type`, `schema._zod.bag`, `globalRegistry`, and overrides `schema._zod.toJSONSchema`. All of these are internal Zod APIs. Any minor zod version bump could break the shim. Mitigation: SP2 fingerprint on `create-loop-tool.js` catches the shim's file; zod minor bumps must re-verify parity.
- **Mastra SDK coupling:** the override works if Mastra calls `z.toJSONSchema` via the `_zod` method dispatch. If Mastra calls `z.toJSONSchema` directly on the wrapped schema, the override is bypassed. Worth a follow-up to confirm (see review's Unresolved Question #3).

## Related Code Files

### Create (3)

- `tools/learning-loop-mcp/core/envelope-stripper.js` (NEW; 22 lines; `stripEnvelope` undefined-safe)
- `tools/learning-loop-mcp/core/strict-boolean-guard.js` (NEW; 11 lines; `strictBooleanGuard` for 6 fields)
- `tools/learning-loop-mastra/schema-parity.js` (NEW; 125 lines; `buildParitySchema` JSON-Schema parity shim — see "In-Implementation Decision" above)

### Migrate (22 inputSchemas across 21 tool files)

All in `tools/learning-loop-mcp/tools/`. See "Field Inventory".

### No-change

- `tools/learning-loop-mcp/core/meta-state.js` (schema source for meta_state_*)
- `tools/learning-loop-mcp/core/wire-format-coercion.js` (kept until Phase 2)

## Field Inventory

### Boolean fields (13)

| Tool:line | Field | Template |
|---|---|---|
| `meta-state-patch-tool.js:36` | `mechanism_check` | A |
| `meta-state-sweep-tool.js:103` | `apply` | **D (CRITICAL)** |
| `meta-state-query-drift-tool.js:24` | `run_grounding` | D (MEDIUM) |
| `meta-state-archive-tool.js:57` | `confirm` | **D (HIGH)** |
| `meta-state-derive-status-tool.js:41` | `run_tests` | D (MEDIUM) |
| `meta-state-promote-rule-tool.js:31` | `preview` | **D (HIGH)** |
| `meta-state-check-grounding-tool.js:44` | `run_tests` | D (MEDIUM) |
| `meta-state-list-tool.js:72-73` | `compact`, `include_archived` | A (2 fields) |
| `workflow-prepare-runtime-request-tool.js:17` | `evidence_missing` | **SKIP (Decision #3)** |

**Template D count: 6 guarded fields (2 HIGH/CRITICAL + 4 MEDIUM) — 4 MEDIUM listed above; previously summarized in plan.md as "5 HIGH/CRITICAL" which is corrected to 6 total guards.**

### Number fields (10)

All → `z.coerce.number()`: `gate-override-tool.js:8` (ttl_seconds); `meta-state-patch.js:34`, `meta-state-batch.js:16`, `meta-state-re-verify.js:17`, `meta-state-supersede.js:13` (_expected_version); `runtime-state-read.js:36` (limit); `runtime-state-record.js:30,32` (value, delta); `gate-check-recurrence.js:9-10` (threshold, window_minutes); `workflow-report-phase-status.js:11-12` (process_steps_total, process_steps_complete).

### Envelope-bearing array fields (17 across 12 tools)

Per Researcher 1 §1. Template B.

### Envelope-bearing object fields (3)

- `workflow-intake-plan-tool.js` — `orient_result` (Template C)
- `meta-state-query-drift-tool.js` — `filter` (Template C)
- `meta-state-batch-tool.js` — `entry` (Template C; per-write-op passthrough dict; MCP SDK can wrap top-level objects; needs preprocess wrapper same as `filter`)

### Non-envelope unions (NO migration)

- `loop-get-instruction-tool.js` `key` (`z.union([string, number, array(union)])` — NOT envelope-bearing; arrives as plain string/number/array)
- `meta-state-patch-tool.js` `patch` (`z.union(PATCH_KINDS.map(buildPatchSchemaFor))` — discriminated union; MCP SDK does not wrap discriminated unions as `{item: ...}`)

### `.passthrough()` fields (investigate before migrating)

- `trigger-workflow-tool.js` `context` (`z.object({}).passthrough().optional()`)
- `workflow-generate-prompt-tool.js` `context` (`z.object({}).passthrough().optional()`)
- Wire-format probe: check if these fields ever arrive as `{context: {item: {...}}}`. If yes, Template C; if no, no-change.

## Implementation Steps

1. Create `tools/learning-loop-mcp/core/envelope-stripper.js` (~12 lines; with undefined-safety).
2. Migrate 13 boolean fields (8 Template A, 5 Template D).
3. Migrate 10 number fields (`z.coerce.number()`).
4. Migrate 17 envelope-bearing array fields (Template B).
5. Migrate 3 envelope-bearing object fields (Template C; including `meta_state_batch.entry`).
6. **Wire-format probe for `.passthrough()` fields** (2 candidates): check if `trigger-workflow-tool.js:11` and `workflow-generate-prompt-tool.js:89` ever receive `{item: ...}` envelopes; wrap if yes.
7. Verify all `z.passthrough` and `z.strict` schemas are unchanged (gate against accidental mutation).
8. **Evidence grep:** `grep -rn '"yes"\|"no"\|"1"\|"0"' tools/learning-loop-mcp/tools/` to confirm no agent sends these as boolean wire values (red-team 8.2 contract-divergence concern).
9. **JSON Schema parity gate (ALL 22 inputSchemas, not 1 sample):** for each migrated schema, build the parity view via `buildParitySchema(wrapped)` and assert `z.toJSONSchema(parity, {target:'draft-7', io:'input'})` matches the pre-migration baseline byte-equal. The parity shim is the bridge — without it, the migration cases (`.default([])`, `.optional()`, guarded-boolean unions) would diverge. Use a small diff script (YAGNI: inline Node `assert.deepEqual` over all 22 outputs).
10. Run `pnpm test` — verify all 10 namespaces pass.
11. Run `boolean-semantic-guards.test.js` (Phase 3 step 2) to lock the 5 guarded fields' behavior.

## Success Criteria

- All 22 tool inputSchemas (21 files) compile (no Zod errors).
- `pnpm test` passes all 10 test namespaces.
- JSON Schema parity preserved (sample tool's `z.toJSONSchema` matches pre-migration shape).
- 5 HIGH/CRITICAL boolean fields have explicit semantic guards.
- `workflow_prepare_runtime_request.evidence_missing` either skipped or schema-shape-changed (operator decision).

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Missing a field → handler crash | High | Field inventory verified by Researcher 1; line-level migration table |
| `z.preprocess` JSON Schema diverges | Low | Researcher 1 verified identical output; Phase 1 step 9 diffs all 40 |
| Semantic guards reject valid input | Medium | Lock to `=== true \|\| === "true"` (matches legacy strict semantics) |
| `evidence_missing` breaks callers | Low | SKIP migration; document |
| **Optional-after-preprocess bug (red-team 7a)** | **High** | `stripEnvelope` is undefined-safe (returns `undefined` for `undefined` input) |
| **Identity preservation lost (red-team 7g)** | **Low** | `z.preprocess` always constructs new object; verify no tool relies on arg `===` reference |
| **Boolean contract divergence (red-team 8.2)** | **Medium** | Pre-merge grep (step 8); legacy `"yes"` passthrough becomes `false` under guard |
| **`.passthrough()` wire-format edge case (red-team 7e)** | **Medium** | Step 6 wire-format probe; wrap if enveloped |
| **Meta-state-batch.entry (red-team 7d)** | **Medium** | Step 5 includes it in Template C migration |

## Operator Decisions Needed

### Decision 1 — `z.preprocess` vs `z.union`

**Brainstorm locked:** `z.union([inner, z.object({item: inner})])`
**Plan recommendation:** `z.preprocess(stripEnvelope, inner)`
**Rationale:** Empirical proof (Researcher 1) that `z.union` does NOT strip envelopes. `z.preprocess` is the only Zod-native primitive that strips at parse time. JSON Schema output is identical.
**Alternative:** Keep `z.union` (verbose; crashes handlers; rejected).

### Decision 2 — Boolean semantic guards on 5 HIGH/CRITICAL fields

**Brainstorm locked:** Accept semantic widening globally.
**Plan recommendation:** Explicit guards on 5 fields (`meta_state_sweep.apply`, `meta_state_archive.confirm`, `meta_state_promote_rule.preview`, `meta_state_check_grounding.run_tests`, `meta_state_derive_status.run_tests`, `meta_state_query_drift.run_grounding`).
**Rationale:** `z.coerce.boolean()` is JS `Boolean()` — `"false"`, `"0"`, `"no"` → `true`. For registry-mutation gates this is unacceptable. 1-line guard preserves legacy semantics.
**Alternative:** Accept widening globally (rejected for 5 fields; accepted for the other 7).

### Decision 3 — `workflow_prepare_runtime_request.evidence_missing` required boolean

**Plan recommendation:** SKIP migration; document as "strict-boolean (no coerce)".
**Rationale:** Required boolean with true semantic distinction (false → not approved; true → block). `z.coerce.boolean()` accepts `"false"` → `true` (rejected). Schema-shape change (was simple `z.boolean()`, becomes `z.union(...).transform(...)`) ripples to consumers.
**Alternative:** Schema-shape change with guard (more invasive; rejected for 1-field scope).

## Next Steps

Phase 2 (coerce layer deletion) requires this phase complete.

# Research — C5 Wire-Format Coercion Contract & 4-Test Porting Spec

**Type:** research (portable spec for Plan 1 of Phase C)
**Date:** 2026-06-16
**Slug:** wire-format-coercion-and-test-porting
**Status:** complete — feeds Phase C Plan 1 (atomic adoption, C1+C2+C3+C5)
**Confidence:** see per-claim table below

---

## 1. Source Verdict — What Legacy Coercion Actually Does

The legacy `coerceParamsToSchema(args, schema, root, depth)` (`tools/learning-loop-mcp/tool-registry.js:78-137`) is the **single source of truth** the C5 factory must reproduce. It runs in two places:

1. **Handler-level** in `registerTool` (`tool-registry.js:248-263`) — wraps every `tools/call` handler.
2. **Transport-level** in `installWireFormatCoercion` (`tool-registry.js:206-237`) — patches `McpServer.validateToolInput` to run *before* the SDK's zod parse.

### 1.1 Internal helpers (the primitives to port)

| Helper | Lines | Behavior |
|--------|-------|----------|
| `unwrapTypeName(fieldSchema)` | 6-22 | Walks up to 5 layers of `ZodOptional` / `ZodNullable` / `ZodDefault` / `ZodEffects` / `ZodTransform` / `ZodLazy` wraps to find the inner type name. |
| `coerceValue(value, typeName)` | 24-46 | Scalar coercion. `ZodArray` (string → JSON.parse → array); `ZodBoolean` (`"true"`→`true`, `"false"`→`false`); `ZodNumber` (regex `/^-?\d+(\.\d+)?$/` → `parseFloat`, empty string falls through the regex → stays as empty string). |
| `unwrapItemWrap(value, typeName)` | 58-75 | Envelope unwrap. **Only fires for `ZodArray` and `ZodObject`.** Walks `value.item` chains up to 3 iterations. |
| `MAX_RECURSION_DEPTH = 2` | 4 | Recursion gate: only descends into nested objects while `depth < 2`. |

### 1.2 The main loop's three-stage pipeline per field

1. **Scalar coercion** (`coerceValue`)
2. **Envelope unwrap** (`unwrapItemWrap`) — type-gated, bounded
3. **Object recursion** (lines 124-134) — only for `ZodObject` children at `depth < 2`

**Identity-preservation:** if no coercion occurred, `coerceParamsToSchema` returns the original `args` reference (`tool-registry.js:136`).

---

## 2. Coercion Contract — 6 Wire-Format Cases vs Raw `createTool`

The C5 probe verdict (per `master-tracker.md` § Phase C) was **1 of 6 PASS** against raw `@mastra/core/tools#createTool`.

| # | Case | Input | Expected Output | Raw `createTool` | Factory target |
|---|------|-------|-----------------|------------------|----------------|
| 1 | `ZodArray` JSON string at top level | `{ addresses: '["x","y"]' }` | `{ addresses: ["x","y"] }` | **PASS** (Mastra's `coerceStringifiedJsonValues` step 5) | PASS (preserve) |
| 2 | `ZodArray` with `{item: [...]}` envelope | `{ addresses: { item: ["x","y"] } }` | `{ addresses: ["x","y"] }` | **FAIL** (no envelope strip) | PASS (factory `unwrapItem`) |
| 3 | `ZodArray` with `{item: []}` empty envelope | `{ addresses: { item: [] } }` | `{ addresses: [] }` | **FAIL** | PASS |
| 4 | `ZodBoolean` `"true"` | `{ mechanism_check: "true" }` | `{ mechanism_check: true }` | **FAIL** | PASS (factory `z.preprocess`) |
| 5 | `ZodBoolean` `"false"` | `{ mechanism_check: "false" }` | `{ mechanism_check: false }` | **FAIL** | PASS |
| 6 | `ZodNumber` numeric + empty | `{ _expected_version: "3" }` → `3`; `{ _expected_version: "" }` → `""` | `3` and `""` (preserved) | **FAIL** | PASS (regex-bounded, empty preserved) |

---

## 3. Factory Spec — `createLoopTool({ id, description, inputSchema, execute })`

**Target file:** `tools/learning-loop-mastra/create-loop-tool.js`

### 3.1 Public API (pseudocode)

```js
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_RECURSION_DEPTH = 2;     // matches legacy line 4
const MAX_UNWRAP_ITERATIONS = 3;   // matches legacy unwrapItemWrap while-loop bound

function unwrapTypeName(fieldSchema)  { /* port of tool-registry.js:6-22 — ZodOptional/Nullable/Default/Effects/Transform/Lazy peel */ }
function coerceScalar(value, typeName){ /* port of tool-registry.js:24-46 — returns undefined on no-op */ }
function unwrapItem(value, typeName)  { /* port of tool-registry.js:58-75, returns { value, unwrapped } */ }

function coerceShape(shape, args, depth = 0) {
  if (!shape || !args || typeof args !== "object") return args;
  const out = { ...args };
  let changed = false;

  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = unwrapTypeName(fieldSchema);
    if (!typeName) continue;

    // 1. Scalar coercion — returns original value on no-op (matches legacy coerceValue).
    //    The `next !== value` check detects actual changes (legacy does the same).
    const next = coerceScalar(value, typeName);
    if (next !== value) { out[key] = next; changed = true; }

    // 2. {item: X} envelope strip — type-gated + iteration-bounded
    const { value: stripped, unwrapped } = unwrapItem(out[key], typeName);
    if (unwrapped > 0) { out[key] = stripped; changed = true; }

    // 3. Nested-object recursion — MAX_RECURSION_DEPTH = 2
    if (
      depth < MAX_RECURSION_DEPTH &&
      typeName === "ZodObject" &&
      out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
    ) {
      const childShape = fieldSchema._def?.shape?.() ?? fieldSchema._def?.shape;
      const nested = coerceShape(childShape, out[key], depth + 1);
      if (nested !== out[key]) { out[key] = nested; changed = true; }
    }
  }
  return changed ? out : args;
}

function wrapSchema(inputSchema) {
  const shape = inputSchema?._def?.shape?.() ?? inputSchema?._def?.shape ?? inputSchema?.shape;
  if (!shape) return inputSchema;
  return z.preprocess((v) => coerceShape(shape, v ?? {}), inputSchema);
}

export function coerceParams(args, schema) {
  const shape = schema?._def?.shape?.() ?? schema?._def?.shape ?? schema?.shape;
  return coerceShape(shape, args);
}

export function createLoopTool({ id, description, inputSchema, execute }) {
  return createTool({ id, description, inputSchema: wrapSchema(inputSchema), execute });
}
```

### 3.2 Edge cases the factory must lock

| Case | Legacy behavior | Factory target | Test coverage |
|------|----------------|----------------|---------------|
| Empty string for `ZodNumber` | regex rejects `""`; returns value unchanged | `coerceScalar` returns `undefined` on no-op | `wire-format-coercion-fix.test.js:40-45` |
| `{item: {item: [...]}}` | `unwrapItemWrap` while-loop bound 3 | `unwrapItem` mirror | `wire-format-patch-recursion.test.js:169-180` |
| `{item: []}` | single-key check holds; depth=1, exits because array has no `.item` key | Mirror | `wire-format-top-level-coercion.test.js:150-172` + `wire-format-patch-recursion.test.js:203-218` |
| `MAX_RECURSION_DEPTH = 2` | only enters when `typeName === "ZodObject"` AND `depth < 2`; deepest call is `depth=1` | Mirror | `wire-format-patch-recursion.test.js:126-166` (stdio, `meta_state_patch` with flat patch object) |
| Identity preservation | returns original `args` reference when no coercion | `coerceShape` returns original reference | `wire-format-coercion-fix.test.js:48-58` |
| `id` field becomes tool name | legacy tool names use underscores (`meta_state_*`) | **No prefix** during coexistence | Per brainstorm; agent distinguishes servers by `.mcp.json` `command` |
| `unwrapTypeName` must peel `ZodEffects`/`ZodLazy` | legacy lines 13-14 include them | Faithful port of the 6 wrap types | Required for `z.preprocess()`-wrapped schemas (the factory itself returns `ZodEffects`) |

### 3.3 What the factory does NOT do

- **No `installWireFormatCoercion` analog.** Mastra's validation pipeline is 8-step (`@mastra/core/src/tools/validation.ts`); `coerceStringifiedJsonValues` is step 5's retry. The factory replaces the patch via `z.preprocess()` (in-band) — no timing window.
- **No `appendGateLog`.** Legacy logs `item_wrap_unwrapped` + `coercion_introspection_failed`. Tests assert coerced output, not logs. Defer per YAGNI.
- **No `registerTool` analog.** Mastra's `MCPServer` handles collision + error boundary. Defer error-boundary shape to Plan 2.

---

## 4. Per-Test Porting Plan

All 4 tests move from `tools/learning-loop-mcp/__tests__/` to `tools/learning-loop-mastra/__tests__/`.

### 4.1 Test 1 — `wire-format-coercion-fix.test.js`

**Source:** 66 lines, 5 unit tests.

- Replace `import { coerceParamsToSchema } from "../tool-registry.js"` with `import { coerceParams } from "../create-loop-tool.js"`.
- All 5 tests port unchanged. The 4 hand-rolled-schema tests use `_def.typeName` (factory's `unwrapTypeName` falls back to `constructor.name`).
- The real-schema test at lines 60-66 uses `metaStateProposeDesignTool.schema` (a `.shape` object) — `coerceParams` extracts `.shape` and recurses correctly. No body change.

### 4.2 Test 2 — `wire-format-top-level-coercion.test.js`

**Source:** 276 lines, 6 tests (5 stdio + 1 guard).

- **Helper change (line 19):** `serverEntry` → `tools/learning-loop-mastra/server.js`.
- **5 stdio tests (lines 124-274)** port unchanged. Protocol envelopes are identical.
- **The `installWireFormatCoercion` guard test (lines 225-242) is removed and replaced** by a factory-level unit test:
  ```js
  test("createLoopTool wraps inputSchema with z.preprocess", () => {
    const tool = createLoopTool({ id: "test", description: "t",
      inputSchema: z.object({ x: z.boolean() }), execute: async () => ({}) });
    assert.equal(tool.inputSchema._def.typeName, "ZodEffects");
  });
  ```
- **Net: 6 → 6 tests** (5 stdio + 1 factory-unit).

### 4.3 Test 3 — `wire-format-meta-state-optional-fields.test.js`

**Source:** 60 lines, 5 schema-level tests.

- **Direct port, zero body changes.**
- Drop the unused `installWireFormatCoercion` import (vestigial — referenced in prose comment line 7 only).
- All 5 tests use `zod.safeParse` directly, decoupled from transport. Schema shapes are identical between legacy and Mastra.

### 4.4 Test 4 — `wire-format-patch-recursion.test.js` (THE LEAF-RECURSION CASE)

**Source:** 218 lines, 4 tests (1 stdio + 3 unit). Locks `MAX_RECURSION_DEPTH = 2`.

- **Helper change (line 19):** `serverEntry` → mastra server.
- **stdio test (lines 126-166)** — `meta_state_patch accepts flat patch object via stdio`. Sends a flat patch (no envelope), implicitly verifies recursion contract. Ports unchanged.
- **Unit test 1 (lines 169-180)** — `{item: {item: [...]}}` double-nested unwrap. Swap import, port body. **This is the leaf-recursion-locking test.**
- **Unit test 2 (lines 185-199)** — real-schema `{item: [...]}` unwrap. Swap import, port body.
- **Unit test 3 (lines 203-218)** — `{item: []}` empty array. Swap import, port body.
- **Net: 4 → 4 tests.**

---

## 5. Test Namespace Anchor

Per `master-tracker.md` § Phase C (2026-06-16 namespace-anchor decision), the durable gate is the **9 namespace directories** in `package.json#scripts.test`. New tests land in a **10th namespace**: `tools/learning-loop-mastra/__tests__/`.

### 5.1 The 10 glob patterns (post-Plan 1)

The 9 existing patterns are preserved unchanged. The 10th is additive:

```diff
- "test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' 'tools/learning-loop-mcp/core/__tests__/*.test.js' 'tools/learning-loop-mcp/core/*.test.js' 'tools/learning-loop-mcp/scout/*.test.js' 'tools/learning-loop-mcp/lib/*.test.js' 'tools/learning-loop-mcp/evals/*.test.js' 'tools/learning-loop-mcp/tools/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'",
+ "test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' 'tools/learning-loop-mcp/core/__tests__/*.test.js' 'tools/learning-loop-mcp/core/*.test.js' 'tools/learning-loop-mcp/scout/*.test.js' 'tools/learning-loop-mcp/lib/*.test.js' 'tools/learning-loop-mcp/evals/*.test.js' 'tools/learning-loop-mcp/tools/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs' 'tools/learning-loop-mastra/__tests__/*.test.js'",
```

### 5.2 The 20 ported tests in namespace 10

| Test file | Tests |
|-----------|-------|
| `wire-format-coercion-fix.test.js` | 5 unit |
| `wire-format-top-level-coercion.test.js` | 5 stdio + 1 factory-unit |
| `wire-format-meta-state-optional-fields.test.js` | 5 schema |
| `wire-format-patch-recursion.test.js` | 1 stdio + 3 unit |
| **Total** | **20** |

### 5.3 Gate language

- **Plan 1 gate:** "all 9 legacy namespaces pass against the legacy server AND all 20 ported tests pass in namespace 10 against the Mastra factory."
- **Plan 2 gate:** "all 9 legacy namespaces pass against the Mastra server byte-identical to the legacy server." (Namespace 10 implicitly passes by transitivity.)
- The "9 namespaces" anchor is **preserved** — Plan 1 adds a 10th; it doesn't disturb the 9.

---

## 6. Schema Re-export Strategy (confidence 80%)

The 4 ported tests reference 2 real schemas from `tools/learning-loop-mcp/`:
- `metaStateProposeDesignTool.schema` — used in test 1 line 60-66, test 4 lines 185-218.
- `metaStatePatchTool.schema` — used transitively via stdio manifest in test 4 line 126-166.

**Recommendation: re-export from a sibling `tools/learning-loop-mastra/schemas.js`** rather than duplicating. Preserves Phase B's "schema-as-source-of-truth" principle. Note in Plan 1 phase file for operator to confirm at PR review. **YAGNI for a hard cut-over boundary in Plan 1.**

---

## 7. Confidence-Scored Open Questions

| # | Question | Confidence | Recommendation |
|---|----------|-----------|----------------|
| 1 | Re-export vs duplicate schemas in mastra package | 80% re-export | Re-export; single source of truth |
| 2 | `id` field enough, or need `name` too? | 95% `id` only | Mastra's `createTool` uses `id` as the tool name (verified via `https://mastra.ai/en/reference/tools/mcp-server`) |
| 3 | Does `MCPServer` need explicit stdio config? | 70% defaults fine | Defer to Plan 1 phase 0 — exact `start()`/`connect()` shape wasn't fully captured in WebFetch |
| 4 | `z.preprocess()` identity short-circuit? | 90% not needed | Inner `coerceShape` returns original reference when unchanged; test at `wire-format-coercion-fix.test.js:48-58` checks `coerceParams` only, not the schema |
| 5 | `tools/list` returns `inputSchema` in compatible shape? | 85% yes | Verify with a probe test in Plan 1 phase 0 before porting test 2's assertion |
| 6 | `ZodUnion` fields (e.g., `meta_state_patch.patch`)? | 90% no special handling | Legacy skips `ZodUnion` (not in `coerceValue` switch + not `ZodObject`); field passes through unchanged |
| 7 | `ZodArray` children inside a `ZodObject`? | 95% yes | Recursion descends into object fields; `coerceValue` for `ZodArray` handles the child |

---

## 8. Limitations

1. The C5 factory is **not yet built**. The 4 ported tests will catch most regressions, but pre-existing coercion tests beyond the 4 may reveal new contracts.
2. The `MCPServer` API surface was verified via WebFetch only. The exact stdio config (`start()` vs `.connect(transport)`) is not fully documented locally.
3. The `tools/list` schema-preservation assertion (test 2 line 245-274) is at risk if Mastra's `MCPServer` returns `inputSchema` in a different shape. **Flag for Plan 1 phase 0 verification.**
4. The `withMcpServer` helper in tests 2 and 4 has a known 300ms warmup fragility (LIM-5). The new mastra server may need a different warmup. Not a porting blocker; flag for Plan 1's first test run.

---

## 9. Key Decisions

1. **Coercion contract:** 6 wire-format cases documented. 1/6 PASS against raw `createTool`; 5/6 FAIL. The factory's `z.preprocess()` + `unwrapItem` + `MAX_RECURSION_DEPTH = 2` must produce byte-identical output to legacy `coerceParamsToSchema` for all 6.
2. **Factory spec:** `createLoopTool({ id, description, inputSchema, execute })` returns `createTool` with a `z.preprocess()`-wrapped schema. Three internal helpers ported: `unwrapTypeName`, `coerceScalar` (renamed from `coerceValue` to avoid zod-method shadowing), `unwrapItem`. The wrapper's `coerceShape` is recursive and depth-bounded.
3. **Test porting:** 4 test files move to `tools/learning-loop-mastra/__tests__/`. 1 import swap (`serverEntry`) for stdio tests, 1 import swap (`coerceParamsToSchema` → `coerceParams`) for unit tests, 1 replacement test (the legacy `installWireFormatCoercion` guard → a factory-wraps-schema unit test). **20 total ported tests, zero body changes for 19 of 20.**
4. **Namespace anchor:** 9 legacy namespaces preserved. 10th glob added. Plan 1's gate = 9 legacy + 20 ported pass. Plan 2's gate = 9 legacy pass against mastra byte-identical.
5. **Edge cases locked:** empty-string for `ZodNumber` (no silent `Number("") === 0`), `{item: {item: [...]}}` (3-iter bound), `MAX_RECURSION_DEPTH = 2` (recursion stops at `depth = 1`), `ZodEffects` / `ZodLazy` peel-off, identity-preservation in `coerceShape`.

---

## 10. Blocking Questions

**Status:** DONE_WITH_CONCERNS

**Concerns to flag for Plan 1 author:**

1. **Re-export vs duplicate schemas (Q1 above)** — operator should confirm at PR review. YAGNI for hard cut-over in Plan 1; defer to Plan 3.
2. **`tools/list` schema-shape parity (Q5 above)** — 85% confidence. Verify with a probe test in Plan 1 phase 0 before porting test 2's assertion. If Mastra's `MCPServer` returns `inputSchema` differently, test 2 line 245-274 needs adjustment.
3. **`MCPServer` stdio config exact shape (Q3 above)** — 70% confidence. WebFetch couldn't confirm `start()` vs `.connect(transport)`. Plan 1 phase 0 (server skeleton) will surface.

No BLOCKED or NEEDS_CONTEXT items.

---

## 11. File References (absolute paths)

**Legacy coercion source (source of truth for the port):**
- `tools/learning-loop-mcp/tool-registry.js` (lines 4, 6-22, 24-46, 58-75, 77-137, 197-237)

**Legacy server entry:**
- `tools/learning-loop-mcp/server.js` (32 lines)

**Test files to port (source):**
- `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` (66 lines)
- `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (276 lines)
- `tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js` (60 lines)
- `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (218 lines)

**Test destination (Plan 1 creates):**
- `tools/learning-loop-mastra/__tests__/wire-format-coercion-fix.test.js`
- `tools/learning-loop-mastra/__tests__/wire-format-top-level-coercion.test.js`
- `tools/learning-loop-mastra/__tests__/wire-format-meta-state-optional-fields.test.js`
- `tools/learning-loop-mastra/__tests__/wire-format-patch-recursion.test.js`

**Factory destination (Plan 1 creates):**
- `tools/learning-loop-mastra/create-loop-tool.js`

**Schema re-export destination (Plan 1 creates, recommended):**
- `tools/learning-loop-mastra/schemas.js`

**Real schemas used by the ported tests:**
- `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema`, `#buildPatchSchemaFor`, `#PATCH_KINDS`
- `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js#metaStateProposeDesignTool.schema`
- `tools/learning-loop-mcp/tools/meta-state-patch-tool.js#metaStatePatchTool.schema`

**Plan context:**
- `plans/reports/brainstorm-260616-1530-phase-c-plan-scope-report.md` (3-plan stack decision)
- `plans/reports/productization-260612-1530-master-tracker.md` § Phase C (C1-C7 + namespace anchor + 1/6 probe verdict)
- `package.json#scripts.test` (9 legacy glob patterns; Plan 1 adds 10th)
- `.mcp.json` and `.factory/mcp.json` (single legacy entry; Plan 1 adds a peer `learning-loop-mastra` entry)

**Mastra API references (verified via WebFetch):**
- `https://mastra.ai/en/reference/tools/create-tool` — createTool `id` / `inputSchema` / `execute`
- `https://mastra.ai/en/reference/tools/mcp-server` — MCPServer config + tool registration (verified `id` field is the tool name)
- `@mastra/core` validation pipeline at `packages/core/src/tools/validation.ts` — 8-step `validateToolInput`; `coerceStringifiedJsonValues` is step 5 (retry pass for stringified JSON → array only)

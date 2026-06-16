---
phase: 2
title: "Phase 1 — C5 factory + 4 ported wire-format tests"
status: completed
priority: P1
effort: "~2h"
dependencies: ["phase-0-branch-mastra-install-server-skeleton"]
---

# Phase 2: Phase 1 — C5 factory + 4 ported wire-format tests

## Overview

Ship `tools/learning-loop-mastra/create-loop-tool.js` — the `createLoopTool({ id, description, inputSchema, execute })` factory. The factory wraps `inputSchema` with `z.preprocess()` to reproduce the legacy `coerceParamsToSchema` behavior (1/6 cases passed by raw `createTool`; the factory must pass all 6). Port the 4 legacy wire-format regression tests from `tools/learning-loop-mcp/__tests__/` to `tools/learning-loop-mastra/__tests__/` (5 + 6 + 5 + 4 = 20 tests). Lock the leaf-recursion case (`wire-format-patch-recursion.test.js`) against legacy `MAX_RECURSION_DEPTH = 2`.

This is the **highest-risk phase** of Plan 1. The factory's `coerceShape` recursion must stop at `depth = 1` to match legacy `tool-registry.js:124-134`; the leaf-recursion test fails fast if the bound is wrong. TDD-first: write the ported tests as RED, build the factory until GREEN.

## Context Links

- **Factory spec:** `plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md` §3 (full pseudocode)
- **6 wire-format cases:** `plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md` §2 (PASS/FAIL table)
- **Per-test porting plan:** `plans/reports/research-260616-1605-wire-format-coercion-and-test-porting.md` §4 (per-file change list)
- **Legacy source of truth:** `tools/learning-loop-mcp/tool-registry.js` lines 4, 6-22, 24-46, 58-75, 77-137
- **C5 probe verdict:** `meta-260616T0201Z-plans-reports-productization-260612-1530-master-tracker-md` (1/6 PASS baseline)
- **Plan parent:** `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md`

## Requirements

- **Functional:**
  - `tools/learning-loop-mastra/create-loop-tool.js` exports `createLoopTool({ id, description, inputSchema, execute })` and `coerceParams(args, schema)`.
  - `createLoopTool` returns a `createTool` with `inputSchema` wrapped via `z.preprocess()` (the wrapper is a `ZodEffects`).
  - `coerceParams(args, schema)` reproduces the legacy `coerceParamsToSchema` contract for all 6 wire-format cases (1/6 baseline + 5/6 factory-only).
  - `MAX_RECURSION_DEPTH = 2` (matches legacy `tool-registry.js:4`).
  - `unwrapItem` while-loop bounded to 3 iterations (matches legacy `unwrapItemWrap`).
  - Identity preservation: `coerceParams` returns the original `args` reference when no coercion happened.
  - 4 ported tests pass (20 total): `wire-format-coercion-fix.test.js` (5), `wire-format-top-level-coercion.test.js` (5 stdio + 1 factory-unit), `wire-format-meta-state-optional-fields.test.js` (5), `wire-format-patch-recursion.test.js` (1 stdio + 3 unit).
  - The factory-unit replacement for the legacy `installWireFormatCoercion` guard test (test 2 lines 225-242) asserts `tool.inputSchema._def.typeName === "ZodEffects"`.
- **Non-functional:**
  - The 4 ported tests live in `tools/learning-loop-mastra/__tests__/` (namespace 10).
  - The legacy `tools/learning-loop-mcp/__tests__/wire-format-*.test.js` files are untouched (they still pass against the legacy server). Plan 1 does NOT delete the legacy tests.
  - `tools/learning-loop-mastra/schemas.js` re-exports `metaStateProposeDesignTool` + `metaStatePatchTool` from the legacy package via `#mcp/tools/meta-state-*-tool.js` (single source of truth).
  - The factory does NOT add `appendGateLog` calls (legacy logs are vestigial; tests assert output, not logs).
  - The factory does NOT add an `installWireFormatCoercion` analog (Mastra's validation pipeline handles coercion via the in-band `z.preprocess`).

## Architecture

**Factory shape (per `research-260616-1605-wire-format-coercion-and-test-porting.md` §3.1):**

```js
// tools/learning-loop-mastra/create-loop-tool.js
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_RECURSION_DEPTH = 2;       // matches tool-registry.js:4
const MAX_UNWRAP_ITERATIONS = 3;     // matches unwrapItemWrap while-loop bound
const MAX_TYPE_NAME_UNWRAP = 5;      // matches unwrapTypeName for-loop bound

function unwrapTypeName(fieldSchema) { /* port of tool-registry.js:6-22 */ }
function coerceScalar(value, typeName) { /* port of tool-registry.js:24-46, renamed to avoid zod shadow. Returns original value on no-op (matches legacy coerceValue contract). */ }
function unwrapItem(value, typeName) { /* port of tool-registry.js:58-75, returns { value, unwrapped } */ }

function coerceShape(shape, args, depth = 0) {
  if (!shape || !args || typeof args !== "object") return args;
  const out = { ...args };
  let changed = false;
  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = unwrapTypeName(fieldSchema);
    if (!typeName) continue;

    // 1. Scalar coercion — coerceScalar returns original value on no-op
    //    (matches legacy coerceValue). The `next !== value` check detects changes.
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

**3 internal helpers ported from legacy `tool-registry.js`:**

1. `unwrapTypeName` — peel up to 5 layers of `ZodOptional` / `ZodNullable` / `ZodDefault` / `ZodEffects` / `ZodTransform` / `ZodLazy`. **Required because the factory's own output is `ZodEffects`** — recursive `coerceShape` calls must see through it.
2. `coerceScalar` — `ZodArray` (string→JSON.parse→array), `ZodBoolean` (`"true"`→`true`, `"false"`→`false`), `ZodNumber` (regex `/^-?\d+(\.\d+)?$/` → `parseFloat`; empty string falls through). **Returns the original value on no-op** (matches legacy `coerceValue` contract; the `coerceShape` call site uses `next !== value` to detect actual changes).
3. `unwrapItem` — `{item: X}` envelope strip, type-gated on `ZodArray`/`ZodObject`, bounded to 3 iterations.

**Edge cases locked (per research §3.2):**

- Empty string for `ZodNumber` → stays as `""` (regex rejects; no silent `Number("") === 0`).
- `{item: {item: [...]}}` (double-nested) → single iteration unwraps to inner; 3-iter bound.
- `{item: []}` → `unwrapItem` exits because `[]` has no `.item` key.
- `MAX_RECURSION_DEPTH = 2` → recursion stops at `depth = 1`; deepest call processes `ZodObject` children.
- Identity preservation → `coerceShape` returns original `args` reference when no field changed.

**Schema re-export strategy (per research §6, confidence 80%):**

```js
// tools/learning-loop-mastra/schemas.js
export { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
export { metaStatePatchTool } from "#mcp/tools/meta-state-patch-tool.js";
```

Single source of truth — Phase B's "schema-as-source-of-truth" principle. Hard cut-over to a separate schema boundary deferred to Plan 3.

## Related Code Files

- **Create (6):**
  - `tools/learning-loop-mastra/create-loop-tool.js` (factory, ~120 lines)
  - `tools/learning-loop-mastra/schemas.js` (re-export, ~10 lines)
  - `tools/learning-loop-mastra/__tests__/wire-format-coercion-fix.test.js` (port of legacy, 5 tests, ~70 lines)
  - `tools/learning-loop-mastra/__tests__/wire-format-top-level-coercion.test.js` (port of legacy, 6 tests, ~280 lines; spawns mastra server instead of legacy)
  - `tools/learning-loop-mastra/__tests__/wire-format-meta-state-optional-fields.test.js` (port of legacy, 5 tests, ~65 lines)
  - `tools/learning-loop-mastra/__tests__/wire-format-patch-recursion.test.js` (port of legacy, 4 tests, ~220 lines; spawns mastra server)
- **No changes to:**
  - `tools/learning-loop-mcp/tool-registry.js` (legacy stays in place; factory does not depend on it)
  - `tools/learning-loop-mcp/__tests__/wire-format-*.test.js` (legacy tests untouched; still pass against legacy server)
  - `tools/learning-loop-mcp/server.js` (no change)
  - `tools/learning-loop-mastra/server.js` (still the stub from Phase 0; the 4 stdio tests spawn it)

## Implementation Steps

**Step 1 — Port Test 3 first (the schema-only test, ~10 min)**

Test 3 (`wire-format-meta-state-optional-fields.test.js`) is the easiest port — 5 tests, no transport, no factory dependency. Confirms the test glob in namespace 10 is wired correctly.

1. Copy `tools/learning-loop-mcp/__tests__/wire-format-meta-state-optional-fields.test.js` to `tools/learning-loop-mastra/__tests__/`.
2. Drop the unused `installWireFormatCoercion` import (vestigial reference in prose comment only).
3. Run `node --test tools/learning-loop-mastra/__tests__/wire-format-meta-state-optional-fields.test.js` — expect 5/5 pass (these tests use `zod.safeParse` directly, decoupled from transport).
4. Run `pnpm test` — expect 5 additional pass in namespace 10; 9 legacy namespaces still pass.

**Step 2 — Build factory skeleton + port Test 1 (TDD, ~30 min)**

Test 1 (`wire-format-coercion-fix.test.js`) exercises the factory's `coerceParams` helper directly. RED → GREEN:

1. Create `tools/learning-loop-mastra/create-loop-tool.js` with `coerceParams` (the helper, not the factory yet). Stub `unwrapTypeName` + `coerceScalar` + `unwrapItem` to return `typeName = null` (everything skipped). RED expected.
2. Copy legacy test 1 to `tools/learning-loop-mastra/__tests__/wire-format-coercion-fix.test.js`. Replace `import { coerceParamsToSchema } from "../tool-registry.js"` with `import { coerceParams } from "../create-loop-tool.js"`. Run — expect 5/5 RED (no coercion yet).
3. GREEN: port `unwrapTypeName` (faithful copy of `tool-registry.js:6-22`).
4. GREEN: port `coerceScalar` (faithful copy of `tool-registry.js:24-46`). Rename to `coerceScalar` to avoid zod method shadowing. The function returns the original value on no-op (e.g., empty string for `ZodNumber` returns `""`, not `undefined`); the `coerceShape` call site uses `next !== value` to detect actual changes. Matches the legacy contract exactly (see F2 in `reports/from-code-reviewer-to-planner-phase-c-plan-1-red-team-report.md`).
5. GREEN: port `unwrapItem` (faithful copy of `tool-registry.js:58-75`, returning `{ value, unwrapped }`).
6. GREEN: implement `coerceShape` per the spec above. Re-run — expect 5/5 GREEN.
7. Run `pnpm test` — expect 5 + 5 = 10 pass in namespace 10; 9 legacy still pass.

**Step 3 — Build the `createLoopTool` factory + port Test 2 (TDD, ~45 min)**

Test 2 (`wire-format-top-level-coercion.test.js`) is stdio transport. 5 stdio + 1 factory-unit replacement.

1. Add `wrapSchema` + `createLoopTool` to `create-loop-tool.js`. The factory wraps `inputSchema` with `z.preprocess((v) => coerceShape(shape, v ?? {}), inputSchema)`.
2. Copy legacy test 2 to `tools/learning-loop-mastra/__tests__/wire-format-top-level-coercion.test.js`. Change `serverEntry` to `join(projectRoot, "tools/learning-loop-mastra/server.js")`.
3. RED: the 5 stdio tests will fail because `tools/learning-loop-mastra/server.js` is still the stub from Phase 0. **Stub the stub**: temporarily replace the server.js with a version that uses `createLoopTool` to register a single `meta_state_propose_design` tool (for stdio integration only). RED expected on the first 5 stdio tests because the factory isn't wired into the server yet.
4. GREEN: wire `createLoopTool` into `server.js` for the single `meta_state_propose_design` tool (data-driven loop from a tiny `manifest.json`).
5. Re-run — expect 5 stdio tests GREEN.
6. Replace the legacy `installWireFormatCoercion` guard test (legacy lines 225-242) with a factory-unit test:
   ```js
   test("createLoopTool wraps inputSchema with z.preprocess", () => {
     const tool = createLoopTool({ id: "test", description: "t",
       inputSchema: z.object({ x: z.boolean() }), execute: async () => ({}) });
     assert.equal(tool.inputSchema._def.typeName, "ZodEffects");
   });
   ```
7. Run `pnpm test` — expect 5 + 6 + 5 = 16 pass in namespace 10; 9 legacy still pass.

**Step 4 — Port Test 4 (the leaf-recursion case, TDD, ~30 min)**

Test 4 (`wire-format-patch-recursion.test.js`) locks `MAX_RECURSION_DEPTH = 2`. The stdio test (`meta_state_patch accepts flat patch object via stdio`) implicitly verifies the recursion contract by sending a flat patch (no `{item: {...}}` wrap) and confirming it lands in the registry correctly.

1. Copy legacy test 4 to `tools/learning-loop-mastra/__tests__/wire-format-patch-recursion.test.js`. Change `serverEntry` to mastra server. Change the legacy tool import on line 15 (`metaStateProposeDesignTool`) to import from `../schemas.js` (re-export).
2. Add `meta_state_patch` to the temporary `server.js` stub (for stdio test only). Re-run the stdio test — expect GREEN if factory handles `patch` (a `ZodObject` child of `meta_state_patch`) correctly.
3. Run the 3 unit tests (lines 169-180, 185-199, 203-218 of legacy) — expect GREEN.
4. **Critical:** verify the leaf-recursion case at legacy line 169-180. The test sends `{ addresses: { item: { item: ["x", "y"] } } }` and expects `{ addresses: ["x", "y"] }`. The factory's `unwrapItem` (3-iter bound) must handle this; the `coerceShape` recursion at `depth = 1` must NOT fire because the field is `ZodArray`, not `ZodObject`.
5. Run `pnpm test` — expect 5 + 6 + 5 + 4 = 20 pass in namespace 10; 9 legacy still pass.

**Step 5 — **KEEP** the 2-tool server.js stub; do NOT revert to Phase 0 single-tool version (~0 min)**

**Per F3 in `reports/from-code-reviewer-to-planner-phase-c-plan-1-red-team-report.md`** (operator decision 2026-06-16): Step 3-4 added `meta_state_propose_design` + `meta_state_patch` to the mastra server.js for stdio test isolation. The leaf-recursion stdio test (`wire-format-patch-recursion.test.js` line 126) is the contract that locks `MAX_RECURSION_DEPTH = 2` for nested object recursion. Deferring this test to Phase 2 conflates the factory's recursion correctness with the data-driven register loop's correctness. **Keep the 2-tool stub through Phase 1's commit** so all 20 ported tests pass at Phase 1's checkpoint. Phase 2 expands the stub to all 29 tools.

1. **Do NOT revert** `tools/learning-loop-mastra/server.js`. The current state after Step 3-4 is: `mastra_meta_state_propose_design` + `mastra_meta_state_patch` registered (with `mastra_` prefix and `createLoopTool` wrapping).
2. Re-run `pnpm test` — expect 5 + 6 + 5 + 4 = 20 pass in namespace 10; 9 legacy still pass. **All 20 GREEN at Phase 1's commit.**
3. **Update plan gate:** Phase 1's gate is "all 20 ported tests GREEN at Phase 1's commit." The full 55-test namespace 10 is the Phase 4 gate (Phase 2 adds 29 parity contract tests; Phase 3 adds 6 C3 static-config tests).

**Step 6 — Commit (~5 min)**
1. `git add tools/learning-loop-mastra/{create-loop-tool.js,schemas.js,__tests__/}`
2. Commit message: `feat(mastra): ship createLoopTool factory + 4 ported wire-format tests (Phase C Plan 1 Phase 1 / C5)`.
3. Push branch (single stacked PR opens at Phase 4).

## Success Criteria

- [ ] `tools/learning-loop-mastra/create-loop-tool.js` exists with `createLoopTool` + `coerceParams` exports + 3 internal helpers (`unwrapTypeName`, `coerceScalar`, `unwrapItem`).
- [ ] `tools/learning-loop-mastra/schemas.js` re-exports `metaStateProposeDesignTool` + `metaStatePatchTool` from the legacy package.
- [ ] 4 ported test files exist in `tools/learning-loop-mastra/__tests__/`.
- [ ] 9 unit + 5 schema-level + 6 stdio tests pass in namespace 10 (all 20 ported tests GREEN at Phase 1's commit; per F3 in red-team report, the 2-tool stub is kept through Phase 1).
- [ ] 9 legacy test namespaces still pass.
- [ ] The leaf-recursion test (`wire-format-patch-recursion.test.js` line 169-180 of the legacy file) passes against the factory — locks `MAX_RECURSION_DEPTH = 2`.
- [ ] Commit on branch; no PR opened yet.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `MAX_RECURSION_DEPTH = 2` is wrong (research 95% confidence it's correct) | medium | The leaf-recursion test fails fast. If the bound is wrong, the test reveals whether it should be 1, 2, or 3. |
| `unwrapTypeName` doesn't peel `ZodEffects` correctly (factory's own output is `ZodEffects`) | medium | Manual inspection of `_def.innerType` for the `ZodEffects` case. Test 3 (schema-level) doesn't exercise this; test 4 (real `meta_state_propose_design.schema`) does. |
| `coerceScalar` returns the original value on no-op (legacy contract); the `coerceShape` call site uses `next !== value` to detect changes | low | The legacy `coerceValue` does the same. Faithful port. Per F2 in red-team report, the factory matches the legacy contract exactly. |
| `tools/list` schema-preservation test (legacy line 245-274) fails because Mastra returns `inputSchema` differently | low | The test is in test 2's stdio block; the stdio tests are RED until Phase 2. Phase 2 may need to adjust the assertion. |
| The factory's `z.preprocess` wrapper itself is `ZodEffects`; `unwrapTypeName` must peel it for nested-field coercion | medium | The 6th wire-format case (numeric + empty for `meta_state_patch` etc.) implicitly exercises this. If the peel is wrong, `coerceShape` skips the field. |

## Next Steps

- **After Phase 1:** Phase 2 (C2) starts. The data-driven register loop in `tools/learning-loop-mastra/server.js` will replace the 2-tool stub from Phase 1. All 29 tools register via the loop; the 29 per-tool parity contract tests in `parity-schema-shape.test.js` flip GREEN.
- **Operator checkpoint:** at Phase 1 commit, no checkpoint needed. The leaf-recursion test is the contract; if it passes, the factory is correct.

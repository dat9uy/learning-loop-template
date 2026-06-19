---
phase: 2
title: "create-loop-workflow factory"
status: completed
priority: P1
effort: "1h"
dependencies: ["1"]
---

# Phase 2: create-loop-workflow factory

## Overview

Ship `tools/learning-loop-mastra/create-loop-workflow.js` — the factory seam for the loop's workflow wrappers, mirroring `createLoopTool`'s parity-shim + adapter pattern but for `createWorkflow` instead of `createTool`. **TDD-first: 4 invariant tests RED, then GREEN.** The factory is the load-bearing primitive Phases 3-5 build on.

## Why a separate factory

The existing `createLoopTool` (`tools/learning-loop-mastra/create-loop-tool.js`) wraps Zod schemas with a parity JSON Schema view (strips `z.preprocess` wrappers) and adapts legacy handler output to Mastra's contract. The new factory needs the same parity treatment for `createWorkflow`'s `inputSchema` / `outputSchema` / `stateSchema`, plus the legacy handler adapter reused unchanged.

A separate factory file (not extending `create-loop-tool.js`) keeps the seams distinct: `createTool` and `createWorkflow` are different Mastra primitives with different MCPServer registration paths. Mixing them in one factory couples two unrelated concerns.

## Requirements

- **Functional:** factory exports `createLoopWorkflow({ id, description, inputSchema, outputSchema, stateSchema?, steps })` returning a `createWorkflow(...).commit()` result with `.createRun()`. `description` is required (MCPServer throws on empty). `stateSchema` is optional. Linear `.then()` chain over `steps[]`. Each step is `{ id, description?, inputSchema, outputSchema, handler }`; `handler` is the legacy async function returning the output object.
- **Non-functional:** factory does NOT spawn servers; factory does NOT do I/O; factory does NOT throw on parity diffs (callers decide). Mirrors `createLoopTool`'s pure-function shape.

## Architecture

```
create-loop-workflow.js
├── normalizeSchema(schema)         # mirrors createLoopTool's normalizeInputSchema
│     ├── if Zod instance → return as-is
│     └── if plain shape object → z.object(shape)
├── attachParityJSONSchema(schema)  # mirrors createLoopTool's attachParityJSONSchema
│     ├── guard: schema._zod must exist (return schema if not)
│     ├── paritySchema = buildParitySchema(schema)
│     ├── parityJSONSchema = z.toJSONSchema(paritySchema, { target: "draft-7", io: "input" })
│     └── schema._zod.toJSONSchema = () => parityJSONSchema
├── buildStep({ id, description, inputSchema, outputSchema, handler })
│     ├── normalizeInput = attachParityJSONSchema(normalizeSchema(inputSchema))
│     ├── normalizeOutput = outputSchema ? attachParityJSONSchema(normalizeSchema(outputSchema)) : undefined
│     └── createStep({ id, description, inputSchema: normalizedInput, outputSchema: normalizedOutput,
│                       execute: adaptLegacyHandler({ handler }) })
└── createLoopWorkflow({ id, description, inputSchema, outputSchema, stateSchema?, steps })
      ├── if !description → throw (MCPServer hard requirement)
      ├── normalizeInput, normalizeOutput, normalizeState
      ├── builder = createWorkflow({ id, description, inputSchema: normInput, outputSchema: normOutput,
      │                              ...(normState ? { stateSchema: normState } : {}) })
      ├── for each step in steps: builder = builder.then(buildStep(step))
      └── return builder.commit()
```

**Reused infrastructure (no modification):**
- `tools/learning-loop-mastra/schema-parity.js` → `buildParitySchema` (existing parity-shim)
- `tools/learning-loop-mastra/legacy-handler-adapter.js` → `adaptLegacyHandler` (existing adapter)
- `zod` 4.4.3 → `z.toJSONSchema` (existing pin)
- `@mastra/core` 1.42.0 → `createWorkflow`, `createStep` (pinned)

## Related Code Files

- **Create:** `tools/learning-loop-mastra/create-loop-workflow.js` (~80 lines; mirrors `create-loop-tool.js:50-58` shape)
- **Create:** `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (4 invariant tests; no server spawn)

## Implementation Steps

1. **TDD: write 5 invariant tests first (RED).** Use real Zod schemas (no hand-rolled approximations):
   - Test 1: `createLoopWorkflow` returns an object with `.createRun` function (post-`.commit()`).
   - Test 2: `createLoopWorkflow` throws on empty `description` (regex match `/description is required/`).
   - Test 3: `createLoopWorkflow` with 1 step produces a workflow that runs successfully via `.createRun().start()` and returns the handler's output.
   - Test 4: `createLoopWorkflow` with 2 steps produces a 2-step chain; the first step's output schema matches the second step's input schema (verifies linear `.then()` chain wiring).
   - Test 5: `createLoopWorkflow` with `stateSchema` accepts the state param, persists `setState` mutations across `run.start({ inputData, initialState })`, and the final `result.state` reflects the initial state. **This is the load-bearing test for Q1 future restructuring** (multi-step state accumulation; not used by Plan 1's 8 wrappers but the factory must support it for Plan 3 agents).

2. **Run tests, confirm 5 RED.** `node --test tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` → 0/5 pass.

3. **Implement `create-loop-workflow.js`** per the architecture sketch above (~80 lines):
   ```js
   import { createWorkflow, createStep } from "@mastra/core/workflows";
   import { z } from "zod";
   import { buildParitySchema } from "./schema-parity.js";
   import { adaptLegacyHandler } from "./legacy-handler-adapter.js";

   function normalizeSchema(schema) {
     if (schema && typeof schema === "object" && (schema._def || schema.def) && typeof schema.parse === "function") {
       return schema;
     }
     return z.object(schema);
   }

   function attachParityJSONSchema(schema) {
     if (!schema || typeof schema !== "object" || !schema._zod) return schema;
     const paritySchema = buildParitySchema(schema);
     const parityJSONSchema = z.toJSONSchema(paritySchema, { target: "draft-7", io: "input" });
     schema._zod.toJSONSchema = () => parityJSONSchema;
     return schema;
   }

   function buildStep({ id, description, inputSchema, outputSchema, handler }) {
     const normalizedInput = attachParityJSONSchema(normalizeSchema(inputSchema));
     const normalizedOutput = outputSchema
       ? attachParityJSONSchema(normalizeSchema(outputSchema))
       : undefined;
     return createStep({
       id, description,
       inputSchema: normalizedInput,
       outputSchema: normalizedOutput,
       execute: adaptLegacyHandler({ handler }),
     });
   }

   export function createLoopWorkflow({ id, description, inputSchema, outputSchema, stateSchema, steps }) {
     if (!description || description.trim() === "") {
       throw new Error(`createLoopWorkflow: description is required for "${id}" (MCPServer throws on empty workflow description).`);
     }
     const normalizedInput = attachParityJSONSchema(normalizeSchema(inputSchema));
     const normalizedOutput = outputSchema
       ? attachParityJSONSchema(normalizeSchema(outputSchema))
       : undefined;
     const normalizedState = stateSchema
       ? attachParityJSONSchema(normalizeSchema(stateSchema))
       : undefined;
     const builtSteps = steps.map(buildStep);
     const builder = createWorkflow({
       id, description,
       inputSchema: normalizedInput,
       outputSchema: normalizedOutput,
       ...(normalizedState ? { stateSchema: normalizedState } : {}),
     });
     let result = builder;
     for (const step of builtSteps) {
       result = result.then(step);
     }
     return result.commit();
   }
   ```

4. **Run tests, confirm 5 GREEN.** 5/5 pass.

5. **Refactor if needed** (YAGNI; no features the factory doesn't need).

## Success Criteria

- [x] 5 invariant tests pass
- [x] `create-loop-workflow.js` exports `createLoopWorkflow`
- [x] Factory returns a workflow with `.createRun()` (post-`.commit()`)
- [x] Factory throws on empty `description`
- [x] Factory wires linear `.then()` chain via `steps[]`
- [x] `z.toJSONSchema()` parity view is attached to inputSchema (same pattern as `createLoopTool`)
- [x] No server spawn in the factory module
- [x] No silent fallbacks; empty description throws with file:line traceback

## Risk Assessment

- **Risk:** `createWorkflow`'s config-object field set differs from docs (researcher B verified against `mastra.ai/reference/workflows/workflow` 2026-06-18; if 1.42.0 ships a different shape, the test fails). **Mitigation:** TDD-first surfaces the shape mismatch at test 1 (factory call shape) or test 4 (chain wiring).
- **Risk:** `createStep`'s `execute` adapter signature differs from `adaptLegacyHandler`'s contract. **Mitigation:** test 4 (chain wiring) invokes the workflow via `.createRun().start()` and asserts the output matches `handler` return — if the adapter breaks, the test fails with a precise diff.
- **Risk:** `stateSchema` field, when present, is not a `StandardJSONSchemaV1` (Zod instance required). **Mitigation:** `normalizeSchema` checks `_def || def + parse` — same heuristic as `createLoopTool`. Future-proofing via a dedicated check is YAGNI.

## Security Considerations

None. Pure-function factory; no I/O, no privileged operations. Same security profile as `createLoopTool`.

## Next Steps

Phase 3 writes the 8 `createLoopWorkflow({...})` call sites (one per moved workflow file). Each call site is a small adapter that maps the legacy handler signature to the factory's `steps[]` shape. Phase 5's parity harness exercises the factory + call sites via MCP.
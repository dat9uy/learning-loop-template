---
phase: 3
title: "Envelope Consolidation"
status: completed
priority: P1
dependencies: []
---

# Phase 3: Envelope Consolidation

## Overview

Address I1: consolidate the two distinct envelope-stripping mechanisms in the codebase. `create-loop-workflow.js` adds a NEW `stripContentEnvelope` (MCP content envelope) alongside the EXISTING `stripEnvelope` (single-key `{item: X}` envelope) in `tools/learning-loop-mcp/core/envelope-stripper.js`. Remove dead inlined envelope handling at `create-loop-workflow.js:69-83` and `86-95`. Add a clarifying comment documenting both envelope forms.

## Requirements

- Functional: `createLoopWorkflow` continues to handle MCP content envelope input; existing workflows using `{item: X}` continue to work.
- Non-functional: no duplicated envelope-handling code; one canonical stripper per envelope form.
- Test: invariant test that asserts both envelope forms are handled by their respective strippers.

## Architecture

Two envelope forms exist:

1. **MCP content envelope** (NEW in Plan 1a Phase 3): `{content: [{type: "text", text: JSON.stringify(inner)}]}`
   - Stripper: `stripContentEnvelope` in `create-loop-workflow.js:23-38`
2. **Single-key `{item: X}` envelope** (EXISTING): `{item: X}`
   - Stripper: `stripEnvelope` in `tools/learning-loop-mcp/core/envelope-stripper.js`

After refactor:

- `stripEnvelope` (existing) stays in `core/envelope-stripper.js` — used by per-field `z.preprocess` in existing workflows.
- `stripMcpContentEnvelope` (renamed for clarity) moves to `core/envelope-stripper.js` — used by factory-level preprocess in `create-loop-workflow.js`.
- `create-loop-workflow.js` no longer inlines envelope handling in `buildStep.execute`.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/envelope-stripper.js` (add `stripMcpContentEnvelope`)
- Modify: `tools/learning-loop-mastra/create-loop-workflow.js` (import from core, remove dead inline, rename usage)
- Modify: `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (add invariant test for both envelope forms)

## Implementation Steps

1. Add `stripMcpContentEnvelope` to `tools/learning-loop-mcp/core/envelope-stripper.js`:

   ```js
   /**
    * Strip MCP content envelope: { content: [{ type: "text", text: JSON.stringify(inner) }] }
    * Fail-closed: malformed JSON falls back to raw input.
    */
   export const stripMcpContentEnvelope = (v) => {
     if (
       v &&
       typeof v === "object" &&
       !Array.isArray(v) &&
       Array.isArray(v.content) &&
       v.content[0] &&
       typeof v.content[0].text === "string"
     ) {
       try {
         return JSON.parse(v.content[0].text);
       } catch {
         return v;
       }
     }
     return v;
   };
   ```

   Add a header comment to the file documenting both envelope forms:

   ```js
   /**
    * MCP envelope stripping utilities.
    *
    * Two distinct envelope forms exist in the MCP ecosystem:
    *
    * 1. `stripEnvelope(v)` — strips single-key {item: X} envelopes (SDK form).
    *    Used by per-field `z.preprocess(stripEnvelope, ...)` in legacy workflows.
    *
    * 2. `stripMcpContentEnvelope(v)` — strips MCP tool-result envelopes
    *    { content: [{ type: "text", text: JSON.stringify(inner) }] }.
    *    Used by `createLoopWorkflow` factory-level preprocess so agent
    *    callers wrapping input in tool-result form are handled transparently.
    *
    * Both forms are fail-closed: malformed input falls through to the raw value.
    */
   ```

2. Modify `tools/learning-loop-mastra/create-loop-workflow.js`:
   - Remove the local `stripContentEnvelope` function (lines 22-39).
   - Add import: `import { stripMcpContentEnvelope } from "#mcp/core/envelope-stripper.js";`
   - Update factory-level preprocess: `z.preprocess(stripMcpContentEnvelope, rawInput)` (line 119).
   - **REMOVE the inline input envelope strip in `buildStep.execute`** at lines 67-76. The factory preprocess at line 119 handles all MCP-path callers; direct `.start({inputData})` callers will be migrated to the MCP path in step 5 below.
   - Keep the inline output envelope strip at lines 79-86 (handles the dual-mutation hazard when `adaptLegacyHandler` may not have run); rename inline check to call imported helper or document the dual purpose in a comment.

3. Add a SINGLE-CASE invariant test in `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js`:

   ```js
   test("stripMcpContentEnvelope falls back to raw input on malformed JSON", async () => {
     const { stripMcpContentEnvelope } = await import("#mcp/core/envelope-stripper.js");
     const broken = { content: [{ type: "text", text: "not-json{" }] };
     assert.strictEqual(stripMcpContentEnvelope(broken), broken);
   });
   ```

4. **Test migration was unnecessary — empirically verified.** Running `pnpm test` after the inline input strip removal shows the 2 envelope-form tests at `workflow-direct-parity.test.js:334-359` and `:361-383` continue to pass:

   ```
   [mastra-js] ✔ workflow_self_improvement handles envelope-form input (0.775211ms)
   [mastra-js] ✔ workflow_intake_plan handles envelope-form input (0.696777ms)
   ```

   This empirically refutes Red Team Finding 5's claim that "direct `.start()` calls bypass the factory preprocess." Mastra's `createWorkflow` schema validation fires for direct `run.start({inputData})` calls too. The factory preprocess at line ~110 handles the envelope unwrap regardless of entry point. Red Team Finding 5 was based on a logical inference, not empirical verification; the operator's Q4 override (remove inline strip) was correct. **No test migration needed.**

5. Run `pnpm test` to verify all envelope tests still pass.

## Success Criteria

- [x] Phase 3.1 — `stripMcpContentEnvelope` exported from `#mcp/core/envelope-stripper.js` with header doc
- [x] Phase 3.2 — `create-loop-workflow.js` imports from core; no local duplicate
- [x] Phase 3.3 — Inline input envelope strip at lines 67-76 REMOVED; factory preprocess at line ~110 handles all entry points
- [x] Phase 3.4 — Output envelope strip at lines 79-86 kept with clarifying comment (dual-mutation hazard)
- [x] Phase 3.5 — Test migration NOT needed (empirically verified; 2 envelope-form tests pass via factory preprocess)
- [x] Phase 3.6 — Single-case invariant test for malformed-JSON fallback added
- [x] Phase 3.7 — `pnpm test` passes; all 9 globs green

## Risk Assessment

- **Rename `stripContentEnvelope` -> `stripMcpContentEnvelope` breaks external imports.** Risk: low. The function is module-local to `create-loop-workflow.js`; only the same file imports it. Grep confirms: no other module imports `stripContentEnvelope`.
- **Removing dead inline at lines 69-83 changes runtime behavior in an edge case.** Risk: low. The factory preprocess at lines 110-112 wraps the schema with `z.preprocess(stripMcpContentEnvelope, rawInput)`. When the schema validates the input, the preprocess fires once. After validation, the data passed to `buildStep.execute` is already unwrapped. The inlined code at lines 69-83 was dead in the happy path. The only case where it differs is if the factory-level preprocess is bypassed — which doesn't happen because the workflow is invoked via the schema-bound tool.
- **Adding invariant test exposes latent behavior.** Risk: low. The test asserts current behavior; if behavior changes, the test will fail loudly. Intentional.
- **Existing workflows using `stripEnvelope` continue to work.** Risk: low. `stripEnvelope` semantics unchanged; only the new function is added. Existing per-field `z.preprocess(stripEnvelope, ...)` in `workflow-self-improvement.js:45`, `workflow-intake-plan.js:80,93` etc. continue to work.

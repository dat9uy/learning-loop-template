---
phase: 2
title: "Unwrap contract — shared helper + 6 handler modules (TDD)"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 2: Unwrap contract — shared helper + 6 handler modules (TDD)

## Overview

Build the 6 plain handler modules and the shared U-Q1 unwrap helper. The pure logic moves OUT of each `mastra/workflows/workflow-<x>.js` and INTO a new `tools/handlers/workflow-<x>-tool.js` (the same shape as the 3 `mastra_workflow_*` helpers). A parity test (handler output == workflow oracle) is written FIRST and kept green throughout, so the unwrap is provably behavior-preserving. The workflow files are NOT deleted here (Phase 3 owns the cutover); Phase 2 leaves both surfaces present with the parity test guaranteeing equivalence.

## Requirements

- Functional: a shared `wrapWorkflowInputSchema(schema)` helper that returns `z.preprocess(stripMcpContentEnvelope, normalizeInputSchema(schema))`; all 6 handler modules use it for their `schema`; each handler's `handler(args)` returns the same object the workflow step returned.
- Non-functional: zero per-tool duplication of the envelope strip; no import of `@mastra/core/workflows` from any handler module; the parity test is the safety net and must be RED before any handler is written (it asserts the future unwrapped behavior against the current workflow oracle).

## Architecture

- New: `tools/learning-loop-mastra/core/workflow-input-schema.js` — `wrapWorkflowInputSchema(schema)` = `z.preprocess(stripMcpContentEnvelope, normalizeInputSchema(schema))`. Re-exports `stripMcpContentEnvelope` from `core/envelope-stripper.js` and `normalizeInputSchema` from `core/schema-normalize.js`. Transport-agnostic (imports only zod + the two existing core helpers). This is the U-Q1 unwrap contract for the TOP-LEVEL (content) envelope. **Per-field SDK `{item:[...]}` strips (e.g. `self_improvement.proposed_changes`'s `z.preprocess(stripEnvelope, ...)`) are NOT covered by the helper** — they are copied verbatim into each handler's schema (see step 4). The U-Q1 contract is therefore DUAL: top-level `stripMcpContentEnvelope` via the shared helper + per-field `stripEnvelope` preserved verbatim per handler.
- New (6): `tools/learning-loop-mastra/tools/handlers/workflow-<x>-tool.js` for classify_prompt, prepare_runtime_request, self_improvement, intentional_skip, report_phase_status, runtime_probe. Each exports `<camelCase>Tool` = `{ name: "workflow_<x>", description, schema: wrapWorkflowInputSchema({...zod shape...}), handler }`. The `handler` body is the pure function copied verbatim from the workflow file's step `handler`.
- Oracle fixtures: `__tests__/fixtures/workflow-oracles/<x>.json` — captured in Phase 1 probe 3 (schema JSON + behavior snapshots for BOTH envelope forms). Phase 2's parity test READS these fixtures (does NOT import the live workflow objects), so Phase 3 can delete the workflow files without breaking the oracle.
- Parity: `__tests__/workflow-unwrap-parity.test.js` — for each of the 6, reads the Phase-1 oracle fixture AND imports the handler module, asserts: (a) **schema parity** — `z.toJSONSchema(handler.schema,...)` deep-equals the fixture's schema oracle (model-visible schema parity); (b) **behavior parity, BOTH envelope forms** — `handler.handler(args)` deep-equals the fixture's behavior oracle for plain input, `{content:[...]}` content-envelope input, AND (for `self_improvement`) `{item:[...]}` SDK-envelope input on `proposed_changes`; (c) **outputSchema return-shape parity** — `handler.handler(args)` return shape deep-equals the workflow step's declared `outputSchema` shape (locks the output contract as a test invariant, since `createLoopTool` carries no `outputSchema` and Mastra step-output validation is dropped on unwrap); (d) **OUTPUT-envelope strip** — a handler returning `{content:[{type:"text", text:JSON.stringify(<result>)}]}` (legacy form) produces the same final output on both MCP and CLI paths (both strip via `adaptLegacyHandler`).

## Related Code Files

- Create: `tools/learning-loop-mastra/core/workflow-input-schema.js`
- Create: `tools/learning-loop-mastra/tools/handlers/workflow-classify-prompt-tool.js` (+ 5 siblings)
- Create: `tools/learning-loop-mastra/__tests__/workflow-unwrap-parity.test.js`
- Modify: (none in Phase 2 — the workflow files stay until Phase 3)
- Delete: (none in Phase 2)

## Implementation Steps

1. **TDD — write the parity test FIRST (RED).** `__tests__/workflow-unwrap-parity.test.js`: for each of the 6, READ the Phase-1 oracle fixture (`__tests__/fixtures/workflow-oracles/<x>.json` — schema + behavior for both envelope forms) and import the not-yet-created handler module (will fail to import → RED). The test asserts schema parity + behavior parity (both envelope forms) + outputSchema return-shape parity + OUTPUT-envelope strip (per Architecture). Do NOT import the live workflow objects — the fixtures are the oracle, so Phase 3 can delete the workflow files without breaking this test.
2. **Ship the shared helper.** `core/workflow-input-schema.js` exports `wrapWorkflowInputSchema`. Unit test it directly: `wrapWorkflowInputSchema({prompt: z.string()})` parses `{prompt:"x"}` AND `{content:[{type:"text",text:JSON.stringify({prompt:"x"})}]}` to `{prompt:"x"}`; `z.toJSONSchema(...)` renders the plain object schema (content-envelope invisible). This is the U-Q1 TOP-LEVEL contract locked by a test. NOTE: the helper does NOT cover the per-field SDK `{item:[...]}` strip — that is copied verbatim per handler (step 4).
3. **Unwrap `workflow_classify_prompt` (first, simplest).** Create `tools/handlers/workflow-classify-prompt-tool.js`: copy the `CATEGORIES`/`KEYWORDS`/`TOOL_MAP` consts + the `classify` function verbatim; export `workflowClassifyPromptTool = { name: "workflow_classify_prompt", description: <same>, schema: wrapWorkflowInputSchema({ prompt: z.string().describe(...) }), handler: classify }`. Run the parity test for this one tool → GREEN.
4. **Unwrap the other 5 — preserve per-field `stripEnvelope` verbatim.** Repeat step 3 for prepare_runtime_request, intentional_skip, report_phase_status, runtime_probe (plain schemas). For **`self_improvement`** specifically: its `proposed_changes` field uses a PER-FIELD `z.preprocess(stripEnvelope, z.array(z.string())).optional()` (the SDK `{item:[...]}` form, DISTINCT from the helper's `stripMcpContentEnvelope`). Copy that `z.preprocess(stripEnvelope, ...)` wrapper VERBATIM into the handler's schema — do NOT "normalize" it to a plain `z.array(z.string())` (the helper's top-level strip does NOT cover the `{item:X}` form, and `buildParitySchema` unwraps preprocess so schema parity alone would not catch the drop). Import `stripEnvelope` from `core/envelope-stripper.js` in the handler module. The Phase-2 parity test's `{item:[...]}` case (step 1) is the guardrail that catches a dropped per-field strip. Run the full parity test → GREEN for all 6.
5. **Verify no `@mastra/core` import in handlers.** `grep -n "@mastra" tools/handlers/workflow-*-tool.js` for the 6 — assert zero hits (the handlers are transport-agnostic; only the shared helper + zod are imported).
6. **Leave the workflow files in place.** Do NOT delete `mastra/workflows/workflow-<x>.js` or edit `workflows-manifest.json` — Phase 3 owns the cutover. The parity test still imports the workflow objects as the oracle; both surfaces coexist, provably equivalent.

## Success Criteria

- [ ] `core/workflow-input-schema.js#wrapWorkflowInputSchema` shipped + unit-tested (top-level content-envelope strip on plain AND `{content:[...]}` input; JSON Schema renders the plain object; documented that per-field `{item:[...]}` strips are NOT covered).
- [ ] 6 `tools/handlers/workflow-<x>-tool.js` modules created, each exporting a `<camelCase>Tool` with `schema: wrapWorkflowInputSchema(...)` and the pure `handler`; `self_improvement` preserves its per-field `z.preprocess(stripEnvelope, ...)` on `proposed_changes` verbatim; no `@mastra` import in any.
- [ ] `workflow-unwrap-parity.test.js` GREEN for all 6, reading the Phase-1 oracle fixtures (NOT importing live workflows): schema parity + behavior parity on plain AND `{content:[...]}` AND (for `self_improvement`) `{item:[...]}` input + outputSchema return-shape parity + OUTPUT-envelope strip on both MCP/CLI paths.
- [ ] `pnpm test` green (parity test + existing workflow tests; the workflow files still exist and still pass — they are deleted in Phase 3 after the fixtures are the sole oracle).

## Risk Assessment

- **Behavior drift between handler and workflow.** Copying the pure function could introduce a typo. Mitigation: the parity test runs the SAME inputs through both and deep-equals; copy is verbatim with a diff check at review.
- **Schema-description loss.** The workflow's `inputSchema` fields carry `.describe(...)` strings the model sees; if the handler's schema drops them, the model-visible contract changes. Mitigation: copy the full zod shape INCLUDING `.describe(...)` calls; the parity test asserts the JSON Schema (which includes descriptions) deep-equals the oracle.
- **`stripMcpContentEnvelope` no-op on CLI input.** The CLI passes plain JSON (no envelope); the strip must be a no-op there. Mitigation: `wrapWorkflowInputSchema`'s unit test asserts plain input passes through unchanged; the parity test asserts the handler works on plain input (the CLI form).
- **Per-field `stripEnvelope` drop (the dual-strip gap, red-team High).** `self_improvement.proposed_changes` uses a per-field `z.preprocess(stripEnvelope, ...)` for the SDK `{item:[...]}` form, DISTINCT from the helper's top-level `stripMcpContentEnvelope`. `buildParitySchema` unwraps preprocess, so schema parity is blind to a dropped `stripEnvelope`. Mitigation: step 4 explicitly instructs copying the per-field `stripEnvelope` verbatim; the parity test's `{item:[...]}` behavior case (step 1) is the guardrail that catches a drop on the MCP path for non-opted-out runtimes.
- **`outputSchema` validation loss (red-team Low).** `createLoopTool` takes no `outputSchema`; the unwrapped handler shape carries none, so Mastra's step-output validation is dropped (no current behavior impact — handlers are pure — but defense-in-depth lost). Mitigation: the parity test asserts the handler's return shape deep-equals the workflow step's declared `outputSchema` shape, locking the output contract as a test invariant. A future `createLoopTool` extension to accept `outputSchema` is noted as a follow-up, out of scope here.

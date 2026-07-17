---
phase: 2
title: "Model-visible schema rejects empty patch"
status: todo
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Model-visible schema rejects empty patch

## Overview

Make the model-visible (`tools/list`) JSON schema for `mastra_meta_state_patch.patch` declare
`minProperties: 1`, so `{}` is schema-invalid **pre-invocation** and the model's constrained decoding is
steered to emit a real field. This is the steering layer; the runtime `empty_patch` check stays as the
safety net.

## Requirements

- Functional: the `tools/list` inputSchema for `mastra_meta_state_patch` has `patch.minProperties === 1`
  (draft-7). `{}` must fail JSON-schema validation against the model-visible schema; a valid
  single-field patch (e.g. `{description:"<≥20 chars>"}`) must pass.
- Non-functional: **generation-only** — `.parse()` behavior unchanged (runtime empty rejection remains
  the handler's job). No other tool's model-visible schema changes. Legitimate no-op patches
  (`{category:"warning"}` where category already equals `warning`) remain valid — `minProperties: 1`
  only rejects `{}`, not single-field patches.

## Architecture

Add a reusable **parity JSON-schema hints** seam so any tool can declare model-visible constraints
without hard-coding tool ids in the factory:

- A tool may export `parityJsonSchemaHints: { <field>: { minProperties: 1 } }` (generic, extensible).
- `server.js` passes `legacy.parityJsonSchemaHints ?? {}` into `createLoopTool`.
- `attachParityJSONSchema` (in `create-loop-tool.js`) merges each hint into the converted
  `parityJSONSchema` per field **before** installing the `toJSONSchema` override.

`metaStatePatchTool` declares `parityJsonSchemaHints: { patch: { minProperties: 1 } }`.

**Why a post-conversion hint, not Zod-native:** Zod v4 `z.object()` has no `.min(1)` that `toJSONSchema`
renders as `minProperties`; `.refine` is dropped (Phase 1). A targeted post-conversion injection is the
cleanest declarative seam and keeps the mechanism reusable for other tools/fields. Document this in a
code comment at the injection site.

## Related Code Files

- Modify: `tools/learning-loop-mastra/mastra/create-loop-tool.js` — add `parityHints` param to
  `createLoopTool`; apply per-field in `attachParityJSONSchema`.
- Modify: `tools/learning-loop-mastra/mastra/server.js` — pass `legacy.parityJsonSchemaHints ?? {}`
  into `createLoopTool` (line ~57-63).
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` — export
  `parityJsonSchemaHints: { patch: { minProperties: 1 } }` on the tool object.
- Keep (defense-in-depth, do NOT remove): `meta-state-patch-tool.js:110` runtime `empty_patch` check;
  `core/meta-state.js:641` `metaStateEntryPatchSchema.refine`.
- Test: `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (extend).

## Implementation Steps (TDD)

1. **RED** — extend `mcp-tools-list-parity.test.js`: **first add `"mastra_meta_state_patch"` to the
   `MIGRATED_TOOL_NAMES` allowlist** (line 20-37) — it is absent today, so the parity test does not
   assert it deeply (verification V2). Then assert the `tools/list` inputSchema for
   `mastra_meta_state_patch` has `patch.minProperties === 1`. Add a counter-assert that a non-patch
   tool (e.g. `mastra_meta_state_list`) is unaffected (no `minProperties` on its fields). Run
   `pnpm test:one tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` → fails (no
   `minProperties` today).
2. **GREEN** — implement the hints seam: `createLoopTool({ …, parityHints })`; in
   `attachParityJSONSchema`, after `parityJSONSchema = z.toJSONSchema(buildParitySchema(schema), …)`,
   deep-merge each `parityHints[field]` into `parityJSONSchema.properties[field]`. Thread
   `legacy.parityJsonSchemaHints ?? {}` from `server.js`. Declare the hint on `metaStatePatchTool`.
   Run → green.
3. **Lock generation-only separation** — add a test asserting `metaStatePatchTool.schema.patch.parse({})`
   still **succeeds** at the Zod layer (runtime path unchanged; the empty rejection is the handler's
   job) while the `tools/list` JSON schema rejects `{}`. This pins steering (schema) vs safety-net
   (runtime) so a future refactor cannot collapse them.
4. **Confirm no collateral** — run the full parity test; assert only `meta_state_patch` gained a
   `minProperties`.

## Success Criteria

- [ ] `mcp-tools-list-parity.test.js` asserts `patch.minProperties === 1` and passes.
- [ ] `{description:"<valid>"}` passes the model-visible schema; `{}` fails it.
- [ ] `.parse({})` succeeds at Zod layer (runtime path unchanged); runtime `empty_patch` check intact.
- [ ] No other tool's `tools/list` schema changed.
- [ ] Existing `meta-state-patch-tool.test.js` tests green.

## Risk Assessment

**Risk:** the harness does not feed schema-validation errors back to the model, so `minProperties`
steering is partial. **Mitigation:** Phases 3-4 (runtime error quality + hint) are the guaranteed floor
and ship regardless; Phase 2 is the best-case lever. Record the harness-behavior hypothesis as a note
in the Phase 5 finding; confirm later via a cold-session probe (out of scope here).
**Risk:** merging hints naively could clobber an existing `patch` property constraint. **Mitigation:**
deep-merge (don't replace); the parity test covers `patch` specifically.

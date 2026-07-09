# Phase 01 — close the two unguarded array holes + file meta-pattern finding

## Context

- Recurring wire-format coercion meta-pattern (see plan.md). Two tools remain unguarded.
- `stripEnvelope` lives in `core/envelope-stripper.js`; same per-field pattern used by 5 other tools.
- `loop_describe` is the session-start discovery tool — highest call frequency, highest blast radius.

## Files to modify

1. `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js` — wrap `categories`.
2. `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js` — wrap the `key` array branch.
3. Test file (new or adjacent): `loop-describe` + `loop-get-instruction` coercion-accept tests.
4. `meta-state.jsonl` — file the meta-pattern finding via `meta_state_report`.

## Implementation steps

1. **File the meta-pattern finding** (loop-internalization, do first so the plan has a finding anchor):
   - `meta_state_report`: category `loop-anti-pattern`, subtype `wire-format-coercion-recurrence`, affected_system `mcp-tools`, severity `warning`. Description: the 4+ instance recurrence + the two unguarded holes + the proposed guardrail. evidence_code_ref `tools/learning-loop-mastra/core/envelope-stripper.js`. Capture the returned finding id.

2. **`loop-describe-tool.js:13`**:
   ```js
   import { stripEnvelope } from "../../core/envelope-stripper.js";
   ...
   categories: z.preprocess(stripEnvelope, z.array(z.string())).optional()
     .describe("Optional filter: only return entries matching these meta-state categories"),
   ```

3. **`loop-get-instruction-tool.js`** (the `key` union, ~lines 88-92): wrap only the array branch so string/number paths are untouched:
   ```js
   import { stripEnvelope } from "../../core/envelope-stripper.js";
   ...
   key: z.union([
     z.string(),
     z.number().int().nonnegative(),
     z.preprocess(stripEnvelope, z.array(z.union([z.string(), z.number().int().nonnegative()]))),
   ]).describe("Hint identifier: named slug, a 0-based index, or array of slugs/indices."),
   ```

4. **Tests** (add to a new `loop-describe-get-instruction-wire-format.test.js` under `__tests__/legacy-mcp/`, matching the `zod-optional-coerce.test.js` style):
   - `loop_describe` schema: `safeParse({ categories: { item: ["gate-logic-bug"] } })` → success, `data.categories === ["gate-logic-bug"]`.
   - `loop_describe` schema: `safeParse({ categories: ["gate-logic-bug"] })` → success (non-coerced unchanged).
   - `loop_get_instruction` schema: `safeParse({ key: { item: ["slug1", "slug2"] } })` → success.
   - `loop_get_instruction` schema: `safeParse({ key: "slug" })` and `safeParse({ key: 2 })` → success (non-coerced unchanged).

## Tests / validation

- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-get-instruction-wire-format.test.js`
- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/zod-optional-coerce.test.js` (no regression).
- `node --test tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (parity view unchanged — the shim already understands preprocess wrappers).

## Rec 12 change-log (in-PR)

- `meta_state_log_change`: semantic change, change_target `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js`, change_diff.changed `["categories schema: wrap with z.preprocess(stripEnvelope)"]`; reason cites the meta-pattern finding id + the session-start blast-radius rationale. Second change-log for `loop-get-instruction-tool.js` key branch.

## Risks / rollback

- Wrapping only the array branch in `loop_get_instruction` leaves string/number paths byte-identical — no behavior change for the common single-key call.
- Rollback: revert the two imports + two wraps + test file. No data impact.
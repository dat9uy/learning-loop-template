# Phase 02 — structural schema-walker guardrail test

## Context

- The meta-pattern recurs because there is no test catching a tool that declares a `ZodArray` without a `stripEnvelope`/`deepStripEnvelope` preprocess. Each regression is found at runtime (`validation_failed`).
- `mastra/schema-parity.js#buildParitySchema` already walks zod-v4 schemas via `schema._zod.def.type` across `pipe` (preprocess) / `optional` / `default` / `nullable` / `array` / `union`. Reuse this walker pattern; do not invent a new introspection layer.
- `mcp-tools-list-parity.test.js` already enumerates tools and keeps a `MIGRATED_TOOL_NAMES` list — the guardrail extends this enumeration.

## Goal

A test that fails if ANY handler tool schema has a reachable `ZodArray` not preceded (in the wrap chain) by a `z.preprocess(stripEnvelope | deepStripEnvelope, …)`.

## Files to create

1. `tools/learning-loop-mastra/__tests__/legacy-mcp/wire-format-array-guard.test.js` — the guardrail.
2. (Possibly) a small shared walker helper extracted from `schema-parity.js` if reuse would otherwise duplicate the `def.type` switch — prefer importing/extending `schema-parity.js` over copy-paste (DRY).

## Implementation steps

1. **Enumerate handler tool schemas.** Import every module in `tools/handlers/*.js` (dynamic import over `fs.readdir`, mirroring `server.js:46`), collect each tool's `.schema` (a `ZodObject`). Skip tools with no array fields.

2. **Walker** (`findUnguardedArrays(schema, path)`): for a `ZodObject`, iterate `schema._zod.def.shape` (or `.shape`). For each field, recurse through the wrap chain:
   - `pipe` (preprocess): if the preprocess fn is `stripEnvelope`/`deepStripEnvelope` (compare by reference — import the same functions), mark the array below as **guarded** and stop descending for the guardrail purpose. Otherwise descend into `def.out`.
   - `optional` / `default` / `nullable`: descend into `def.innerType`, preserving guarded-state.
   - `union`: descend into each `def.options`; an array in any option must itself be guarded (per-option preprocess).
   - `array`: if reached without a guarded-mark, record `{ tool, field, path }` as unguarded.
   - other types: stop.
   - Carry a `guarded` flag down the chain so a preprocess above an optional-wrapped array is recognized.

3. **Assertion**: `assert.deepEqual(unguarded, [])` with a message listing each `tool:field:path`. After phase 01, the set is empty. Any future tool adding an unguarded array fails this test.

4. **Reference comparison for the preprocess fn**: zod v4 `pipe`'s `def.in` carries the wrapped schema, not the fn directly. To detect "is this a stripEnvelope preprocess", compare the preprocess effect — simplest robust approach: probe behaviorally. For each `pipe` encountered, check `def.in?._zod?.def` is absent/inner and treat any `pipe` whose `def.out` path eventually reaches an array as "guarded" **only if** the pipe is at the array's wrap boundary. To avoid fragility, use a **behavioral sentinel**: detect guarded-ness by `schema.safeParse({ item: PROBE_ARRAY })` success per array field (see fallback below). Decide between structural and behavioral in implementation; both are acceptable, structural preferred for precision.

## Fallback (if zod-v4 fn-detection proves fragile)

Behavioral guardrail: for each tool schema field, attempt `fieldSchema.safeParse({ item: [] })` and `safeParse({ item: ["__guard_probe__"] })`. If the field accepts a bare array (`safeParse(["__guard_probe__"])` succeeds) but rejects `{ item: ["__guard_probe__"] }`, it is an unguarded array field → fail. This needs no fn-reference comparison and is robust to zod internals, but requires a probe string that passes the element schema (use a permissive probe; for `z.array(z.string())` and `z.array(z.union([z.string(), z.number()]))` a string probe works; for `z.array(opSchema)` (batch) the probe is harder — exclude `operations` via a known-protected allowlist, since it is guarded by `deepStripEnvelope` and already covered by `meta-state-batch-tool.test.js`).

Ship the behavioral version if structural fn-detection is unreliable; file a follow-up finding if the behavioral version cannot cover `operations` structurally.

## Tests / validation

- `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/wire-format-array-guard.test.js` → passes (empty unguarded set after phase 01).
- Negative control: temporarily unwrap `categories` in `loop-describe-tool.js`, re-run, confirm the test fails with `loop_describe:categories`. Restore.

## Rec 12 change-log (in-PR)

- `meta_state_log_change`: mechanical change, change_target `tools/learning-loop-mastra/__tests__/legacy-mcp/wire-format-array-guard.test.js`, change_diff.added the guardrail file; reason cites the meta-pattern finding id.

## Post-merge closeout

- Resolve the meta-pattern finding via `meta_state_resolve` with resolution referencing the PR.
- Note: the two hole-fixes don't get their own findings (they are folded into the one meta-pattern finding filed in phase 01, which covers "recurring + remaining holes + guardrail").

## Risks / rollback

- zod-v4 `_zod.def` shape is already load-bearing for `schema-parity.js`, so the walker is proven, not speculative.
- Rollback: delete the guardrail test file. The two hole-fixes from phase 01 stay (they are independently valuable).
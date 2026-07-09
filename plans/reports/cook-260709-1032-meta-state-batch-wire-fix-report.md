# Cook Report — meta_state_batch wire-format array-coercion fix

**Plan:** `plans/260709-1032-meta-state-batch-wire-fix/`
**Mode:** auto
**Date:** 2026-07-09
**Status:** DONE

## Summary

Shipped the deep envelope-strip fix for `meta_state_batch` end-to-end. The MCP wire layer's `{item:[...]}` coercion (top-level `operations` and nested arrays inside each entry) now unwraps at every tree level via a new `deepStripEnvelope` helper. Single phase, single PR.

## Changes

| File | Type | Purpose |
|------|------|---------|
| `tools/learning-loop-mastra/core/envelope-stripper.js` | edit | Added `deepStripEnvelope` (recursive, fail-closed) |
| `tools/learning-loop-mastra/tools/handlers/meta-state-batch-tool.js` | edit | Schema preprocess on `operations`; handler applies deep strip as defense-in-depth; removed redundant per-field `stripEnvelope` on `entry` |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` | edit | +5 coercion tests (top-level, nested change_diff, parity, fail-closed, double envelope) |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/zod-union-envelope.test.js` | edit | +8 unit tests for `deepStripEnvelope` |
| `meta-state.jsonl` | append | Rec 12 change-log entry `meta-260709T1057Z-…-batch-tool.js` |

## Test results

- `tools/learning-loop-mastra/__tests__/legacy-mcp/`: 1138 pass, 0 fail, 1 skip
- Full suite: 1375 pass, 0 fail, 1 skip (pre-existing)
- New tests cover:
  - top-level `operations: {item:[op]}` → unwrap + apply
  - nested `change_diff.added: {item:["x"]}` → unwrap + entry validates
  - parity with `meta_state_log_change` schema (control repro from finding)
  - fail-closed on non-envelope nested objects (no spurious unwrap)
  - double envelope `{item:{item:[op]}}` → recursive unwrap

## Acceptance criteria

1. ✅ `meta_state_batch` accepts `operations` coerced to `{item:[...]}` and applies the batch.
2. ✅ `meta_state_batch` accepts nested `change_diff.added/removed/changed` coerced to `{item:[...]}`; `metaStateEntrySchema.safeParse` passes.
3. ✅ Same change-log body accepted by `meta_state_log_change` AND `meta_state_batch` (parity repro).
4. ✅ New tests in `meta-state-batch-tool.test.js` cover both coercion levels.
5. ✅ Existing batch tests still pass (12/12); `deepStripEnvelope` fail-closed on non-envelope input.
6. ✅ Rec 12 change-log committed in-PR; finding `meta-260709T1017Z-…-batch` resolution deferred to post-merge per plan.

## Risks

None materialized. Fail-closed semantics preserved (single-key `{item:X}` only). Plan's documented risk (legitimate `{item:X}` body getting unwrapped) is unchanged from the prior `stripEnvelope` behavior on `entry`; real entries always carry `id`/`entry_kind`/etc., so the shape never occurs.

## Followups (out of scope, per plan)

- Post-merge: resolve finding `meta-260709T1017Z-meta-state-batch-mcp-tool-rejects-valid-batch-operations-wit` via `meta_state_resolve` referencing this PR.
- Deferred to M2 single-writer-gate debate: parallel-PRs EOF conflict finding (`meta-260709T1017Z-…-parallel-prs`).
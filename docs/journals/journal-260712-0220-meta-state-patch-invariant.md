# meta_state_patch — entry_kind/status invariant restored

**Date**: 2026-07-12 02:20
**Severity**: High (data corruption, two loop-design entries flipped)
**Component**: tools/learning-loop-mastra/core/meta-state.js + meta-state patch tool
**Status**: Phase 1 + Phase 2 stopgap resolved; class-level fix pending

## What changed

The meta_state_patch tool could silently rewrite a record's identity and lifecycle fields. Two loop-design entries had `entry_kind` flipped to `"finding"` this session before the bug was caught. Code now refuses to inject those fields, the registry was repaired, and a stopgap blocks the same hole on the batch update path.

## Why (the bug)

`buildPatchSchemaFor` defined each kind's patch schema as a Zod union-of-partials and applied `.default()` on `entry_kind` (all four kinds) and `status` (rule, loop-design). When a caller sent an empty patch or a patch that omitted those fields, Zod materialized the default — so a `{ notes: "x" }` patch silently became `{ notes: "x", entry_kind: "finding" }`. The corruption only surfaced because a downstream consumer (cold-tier regression test) reported kind mismatches.

## How

**Fix A — `meta-state.js:329-340`**: per-kind patch schemas now omit `entry_kind` entirely (all four kinds) and `status` (rule, loop-design) before `.partial().strict()`. The schema literally cannot mint those fields.

**Fix B — `meta-state.js:642-648`**: `updateEntry` strips `entry_kind` from `cleanPatch` as defense-in-depth. Direct core callers (promote-rule, dispatch, re-verify, resolve, supersede) are protected even if a future schema regression reintroduces the field.

**Repair**: `meta_state_batch` re-asserted `entry_kind: "loop-design"` on the two corrupted entries at `meta-state.jsonl:275-276`. The patch tool could not repair — its branch-mismatch guard at `meta-state-patch-tool.js:43` rejects cross-kind writes by design. Batch was the only MCP path. Repair bumped registry version 1 → 2.

**Phase 2 stopgap — `meta-state.js:290-300`**: `entry_kind` and `status` were added to `IMMUTABLE_PATCH_FIELDS`. Batch update now refuses identity/lifecycle rewrites the same way the patch tool already did. This closes the parallel hole until the universal `assertinvariant` wrapper ships.

## Side effects

The repair exposed a pre-existing data quality issue: the two repaired loop-design entries plus two other visible loop-designs all carried non-resolvable file paths in `proposed_design_for`. The corruption had been masking it because the kind check fired first. The cold-tier regression test flagged 21 broken refs. The canonical `fix-loop-design-refs.mjs` script (third invocation in registry history) stripped the unresolvable refs.

## Audit trail

Four change-logs were filed immediately after each edit landed (operator-confirmed ordering; eliminates audit/reality divergence):

- Phase 1 code fix (Fix A + Fix B)
- Phase 1 data repair (two loop-design entries)
- Phase 2 stopgap (`IMMUTABLE_PATCH_FIELDS`)
- `fix-loop-design-refs` cleanup

## Finding status

The original finding stays open. The class — not the instance — closes only when the universal `assertinvariant` wrapper lands and the per-kind schema construction becomes the only way to mint a kind-correct entry across every write path.

## Tests

Five new RED → GREEN tests plus thirteen regression tests pass. `gate:self-verify` reports 1776 tests total, zero regressions.
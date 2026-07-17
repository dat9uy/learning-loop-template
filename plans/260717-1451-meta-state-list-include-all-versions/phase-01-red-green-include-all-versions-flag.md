---
phase: 1
title: "TDD — include_all_versions flag on meta_state_list"
status: pending
priority: P1
effort: "2h"
dependencies: []
shipped_at: null
shipped_by: null
---

# Phase 1: TDD — include_all_versions flag on meta_state_list

## Overview

Ship `meta_state_list({include_all_versions: true})` as a first-class affordance that surfaces the full versioned-append history per id (v0 open, v1 resolved, v2 superseded, etc.) by bypassing the `_readAndParseRegistry` projection. TDD: red tests first, green implementation second.

## Requirements

- **Functional:** `meta_state_list({include_all_versions: true})` reads `meta-state.jsonl + change-log.jsonl` raw (no `group_by | max_by(.version)` collapse) and returns every line per id, sorted by `(id ascending, version ascending)`, with `created_at` as the tie-break. The default (`include_all_versions: false`) preserves existing behavior exactly. The flag composes orthogonally with `include_archived`, `status`, `entry_kind`, `compact`, `id`, and `ref_by/ref_field`. A separate read function (`readRegistryAllVersions`) keeps the projected path untouched.
- **Non-functional:** the new read path has its own cache entry (different `parseFn` argument or different cache-key suffix) so the projected callers cannot accidentally see unprojected arrays. `toCompact` retains the `version` field so operators see the version under default `compact: true`. Legacy entries (no `version` field, pre-Phase-A backfill) parse cleanly under the raw path.

## Architecture

Today:
- `_readAndParseRegistry(root)` reads both files, parses, projects via `group_by(.id) | max_by(.version)`, re-sorts by `created_at` ascending. Used by `readRegistry(root)` → cached via `readRegistryWithCache(root, parseFn)`.
- `meta_state_list` handler calls `readRegistry(root)` and filters the projected set.

After:
- **NEW** `readRegistryAllVersions(root)` — same file read + parse + `withDefaults` step, but skips the `group_by | max_by` collapse. Sorts by `(id ascending, version ascending)` with `created_at` tie-break. Caches under a separate key (the `read-registry-cache.js` module gains a second cache slot or a keyed `parseFn` discriminator).
- **NEW** `parseFnAllVersions` exported from `core/meta-state.js` (alongside or as a sibling of `_readAndParseRegistry`).
- **MOD** `core/read-registry-cache.js` — accepts a named cache slot. Either:
  - **Option 1 (preferred):** two parallel caches keyed on (root + "projected" | "all-versions") + BOTH files' mtime+size. Both invalidate together when EITHER file changes.
  - **Option 2:** one cache, value becomes `{ projected, allVersions }`. Slightly tighter coupling but simpler invalidation.
  - Option 2 is preferred for blast-radius reasons: one cache entry per (root, mtime, size) tuple, but the cached value carries both projections. Keeps the existing `readRegistry` signature unchanged and adds a sibling `readRegistryAllVersions(root)` that reads the same cached value's `allVersions` slice.
- **MOD** `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js`:
  - Add `include_all_versions: z.coerce.boolean().optional().default(false)` to the schema.
  - Handler picks the read function based on the flag (`includeAllVersions ? readRegistryAllVersions(root) : readRegistry(root)`).
  - The filter pipeline (ref_by → id → status/category/etc → include_archived/exclude-terminal) applies identically to both inputs. The only difference is whether the array holds one-entry-per-id or N-entries-per-id.
  - `activeFilters` adds `include_all_versions: include_all_versions || false` for the gate-log breadcrumb.
  - Output adds `include_all_versions: include_all_versions || false` for parity with `include_archived`.
  - Tool description updated to call out the flag (Phase 2 fleshes this).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` — add `parseFnAllVersions` (~30 lines, mirrors `_readAndParseRegistry` minus projection), add `readRegistryAllVersions(root)` export, share the dual-source read+parse+withDefaults logic with `_readAndParseRegistry` via a private helper `readRawLines(root)` to avoid duplication.
- Modify: `tools/learning-loop-mastra/core/read-registry-cache.js` — change cached value shape from `{entries, metaState, changeLog}` to `{projected, allVersions, metaState, changeLog}` (Option 2 above); `readRegistry(root)` returns `cached.projected`; `readRegistryAllVersions(root)` returns `cached.allVersions`; `invalidateCache(root)` unchanged.
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js` — add `include_all_versions` schema flag, handler picks read fn, output + gate-log surface the flag.
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-include-all-versions.test.js` — 5+ TDD tests (see Implementation Steps).
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-list-compact.test.js` — verify `toCompact` retains the `version` field (the new flag's value is invisible under compact: true without this); add 1 regression test.
- Modify: `tools/learning-loop-mastra/core/loop-introspect.js` — confirm `summarize` (and therefore `toCompact`) includes `version` on each entry. Likely already does (it's an identity field) but verify.

## Implementation Steps (TDD — tests first)

1. **RED test 1: `include_all_versions: true` returns all versions per id.** Write a fixture registry with id=`X` having v0 (open), v1 (resolved), v2 (superseded) lines on disk. Assert `meta_state_list({id: "X", include_all_versions: true})` returns 3 entries with `version` fields 0, 1, 2 in ascending order. **Test FIRST — confirm it fails.**
2. **RED test 2: `include_all_versions: false` (default) returns only the highest-version line per id.** Same fixture. Assert `meta_state_list({id: "X"})` returns 1 entry with the v2 (superseded) line. **Test FIRST — confirm it fails (or rather, the GREEN will confirm it passes; the test codifies existing behavior).**
3. **RED test 3: `include_all_versions: true` + `include_archived: true` composes.** Same fixture with an additional `tombstone_kind: "delete"` v3 line. Assert the full history (4 entries) is returned when both flags are true.
4. **RED test 4: `include_all_versions: true` + default filters excludes terminal entries.** Set `include_all_versions: true` without `include_archived`. Assert resolved/superseded/archived entries are filtered out (the v1, v2, v3 are hidden). Only v0 (open) appears.
5. **RED test 5: legacy entry (no `version` field) doesn't crash under all-versions path.** Pre-Phase-A fixture with a single line lacking the `version` field. Assert `meta_state_list({include_all_versions: true})` returns 1 entry; the `version` is treated as `0` (matches the projection's null-as-0 invariant).
6. **RED test 6: `compact: true` retains the `version` field under `include_all_versions: true`.** Same fixture as test 1. Assert each returned entry has `version` as a top-level field in the compact projection.
7. **GREEN — implement the read path.** Add `parseFnAllVersions` to `core/meta-state.js`. Refactor `_readAndParseRegistry` and the new function to share the `readRawLines(root)` helper (de-duplication: ~15 lines saved). Update `core/read-registry-cache.js` to cache `{projected, allVersions}` per (root + mtime+size). Run all 6 RED tests; expect GREEN.
8. **GREEN — wire `include_all_versions` into the tool.** Update `meta-state-list-tool.js`: schema field, read-fn picker, gate-log surface, output shape. Run focused suite: `pnpm exec vitest run __tests__/legacy-mcp/meta-state-list-include-all-versions.test.js`. Expect GREEN.
9. **GREEN — full meta-state test suite.** `pnpm test:iter`. Fix regressions; do not weaken tests. Run `pnpm exec vitest --changed` post-edit.
10. **Update compact-mode regression test.** Add 1 test to `meta-state-list-compact.test.js` asserting `toCompact` retains the `version` field. This is the consumer-impact guard: without it, the new flag is invisible under the default `compact: true`.
11. **Confirm `loop-introspect.js#summarize` retains `version`.** Visual inspection; if missing, add `version` to the compact whitelist (it's identity, not a preview, so it should already be there).

## Success Criteria

- [ ] All 6 new RED tests in `meta-state-list-include-all-versions.test.js` GREEN.
- [ ] `compact` regression test GREEN.
- [ ] Full meta-state test suite GREEN (no regressions).
- [ ] `pnpm exec vitest --changed` clean.
- [ ] Cache layer test: `readRegistry(root)` and `readRegistryAllVersions(root)` return distinct shapes (one-entry-per-id vs N-entries-per-id) on a multi-version fixture, with a SINGLE cold-cache miss (not two).

## Risk Assessment

- **P1 — Cache value shape change is a per-(root, mtime) cache invalidation.** Every existing caller sees a cold cache on first invocation after the change. Acceptable (cache is process-lifetime, refreshes from disk). TDD test 1 covers it.
- **P1 — `readRegistryAllVersions` ordered by `(id, version)` while `readRegistry` ordered by `created_at`.** Callers that mutate the array directly (rare) may assume the projected ordering. TDD test 2 codifies the projected ordering; new read path has different ordering (documented in the docstring).
- **P2 — The `_readAndParseRegistry` and `parseFnAllVersions` may diverge over time.** Mitigated by sharing `readRawLines(root)`. Code-comment block in `core/meta-state.js` calls out the divergence surface (post-projection sort).
- **P2 — `ref_by`/`ref_field` filter on all-versions path returns multi-line per id** (the same id may appear N times in the result). Is this the right semantic? Yes — the operator asked for "everything related to id X" and gets every line that mentions X, including intermediate versions that may have a different `status`. Document this in the tool description (Phase 2).
- **P3 — Existing callers calling `readRegistry(root)` see no behavior change.** The cache structure changes but the return value is the same shape. Verified by GREEN test 2.
- **P3 — Legacy entry (no version) test depends on a pre-Phase-A fixture.** If the live registry has no legacy entries (Phase A backfill was complete), the test must use an artificial fixture. Document the fixture-creation helper.
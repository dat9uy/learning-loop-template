---
phase: 1
title: "Phase A: Projection Swap + Version Backfill"
status: pending
priority: P1
dependencies: []
---

# Phase 1: Phase A — Projection Swap + Version Backfill

## Overview

Swap the JS read-seam projection from "concat + sort by `created_at`" to "concat + `group_by(.id) | map(max_by(.version))` then re-sort by `created_at`", and backfill `version: 0` on any existing entry missing a non-null `version`. Pure infrastructure — behavior is identical because each id is a singleton today. No write-path change, no `.gitattributes` change. Safe to merge standalone.

## Requirements

- **Functional:** `_readAndParseRegistry` returns the same entry array as today for the current singleton-per-id file, but via the last-wins-by-max-version projection. Every entry in `meta-state.jsonl` + `change-log.jsonl` has a non-null integer `version`.
- **Non-functional:** `meta_state_list` output byte-identical before/after (ordering, filtering, compaction all preserved). `registry-table.sh` unchanged (already does the dedupe). No `.gitattributes` edit. No write-path edit.

## Architecture

The seam (`core/read-registry-cache.js#readRegistryWithCache` → `parseFn` = `core/meta-state.js#_readAndParseRegistry`) was built in Tier 1 for exactly this swap. Today `parseFn` concats both files and sorts by `created_at` ascending. After: concat both files → group by `id` → pick `max_by(.version)` per id → re-sort by `created_at` ascending. The re-sort is load-bearing: `meta_state_list` callers expect chronological order, and `group_by(.id)` preserves first-appearance order of ids, not chronological order. `registry-table.sh` already runs `group_by(.id) | map(max_by(.version))[]` without re-sort (operator pipes to `fx` and filters) — no change needed there.

`jq` `max_by(.version)` is undefined when `version` is null across a group, so the backfill must land in the same PR (before the projection goes live) or the projection silently drops/mispicks entries.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`_readAndParseRegistry` ~:641 — projection swap)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (one-time backfill helper or migration script invocation)
- Create: `tools/learning-loop-mastra/tools/handlers/scripts/backfill-versions.mjs` (one-time migration; mirrors `seed-file-index.mjs` shape)
- Test: `tools/learning-loop-mastra/__tests__/` (new projection test + backfill idempotence test)
- No change: `tools/scripts/registry-table.sh`, `.gitattributes`, any write-path function

## Implementation Steps (TDD — tests first)

1. **Write the projection test first.** New test: build a fixture `meta-state.jsonl` with two versioned lines for one id (v0 + v2) and a singleton id; assert `_readAndParseRegistry` returns the v2 line for the dup-id and the singleton, sorted by `created_at`. Assert a singleton-only fixture returns byte-identical output to the current implementation (snapshot or equivalence).
2. **Write the ordering-preservation test.** Fixture with entries out of `created_at` order across both files; assert `meta_state_list` (via the seam) returns chronological order. This pins the re-sort requirement.
3. **Write the backfill idempotence test.** Fixture with mixed `version` present/missing/null; assert backfill sets missing/null to `0` and leaves existing integers untouched; running twice is a no-op.
4. **Implement the projection swap** in `_readAndParseRegistry`: replace the sort-only tail with `group_by(id) → max_by(version) → sort by created_at`. Keep the dual-source concat + `entry_kind` coerce + `withDefaults` prelude unchanged.
5. **Implement `backfill-versions.mjs`**: read `meta-state.jsonl`, for each line if `version` is null/missing/non-integer set `version: 0`, write back atomically (tmp+rename under no parallel-PR window). Dry-run mode prints the would-change count without writing.
6. **Run the backfill** on the real `meta-state.jsonl` (100 lines) in this PR. Confirm via `jq 'map(select(.version == null or (.version | type != "number")))' meta-state.jsonl` that none remain.
7. **Verify `registry-table.sh`** still produces identity on the now-backfilled file (`tools/scripts/registry-table.sh | jq -s 'length'` == id count).
8. **Run focused tests**: `pnpm exec vitest run --bail=1` on the meta-state suite; then `pnpm test:iter` for the parsed summary. Fix regressions, do not weaken tests.

## Success Criteria

- [ ] Projection test passes (dup-id → max version; singleton → identity).
- [ ] Ordering-preservation test passes (chronological by `created_at` after dedupe).
- [ ] Backfill idempotence test passes.
- [ ] Real `meta-state.jsonl` has zero null/non-integer `version` fields after backfill.
- [ ] `meta_state_list` output byte-identical before/after on the real registry (diff the tool output).
- [ ] Full meta-state test suite green (`pnpm test:iter`).
- [ ] No `.gitattributes` change; no write-path function edited.

## Risk Assessment

- **Projection drops entries with null version** → mitigated by backfill landing in same PR before projection goes live + the backfill idempotence test.
- **Re-sort changes `meta_state_list` ordering** → mitigated by the ordering-preservation test (TDD step 2) written before the swap.
- **Backfill clobbers a real version** → mitigated by only touching null/missing/non-integer; idempotence test asserts existing integers untouched.
- **Migration runs during a parallel registry PR** → mitigated by Q6 discipline (no concurrent registry-PR window for this PR).
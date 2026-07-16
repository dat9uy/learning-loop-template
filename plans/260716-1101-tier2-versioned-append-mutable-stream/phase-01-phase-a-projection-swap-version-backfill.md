---
phase: 1
title: "Phase A: Projection Swap + Version Backfill"
status: completed
priority: P1
dependencies: []
shipped_at: "2026-07-16T12:30:00.000Z"
shipped_by: "operator"
test_summary: "1624 tests / 324 suites green; 12 new tests added (projection + backfill)."
---

# Phase 1: Phase A — Projection Swap + Version Backfill

## Overview

Swap the JS read-seam projection from "concat + sort by `created_at`" to "concat + `group_by(.id) | map(max_by(.version))` then re-sort by `created_at`", and backfill `version: 0` on any existing entry missing a non-null `version`. Pure infrastructure — behavior is identical because each id is a singleton today. No write-path change, no `.gitattributes` change. Safe to merge standalone.

## Requirements

- **Functional:** `_readAndParseRegistry` returns the same entry array as today for the current singleton-per-id file, but via the last-wins-by-max-version projection. Every entry in `meta-state.jsonl` + `change-log.jsonl` has a non-null integer `version`.
- **Non-functional:** `meta_state_list` output byte-identical before/after (ordering, filtering, compaction all preserved). `registry-table.sh` unchanged (already does the dedupe). No `.gitattributes` edit. No write-path edit.

## Architecture

The seam (`core/read-registry-cache.js#readRegistryWithCache` → `parseFn` = `core/meta-state.js#_readAndParseRegistry`) was built in Tier 1 for exactly this swap. Today `parseFn` concats both files and sorts by `created_at` ascending (V8 stable `Array.prototype.sort`). After: concat both files → group by `id` → pick `max_by(.version)` per id → re-sort by `created_at` ascending.

<!-- RT: M1 — projection must be pure JS, not jq-in-JS-seam. The byte-identical test
premise was wrong: jq `sort_by(.created_at)` is NOT stable on equal-timestamp inputs;
V8 `Array.prototype.sort` IS stable. Pure-JS projection (groupBy → map(maxBy) →
Array.prototype.sort) preserves the existing ordering contract. jq stays in
`registry-table.sh` for shell use; JS seam uses stable JS sort. -->

The re-sort is load-bearing: `meta_state_list` callers expect chronological order, and `group_by(.id)` preserves first-appearance order of ids, not chronological order. `registry-table.sh` already runs `group_by(.id) | map(max_by(.version))[]` without re-sort (operator pipes to `fx` and filters).

<!-- RT: H11 — corrected: live jq 1.8.2 test shows `max_by(.version)` does NOT return
`undefined` on null groups. For partial-null groups (some entries have integer version,
others null), `jq` picks the non-null integer. For all-null groups (legacy data
pre-Phase-B with no version bumps), `jq` returns an arbitrary group member (last in
iteration order, NOT chronologically-latest — silent data corruption, WORSE than
silently dropping). The backfill is required as a precondition: every id must have
≥1 non-null integer version before the projection goes live. Backfill idempotence
test must assert this property post-backfill (no group has all-null members). -->

`jq` `max_by(.version)` mispicks on null entries (returns arbitrary member), so the backfill must land in the same PR (before the projection goes live) or the projection silently corrupts the registry.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`_readAndParseRegistry` ~:641 — pure-JS projection swap)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (one-time backfill helper or migration script invocation)
- Create: `tools/learning-loop-mastra/tools/handlers/scripts/backfill-versions.mjs` (one-time migration; mirrors `migrate-change-log-stream.mjs` shape — atomic tmp+rename, NOT in-place like `seed-file-index.mjs`)
- Test: `tools/learning-loop-mastra/__tests__/` (new projection test + backfill idempotence test asserting every id has ≥1 non-null integer version post-backfill)
- Modify: `tools/scripts/registry-table.sh` (default path now `meta-state.jsonl change-log.jsonl` — currently one-file; see `registry-table.sh:11-12,30-34` where this was deferred)

<!-- RT: H2 — backfill script must use atomic tmp+rename (mirroring `migrate-change-log-stream.mjs`,
NOT `seed-file-index.mjs`). Crash mid-run leaves mixed-version file that the new
projection misreads. Take the registry lock via `proper-lockfile`; use a unique
tmp suffix `path + ".backfill-" + pid + ".tmp"`; emit a gate-log entry before
write; run from a coordinated maintenance window where MCP writers are quiesced.
RT: M2 — `registry-table.sh` default flips in this PR (not "no change"). The script
default currently reads only `meta-state.jsonl` (line 33); the JS union chokepoint
returns both files; Phase C's read-instruction formalization assumes both files.
Without this flip, `registry-table.sh | tail -20` is degraded vs. `meta_state_list`. -->

## Implementation Steps (TDD — tests first)

1. **Write the projection test first.** New test: build a fixture `meta-state.jsonl` with two versioned lines for one id (v0 + v2) and a singleton id; assert `_readAndParseRegistry` returns the v2 line for the dup-id and the singleton, sorted by `created_at`. Assert a singleton-only fixture returns byte-identical output to the current implementation (snapshot or equivalence).
2. **Write the ordering-preservation test.** Fixture with entries out of `created_at` order across both files; assert `meta_state_list` (via the seam) returns chronological order. This pins the re-sort requirement.
3. **Write the backfill idempotence test.** Fixture with mixed `version` present/missing/null; assert backfill sets missing/null to `0` and leaves existing integers untouched; running twice is a no-op.
4. **Implement the projection swap** in `_readAndParseRegistry`: replace the sort-only tail with `group_by(id) → max_by(version) → sort by created_at`. Keep the dual-source concat + `entry_kind` coerce + `withDefaults` prelude unchanged.
5. **Implement `backfill-versions.mjs`** (mirrors `migrate-change-log-stream.mjs` shape, NOT `seed-file-index.mjs`):

   a. Acquire registry lock via `proper-lockfile` (per-process locks via `core/registry-lock.js` don't reach across processes; the backfill script is a separate process).
   b. Read `meta-state.jsonl`; for each line, if `version` is null/missing/non-integer set `version: 0`.
   c. Write to a **unique** tmp file (`path + ".backfill-" + pid + ".tmp"` so concurrent MCP writers don't collide on the shared `.tmp` path).
   d. `renameSync` tmp → real path (atomic on POSIX).
   e. Emit a gate-log entry before write (operator audit trail).
   f. Dry-run mode prints the would-change count without writing.
   g. Acceptance criterion: `raw_lines` before == `raw_lines` after backfill (no partial writes).
   h. **Script header documentation**: "Default `version: 0` means 'no patches applied yet'. Per Validation Session 1 Q1, this default is consistent with `metaStateEntrySchema.default(0)` and the write-path semantics at `core/meta-state.js:1049` where every patch bumps version from `0` to `1+`. Audited safe."

   <!-- RT: H2 — atomic tmp+rename + unique tmp suffix + proper-lockfile + coordinated
   maintenance window. The script crashes mid-run today would leave mixed-version
   data the new projection misreads. Imported review: `core/registry-lock.js` is
   per-process; backfill runs in a separate process. Validation Session 1 Q1:
   `version: 0` default confirmed safe (schema-invariant + write-path consistency). -->

6. **Run the backfill** on the real `meta-state.jsonl` (100 lines) in this PR. Verify:
   - `jq 'map(select(.version == null or (.version | type != "number")))' meta-state.jsonl` is empty.
   - `jq -s '[group_by(.id)[] | select(length > 1 and (map(.version) | unique | length == 1))] | length' meta-state.jsonl` is 0 (no group is all-null-version). <!-- RT: H11 — every group must have ≥1 non-null integer version. -->


6. **Run the backfill** on the real `meta-state.jsonl` (100 lines) in this PR. Confirm via `jq 'map(select(.version == null or (.version | type != "number")))' meta-state.jsonl` that none remain.
7. **Verify `registry-table.sh`** still produces identity on the now-backfilled file (default path now reads both `meta-state.jsonl` + `change-log.jsonl` post-flip; `tools/scripts/registry-table.sh | jq -s 'length'` == id count). <!-- RT: M2 — default path flip is in this PR. -->
8. **Run focused tests**: `pnpm exec vitest run --bail=1` on the meta-state suite; then `pnpm test:iter` for the parsed summary. Fix regressions, do not weaken tests.

## Success Criteria

- [x] Projection test passes (dup-id → max version; singleton → identity).
- [x] Ordering-preservation test passes (chronological by `created_at` after dedupe).
- [x] Backfill idempotence test passes.
- [x] Real `meta-state.jsonl` has zero null/non-integer `version` fields after backfill.
- [x] `meta_state_list` output byte-identical before/after on the real registry (diff the tool output).
- [x] Full meta-state test suite green (`pnpm test:iter`).
- [x] No `.gitattributes` change; no write-path function edited.

## Risk Assessment

- **Projection drops entries with null version** → mitigated by backfill landing in same PR before projection goes live + the backfill idempotence test.
- **Re-sort changes `meta_state_list` ordering** → mitigated by pure-JS projection (V8 stable `Array.prototype.sort`) — not jq `sort_by` which is unstable.
- **Backfill clobbers a real version** → mitigated by only touching null/missing/non-integer; idempotence test asserts existing integers untouched.
- **Migration runs during a parallel registry PR** → mitigated by `proper-lockfile` + unique tmp suffix + coordinated maintenance window.
- **Projection mispicks on null group** (`max_by` returns arbitrary member) — empirically worse than silently dropping. Mitigated by backfill-asserts-every-group-has-non-null version test (TDD step 3).
- **Backfill crashes mid-run** → mitigated by atomic tmp+rename + unique tmp suffix; partial-write would leave mixed-version file that projection misreads.

### Whole-Plan Consistency Sweep

- Architecture clarified: pure-JS projection (M1); `max_by` null behavior empirically-corrected (H11).
- Related Code Files: `backfill-versions.mjs` mirrors `migrate-change-log-stream.mjs` (atomic), not `seed-file-index.mjs` (H2); `registry-table.sh` default flips (M2).
- Implementation Steps step 5 expanded with atomic-tmp+rename discipline + `proper-lockfile` (H2).
- Implementation Steps step 6 expanded with cohort check (no all-null-version group) (H11).
- Implementation Steps step 7 default-path flip noted (M2).
- Risk Assessment updated: pure-JS sort noted; arbitrary-member mispick risk added.
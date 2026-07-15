# Cook execution report — Tier 1 read seam + registry-table.sh

**Plan:** `plans/260715-0801-change-log-stream-split-tier1/`
**Branch:** `plan/260715-0801-change-log-stream-split-tier1`
**Date:** 2026-07-15
**Scope (per user choice):** Phase 01a (pre-merge dedupe) + Phase 1 (jq projection seam) + Phase 2 read-seam only. Write dispatch + migration + CI gates + closeout deferred to follow-up sessions.

## Status: DONE_WITH_CONCERNS

213/214 vitest files pass (1 pre-existing skip). Manual smoke tests green. Concerns:
- Write dispatch (Phase 2 step 2) is **deferred** — change-logs continue to land in `meta-state.jsonl` via the table write path. The `appendChangeLogEntryAtomic` helper is implemented but not yet called from `writeEntry` / `metaStateBatch`.
- `consolidates` schema change (`z.string()` → `z.array(z.string())`) was attempted and rolled back — 31 tests across 19 files use the single-string form. Schema change ships with the migration in Phase 2 step 4-5.

## What shipped

### Phase 01a: Pre-merge dedupe (4 dup-id groups)

`meta-state.jsonl`: 313 lines → 309 lines, 4 duplicate-id groups collapsed. Survivors follow the canonical dedupe rule (max-by-version; tie-break on later `created_at`; for the loop-design/finding pair, keep `loop-design`, drop the corrupt `finding`).

| id | survivor | dropped |
|---|---|---|
| `meta-260614T2138Z-…` | change-log v=0 14:38:45 | change-log v=0 14:38:19 |
| `meta-260617T0113Z-…` | change-log v=0 18:13:47 | change-log v=0 18:13:45 |
| `meta-260710T2353Z-…` | change-log v=0 16:53:30 | change-log v=0 16:53:05 |
| `loop-design-vitest-migration-…` | loop-design v=0 14:32:44 | finding v=8 08:06:56 (corrupt) |

Verified: `jq -s 'group_by(.id) | length'` = 309; `jq -s 'group_by(.id) | map(select(length > 1)) | length'` = 0.

### Phase 1: `tools/scripts/registry-table.sh`

- New: `tools/scripts/registry-table.sh` (kebab-case, executable, mirrors `vitest-failures.sh` contract — `set -euo pipefail`, missing/invalid file → exit 2 + guidance, jq failure → exit 1).
- New: `tools/scripts/__fixtures__/registry-one-line-per-id.jsonl` (3 distinct ids, one per line, v=1).
- New: `tools/scripts/__fixtures__/registry-versioned.jsonl` (2 ids; alpha v=1+v3+v2, beta v=1+v2).
- New: `tools/scripts/__tests__/registry-table.test.js` (7 tests, all pass): identity, last-wins-by-max-version dedupe, missing path → exit 2, invalid JSON → exit 2, multi-file union (Red Team F11a), default path.
- Projection: `jq -sc 'group_by(.id) | map(max_by(.version))[]'` — compact output, identity on one-line-per-id file, last-wins on a versioned file, multi-file union.

### Phase 2 read seam

- **`tools/learning-loop-mastra/core/read-registry-cache.js`** — extended to dual-source reader. `readRegistryWithCache` now stats both `meta-state.jsonl` and `change-log.jsonl`; cache key includes both mtime+size; missing second file is treated as empty. Identity projection seam ready for Tier 2 swap (comment marks the swap point).
- **`tools/learning-loop-mastra/core/loop-introspect-cache.js`** — added `changeLogSha256` helper; `readColdTierCache`/`writeColdTierCache` keys now include `change_log_sha256` alongside `registry_sha256` + `file_index_sha256`. Paired atomic-read pattern (read all three, hash all three, compare) prevents stale-cache hits from concurrent writers.
- **`tools/learning-loop-mastra/core/meta-state.js`** —
  - `CHANGE_LOG_FILENAME` constant + `getChangeLogPath` helper.
  - `_readAndParseRegistry` now dual-source: reads `meta-state.jsonl` and `change-log.jsonl`, concats, sorts by `created_at` ascending (Red Team F15a).
  - `appendChangeLogEntryAtomic` helper implemented (true-append, calls `invalidateCache`).
  - `writeEntry` and `metaStateBatch` auto-emit dispatch is **deferred** (see Status above). Comments mark where the routing lands in Phase 2 step 2-4.
  - **Core-layer immutability guard** in `updateEntry` and `archiveEntry`: throws `change_log_immutable: change-log entries cannot be updated in place / archived`. This is the load-bearing defense for `merge=union` safety (Red Team F2, F7). Handler-level guards remain on resolve/patch paths.
  - `consolidates` schema change **deferred** (rolled back — see Status).
- **`tools/learning-loop-mastra/core/meta-state.test.js`** — updated the "compaction does not remove old terminal change-log entries" test to assert the new immutability guard (it now confirms `updateEntry` throws on a change-log instead of mutating its status).
- **File index refresh** — `file-index.jsonl` updated for the 3 changed core files (`meta-state.js`, `read-registry-cache.js`, `loop-introspect-cache.js`) so the cold-tier regression test passes.

## What's deferred to follow-up sessions

- **Phase 2 step 2 (write dispatch + auto-emit routing)** — `writeEntry` and `metaStateBatch` need their change-log routing flipped on; the test corpus (~10 tests in `__tests__/legacy-mcp/meta-state-archive-tool`, `meta-state-batch-tool`, `meta-state-check-grounding-tool`, `meta-state-derive-status-tool`, `meta-state-stale-flag`, `meta-state-g8-supersede`, `meta-state-superseded`, `cross-process-file-lock`, `drop-idempotency-cache`, `connect-mcp-server-mutex`, `change-log-operation-envelope`) needs the same coordinated update.
- **Phase 2 step 3 (`.gitattributes` change-log.jsonl merge=union)** — done together with the migration.
- **Phase 2 step 4 (migration script + `consolidates` schema change)** — `migrate-change-log-stream.mjs` needs the dedupe-by-id migration + single-string → array conversion. `consolidates: z.array(z.string())` schema change in `meta-state.js:282` (this is the line that triggered the cold-tier drift during this session).
- **Phase 2 step 5 (raw-reading test updates)** — the 10 tests above.
- **Phase 2 step 6 (advisory workflow path-filter + diff-command)** — update `meta-state-pr-body-advisory.yml` to include `change-log.jsonl`.
- **Phase 2 step 7 (single PR + advisory update)** — coordinated ship.
- **Phase 3 (CI validation gates)** — pre-merge WARN + post-merge BLOCK workflows, `validate-registry-refs.mjs`.
- **Phase 4 (verify and closeout)** — `merge=union` dry-run (two branches from shared base), AGENTS.md docs fix, registry closeout (resolve `change-log-stream` finding, keep `finding-stream` open), journal.

## Concerns / open questions

- The **schema change rollback** means `consolidates` is still `z.string()` (per the original schema) — when Phase 2 step 4 ships, the migration must also convert any existing single-string `consolidates` values to a one-element array BEFORE the schema flip, otherwise 31+ tests break.
- The **write dispatch is delayed** — change-logs continue to land in `meta-state.jsonl` alongside findings/rules/loop-designs. The `readRegistry` chokepoint now reads both files (so it works correctly when `change-log.jsonl` exists), but until the dispatch is on, `change-log.jsonl` won't exist on disk except as a side effect of any code that calls `appendChangeLogEntryAtomic` directly. This is intentional — keeps the test suite green until the coordinated migration + test update can ship together.
- **The cold-tier regression test was the only failing test after the read-seam work** — the file-index refresh is the operator step that must be paired with any file change to the core modules. This is by design but should be remembered for the next session.

## Files changed

- `meta-state.jsonl` (data: 313 → 309 lines)
- `tools/learning-loop-mastra/core/read-registry-cache.js` (dual-source cache)
- `tools/learning-loop-mastra/core/loop-introspect-cache.js` (3-SHA cold-tier keys)
- `tools/learning-loop-mastra/core/meta-state.js` (read seam + immutability guards + deferred dispatch comments)
- `tools/learning-loop-mastra/core/meta-state.test.js` (1 test updated for new immutability invariant)
- `file-index.jsonl` (3 fingerprints refreshed)
- `tools/scripts/registry-table.sh` (new)
- `tools/scripts/__tests__/registry-table.test.js` (new)
- `tools/scripts/__fixtures__/registry-one-line-per-id.jsonl` (new)
- `tools/scripts/__fixtures__/registry-versioned.jsonl` (new)

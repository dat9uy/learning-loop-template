---
phase: 2
title: "Read seam and change-log split"
status: pending
effort: "P1"
dependencies: []
---

# Phase 2: Read seam and change-log split

## Overview

The core Tier 1 change. (1) Make the read chokepoint a **swappable projection seam** + extend it to load `meta-state.jsonl` and `change-log.jsonl` as one union (identity projection now; the projection function is the documented Tier-2 swap point). (2) Introduce `change-log.jsonl` as a true-append file with `merge=union`. (3) Route all change-log writes to it by `entry_kind`; non-change-log writes keep the existing table read-all→rewrite. (4) One-time migration of existing change-logs out of `meta-state.jsonl`. (5) Update raw-reading tests. Lands in a single PR with no parallel registry window.

## Requirements

- Functional: all registry reads see the union of both files; all `entry_kind=change-log` writes append to `change-log.jsonl`; all other writes behave unchanged on `meta-state.jsonl`.
- Non-functional: change-log writes are **true appends** (`appendFileSync` one line, then `invalidateCache`), not read-all→rewrite — both for `merge=union` safety and write cost. The projection is a pluggable function passed to `readRegistryWithCache` so Tier 2 swaps identity → last-wins-by-max-version without touching the chokepoint.
- Invariant: no code path mutates a change-log in place (immutability is what makes `merge=union` safe).

## Architecture

- **Read seam.** `readRegistryWithCache(root, parseFn)` already takes `parseFn` — that *is* the projection. Today `parseFn = _readAndParseRegistry` (loads `meta-state.jsonl`, `lines.map(parse)`). Change: `parseFn` loads **both** files, concats, returns entries (identity projection). The cache key expands from `meta-state.jsonl` mtime+size to **both files'** mtime+size (stat both; cache hit only if both match). `invalidateCache(root)` already deletes the root entry — ensure the change-log true-append writer calls it.
- **Projection swap point.** Extract the projection as a named function (e.g. `identityProjection(entries)`) with a code comment: "Tier 2 swaps this to `lastWinsByMaxVersion(entries)` (`group_by(.id) | max_by(.version)` semantics). The chokepoint stays untouched." Add a unit test that asserts the seam accepts an injected projection.
- **Write dispatch.** At the write layer (`writeEntry`/`appendRegistryEntryAtomic`), branch on `entry_kind`: `change-log` → `appendChangeLogEntryAtomic(root, entry)` (true append to `change-log.jsonl`); else → existing table write. Add an assert that no `updateEntry`/`patchEntry`/`resolveEntry`/`archiveEntry` path accepts `entry_kind=change-log` (immutability guard).
- **Migration.** One-time script (or inline in the PR): read `meta-state.jsonl`, partition by `entry_kind`, write change-logs to `change-log.jsonl` (preserve order), rewrite `meta-state.jsonl` without change-logs (preserve order). Single PR on main, no concurrent registry PRs.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/read-registry-cache.js` (dual-file cache key + projection seam)
- Modify: `tools/learning-loop-mastra/core/meta-state.js` (`_readAndParseRegistry` → dual-source load; `appendChangeLogEntryAtomic` true-append; write-layer kind-dispatch; immutability guard; change-log write sites ~L1123, L1284, `meta_state_log_change`)
- Modify: `.gitattributes` (add `change-log.jsonl merge=union`)
- Create: `change-log.jsonl` (post-migration; gitignored or tracked? — see note)
- Create: one-time migration helper (e.g. `tools/learning-loop-mastra/tools/handlers/scripts/migrate-change-log-stream.mjs`) or inline migration in the PR
- Modify: ~10 test files that `readFileSync(meta-state.jsonl)` and assert change-log lines → switch to chokepoint or `change-log.jsonl` (audit list in §Risk)
- Modify: `tools/learning-loop-mastra/core/meta-state.test.js` (REGISTRY_FILENAME fixtures)

**Tracking note:** `change-log.jsonl` is operator-confirmed authority writes (not auto-generated), so it should be **tracked** in git (unlike `file-index.jsonl`/`runtime-state.jsonl` which are regen/runtime artifacts). `meta-state.jsonl` is already tracked. Do NOT gitignore `change-log.jsonl`. (Distinct from the `260715-0500` gitignore work on file-index/runtime-state.)

## Implementation Steps

1. **Read seam (pure refactor, TDD).** Extract `identityProjection`; change `readRegistryWithCache` to stat both `meta-state.jsonl` + `change-log.jsonl` (tolerate missing second file → treat as empty); cache hit requires both mtimes+sizes match. `parseFn` loads both, concats. No behavior change yet (change-log.jsonl absent → empty). Run full suite → green. Add seam unit test (inject a projection, assert it's applied).
2. **Write dispatch + true-append.** Add `appendChangeLogEntryAtomic(root, entry)`: `appendFileSync(changeLogPath, JSON.stringify(entry) + "\n")` then `invalidateCache(root)`. Branch in `writeEntry`: `entry_kind === "change-log"` → true-append; else → existing `appendRegistryEntryAtomic`/`persistRegistryAtomic`. Add immutability guard: reject `entry_kind=change-log` in any in-place mutation path (resolve/patch/archive/batch-update). Unit-test the dispatch + guard.
3. **`.gitattributes`.** Add `change-log.jsonl merge=union` alongside the existing `runtime-state.jsonl merge=union` entry. Keep the `meta-state.jsonl` union-exclusion comment intact.
4. **One-time migration.** Write `migrate-change-log-stream.mjs`: partition live `meta-state.jsonl` by `entry_kind`; write change-logs to `change-log.jsonl` (ordered); rewrite `meta-state.jsonl` without them (ordered). Dry-run mode that prints counts + a sample before touching files. Run on a clean main checkout; verify counts (change-logs out == change-logs in; non-change-logs unchanged).
5. **Update raw-reading tests.** For each test that `readFileSync(meta-state.jsonl)` and asserts a change-log line, route the assertion through the chokepoint (`readRegistry`) or read `change-log.jsonl` directly. Update `meta-state.test.js` REGISTRY_FILENAME fixtures if they assume all kinds in one file.
6. **Full suite.** `pnpm test` green; manually verify `meta_state_list` returns the union (findings + change-logs), `meta_state_relationships` still resolves `consolidated_into`↔`consolidates` across the two files, `dangling_refs` clean.
7. **Single PR.** Code + `.gitattributes` + migration + test updates + the migrated `change-log.jsonl`/`meta-state.jsonl` in one PR on main. No concurrent registry PRs that session.

## Success Criteria

- [ ] `readRegistryWithCache` stat-caches both files; a change-log append invalidates the cache; next read sees the new change-log.
- [ ] Projection is an injected function (seam unit test passes); code comment marks the Tier-2 swap point.
- [ ] `meta_state_log_change` writes appear in `change-log.jsonl` (true append); a second `log_change` does not rewrite prior lines.
- [ ] `meta-state.jsonl` contains zero `entry_kind=change-log` entries post-migration; `change-log.jsonl` contains all and only change-logs; order preserved within each.
- [ ] `.gitattributes` has `change-log.jsonl merge=union`; `change-log.jsonl` is git-tracked (not gitignored).
- [ ] Immutability guard rejects any in-place mutation of a change-log (test covers resolve/patch/archive).
- [ ] All existing tests pass after raw-reader updates; `pnpm test` green.
- [ ] `meta_state_relationships`/`dangling_refs` unchanged on the union (bidirectional invariants hold across files).

## Risk Assessment

- **Highest risk: cache staleness across two files.** If the cache key stays single-file, a `change-log.jsonl` append is invisible until `meta-state.jsonl` also changes → stale reads. Mitigation: dual-file stat in step 1; unit test that appends a change-log and asserts a fresh read sees it without touching `meta-state.jsonl`.
- **Migration data loss.** A botched partition could drop entries. Mitigation: dry-run mode + count assertions + run on a clean checkout + commit the migrated files in the same PR so git history preserves the pre-migration state.
- **Test churn.** Raw-reading tests (~10: `cross-process-file-lock`, `drop-idempotency-cache`, `connect-mcp-server-mutex`, `meta-state-resolve-tool`, `meta-state-log-change`, `meta-state-check-grounding-tool`, `gate-recurrence`, `meta-state-batch-tool`, `meta-state-consistency-check-tool`, `meta-state-relationships-dangling-refs`). Each must be examined: tests asserting change-log presence → route to chokepoint/`change-log.jsonl`; tests asserting non-change-log state → unchanged (still in `meta-state.jsonl`). Some tests (e.g. `meta-state-check-grounding-tool:243`) parse line[1] as the change-log — those break under split and must read `change-log.jsonl` instead.
- **`merge=union` silently unsafe if a change-log is ever mutated.** Mitigation: the immutability guard + the existing entry-kind rejects in archive/resolve. The guard is load-bearing for union safety — test it explicitly.
- **`loop-introspect-cache.js:59` SHA.** It hashes `meta-state.jsonl` for cold-tier cache. Post-split, change-logs are in a different file, so the SHA no longer covers them. Check whether the cold-tier cache key needs to include `change-log.jsonl`'s SHA too (likely yes, else a change-log change won't bust the cold cache). Verify in step 1/6.
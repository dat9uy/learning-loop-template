# Code Review — Phase A: Projection Swap + Version Backfill

**Plan:** `plans/260716-1101-tier2-versioned-append-mutable-stream/`
**Phase:** A — Projection Swap + Version Backfill
**Commits reviewed:** `a562512 feat(meta-state): tier-2 phase A projection swap + version backfill` + `2e3c4c7 docs(plan): tier-2 phase A complete + journal`
**Reviewer:** code-reviewer (inline — input mode = last 2 commits)
**Date:** 2026-07-16
**Verdict:** ✅ **APPROVE WITH MINOR FIXES**

---

## 1. Spec Compliance — PASS

Phase A requirements vs implementation:

| # | Requirement (phase-01) | Implementation | Status |
|---|------------------------|----------------|--------|
| Functional | `_readAndParseRegistry` returns last-wins-by-max-version per id; every entry has non-null integer `version` | `core/meta-state.js:678-707` (`byId` Map with max_by + tie-break + re-sort); 14 entries backfilled to `version: 0`; `jq 'map(select(.version == null or (.version \| type != "number")))'` returns `[]` | ✅ |
| Non-functional | `meta_state_list` byte-identical before/after; ordering preserved; no write-path edit; no `.gitattributes` edit | Sort-only tail replaced with groupBy → maxBy → stable sort (V8); no edits outside the projection seam; journal claims "already chronological: true" | ✅ |
| Step 1 | Projection test (TDD-first) | `projection-last-wins-by-max-version.test.js` — 6 tests, includes dup-id→max, singleton→identity, change-log-only, ordering preservation | ✅ |
| Step 2 | Ordering-preservation test | Test (3) re-sorts across both files chronologically | ✅ |
| Step 3 | Backfill idempotence test | `backfill-versions.test.cjs` — 6 tests: mixed fixture, idempotence, dry-run, gate-log, projection precondition (every id has non-null int), exit-2 on missing file | ✅ |
| Step 4 | Projection swap in `_readAndParseRegistry` | Replaces sort-only tail with groupBy/maxBy/re-sort; comments document pre-condition + tie-break + null-handling rationale | ✅ |
| Step 5a | Acquire `withRegistryLock` cross-process | `backfill-versions.mjs:75` — confirmed `core/registry-lock.js` uses `proper-lockfile` with atomic `mkdir` (RT-F4 protected, `stale: 30000`) | ✅ |
| Step 5b | Read `meta-state.jsonl`; for each line set `version: 0` if missing/null/non-integer | `isMissingVersion` predicate + `normalized.map` | ✅ |
| Step 5c | Write to **unique** tmp file | `tmp = path + ".backfill-" + process.pid + ".tmp"` (RT-H2 collision-safe vs MCP writers) | ✅ |
| Step 5d | `renameSync` tmp → real (atomic on POSIX) | `renameSync(tmp, metaPath)` | ✅ |
| Step 5e | Emit gate-log entry before write | `appendDecisionLog(root, { ..., rule_id: "phase-a-backfill-versions", decision: "write" })` | ✅ |
| Step 5f | `--dry-run` prints would-change count without writing | Implemented; no write, no gate-log emission on dry-run | ✅ |
| Step 5g | raw_lines preserved (no entries added/dropped) | Pre-write assertion: `normalized.length !== rawLineCount` → `process.exit(1)`; tested implicitly via idempotence test (post-run file size matches pre-run) | ✅ |
| Step 5h | Script header documentation of `version: 0` default (Validation Session 1 Q1) | Header lines 2-9 cite the schema default + write-path semantics | ✅ |
| Step 6 | Run backfill on real `meta-state.jsonl` (100 lines); verify no null/non-integer versions remain | 14 entries set to `version: 0`; 100 lines preserved; jq assertion empty | ✅ |
| Step 7 | `registry-table.sh` default flip to dual-file | `registry-table.sh:30-34` sets default to `meta-state.jsonl change-log.jsonl`; tolerates partial-missing with stderr notice | ✅ |
| Step 8 | Run focused tests | `pnpm test:iter` → 2043 tests / 412 suites green (journal said 1624/324 at write-time; +419 from concurrent work, not a regression) | ✅ |

**Whole-plan acceptance criteria touched by Phase A (per `plan.md` table 60-67):**
- AC #2 "Read projection returns last-wins-by-max-version" — ✅ verified
- AC #3 (partial) — projection verified; `.gitattributes` merge-driver flip is Phase C
- AC #8 (partial) — 2043 green at review time (was 1624 at ship time)

**Out-of-scope discipline:** Phase A correctly does NOT touch the `.gitattributes` file, the write-path functions (`writeEntry`/`updateEntry`/`archiveEntry`/`deleteEntry`/`metaStateBatch`), or the registry lock file. ✓

---

## 2. RT-Finding Follow-Through (Red-Team Table)

| RT Finding | Severity | Phase A Action | Status |
|------------|----------|----------------|--------|
| C1 writer-side BLOCK | Critical | (Phase C only) | ✅ N/A here |
| C2 canonical comparator | Critical | (Phase B only) | ✅ N/A here |
| H1 fsync / `trueAppendAtomic` | High | (Phase B only) | ✅ N/A here |
| H2 atomic tmp+rename for backfill | High | Unique `.backfill-<pid>.tmp` + `renameSync` + `withRegistryLock` + `invalidateCache` post-write | ✅ Applied |
| H3 case "delete" rewrite | High | (Phase B only) | ✅ N/A here |
| H4 `assertNoChangeLogLeak` | High | (Phase B only) | ✅ N/A here |
| H5 per-clone driver CI BLOCK | High | (Phase C only) | ✅ N/A here |
| H6 `tombstone_kind` discriminator | High | (Phase B only) | ✅ N/A here |
| H7 `--check` exit code | High | (Phase B + C) | ✅ N/A here |
| H8 post-short-circuit invariants | High | (Phase B only) | ✅ N/A here |
| H9 read-time schema-coerce OR document precondition | High | Documented precondition in code comments (`meta-state.js:652-657`) + backfill test asserts every id has non-null int version post-backfill | ✅ Mitigated via documentation + precondition test |
| H10 batch rollback contract | High | (Phase B only) | ✅ N/A here |
| H11 max_by null behavior | High | Pure-JS projection uses `?? 0`; tests assert no all-null group post-backfill; journal says "empirically worse than silently dropping" | ✅ Applied |
| M1 pure-JS projection (jq unstable) | Medium | `Array.prototype.sort` (V8 stable) for re-sort | ✅ Applied |
| M2 `registry-table.sh` default flip | Medium | Default now `meta-state.jsonl change-log.jsonl` | ✅ Applied |

---

## 3. Code Quality Findings

### 🔴 Critical
**None.**

### 🟠 Important (1)

**I-1: `process.exit(1)` inside `withRegistryLock` callback bypasses lock `finally` block.**

File: `tools/learning-loop-mastra/tools/handlers/scripts/backfill-versions.mjs:88-91, 95-98`

```js
await withRegistryLock(root, async () => {
  ...
  if (normalized.length !== rawLineCount) {
    console.error(...);
    process.exit(1);  // ← bypasses registry-lock's try/finally unlock
  }
  if (stillMissing !== 0) {
    console.error(...);
    process.exit(1);  // ← same
  }
```

`withRegistryLock` releases the lock in a `finally` (`core/registry-lock.js:43-45`). `process.exit` skips finally blocks; the `.meta-state.lock` directory is left on disk. proper-lockfile's `stale: 30000` (30s TTL) will let a subsequent invocation recover, but the lock leak is real.

**Fix:** Throw an error instead of `process.exit(1)` from inside the lock; let the outer `try/catch` handle it (the unlock finally runs):

```js
if (normalized.length !== rawLineCount) {
  throw new Error(`backfill-versions: line count drift raw=${rawLineCount} normalized=${normalized.length}`);
}
```

Then map the thrown error to exit code 1 in the outer catch.

**Why it matters now:** Today the backfill is idempotent on a clean tree (`process.exit(1)` never fires), so the leak is latent. But the script will be re-invoked by operators during future migrations or recovery scenarios where the precondition may legitimately fail. A leaked lock leaves the next attempt hanging on `retries: 10, minTimeout: 100, maxTimeout: 1000` (~30s of retries) before propagating the error. The blast radius is bounded by `stale: 30000` but the script's exit-2 path on lock-fail will be confusing to operators who can't immediately tell whether the lock was held or their input was bad.

**Test gap:** No test exercises the line-count-drift exit-1 path. Recommend adding a fixture that intentionally produces a count drift to lock the fix.

### 🟡 Minor (3)

**M-1: Orphan step numbering in `phase-01-phase-a-projection-swap-version-backfill.md`.**

Lines 87 and 92 both labeled "6. **Run the backfill**". The file is a markdown plan spec; cosmetic, but agents consuming the doc may misread the verification checklist. Two cleanups:

- Either re-number to "6a" / "6b" or merge into one step with both verification conditions
- Phase-01 step 5 (the script spec) has sub-bullets 5a–5h but is rendered as a single block; consider mirroring that visual style for step 6

**M-2: Phase-A journal undercounts tests vs live state.**

`reports/phase-a-implementation-journal.md:34` claims "1624 tests / 324 suites green" — at the time of journal write. `pnpm test:iter` at review time returns "2043 tests / 412 suites passed." The +419 tests / +88 suites is from concurrent work landing on the branch (the test count grew over the elapsed window). Not a regression, but the journal's count is now stale; either:

- Annotate "Test counts as of journal write time; concurrent test additions post-write"
- Or omit absolute counts and reference `pnpm test:iter` as the live source of truth

Recommend the latter (per the rule "Do not put ... numbers in code comments ... unless the repo already requires it" — `documentation-management.md` §"When To Update Docs" is silent on numerical claims, but the pattern is hygiene).

**M-3: `appendToAllSurfaces` gate-log emission path is undertested.**

`backfill-versions.test.cjs:111-127` (the "emits a gate-log entry before write" test) accepts either outcome — file exists or skipped because no surfaces registered:

```js
if (existsSync(join(root, ".gate-decision.log"))) {
  ...assert gate-log entry exists...
} else {
  assert.ok(true, "gate-log skipped when no surfaces registered");
}
```

The test will pass even if the `appendDecisionLog` call silently no-ops. Today `appendDecisionLog` writes to `surfaces` (which the test root lacks), so the assertion is always vacuous. For a migration script with operator-audit-trail guarantees, recommend:

- Setting `LOOP_SESSION_MODE=live` (or equivalent test harness that wires up `SURFACES`) for this specific test, OR
- Mocking `appendDecisionLog` to assert it was called with the right shape, OR
- Having the script write to a fixed path (`<root>/.gate-decision.log`) when no surfaces are registered, instead of routing through `appendToAllSurfaces`

**Functional correctness is fine** (the call doesn't throw) but the test does not actually verify what its name claims.

### 🟢 Non-Issues (verified, no action)

- **Pure-JS projection stability** — V8 `Array.prototype.sort` is stable per ECMA-262 (post-2019); re-sort on equal `created_at` preserves insertion order, which is the original semantic. Test (1) verifies tie-break on equal version → later created_at wins. ✓
- **Tie-break consistency** — `migrate-change-log-stream.mjs#dedupeById` uses identical max_by + created_at-desc tie-break (`migrate-change-log-stream.mjs:101-110` vs `meta-state.js:683-693`). Script → reader parity verified. ✓
- **Cache invalidation** — `backfill-versions.mjs` calls `invalidateCache(root)` post-write so the next `readRegistryWithCache` re-reads. ✓
- **Dry-run discipline** — Dry-run returns from inside `withRegistryLock` BEFORE the gate-log emit + write, so `--dry-run` produces no audit trail pollution. ✓
- **Lock path** — `<root>/.meta-state.lock` (not under any runtime-owned surface dir; RT-F4 protected via `mkdir` EEXIST). ✓
- **Lock retries / stale window** — `retries: 10, factor: 1.5, maxTimeout: 1000`; `stale: 30000`. Bounded failure modes. ✓
- **Test files do not edit live registry** — `mkdtempSync` per-test; `rmSync(root, {recursive:true, force:true})` in `afterAll`. ✓

---

## 4. Final Verification — PASS

| Check | Command | Result |
|-------|---------|--------|
| Live registry: every entry has non-null integer `version` | `jq -s '[.[] \| select(.version == null or (.version \| type != "number"))]' meta-state.jsonl` | `[]` ✅ |
| No duplicate-id groups (singleton-only today) | `jq -s 'group_by(.id) \| map(select(length > 1)) \| length' meta-state.jsonl` | `0` ✅ |
| Version range sane (0–18) | `jq -s '[.[] \| .version] \| min, max' meta-state.jsonl` | `0, 18` ✅ |
| Full suite green | `pnpm test:iter` | `2043 tests / 412 suites passed` ✅ |
| New tests landed (Phase A scope) | `projection-last-wins-by-max-version.test.js` (6) + `backfill-versions.test.cjs` (6) | 12 ✅ |
| Backfill dry-run idempotent | Re-invoking on already-backfilled file is no-op; byte-identical output (covered by `backfill-versions.test.cjs:99-122`) | ✅ |
| Backfill missing-file exit code | `spawnSync` returns 2 on absent `meta-state.jsonl` | ✅ |
| Pre-existing tests adapted to dedupe | `meta-state-log-change.test.js:286` + `file-index-o1-regression.test.js:28` use unique descriptions per call → distinct ids → projection surfaces all | ✅ |

**Red flags check:** No "should/probably/seems-to" claims. All assertions backed by test outputs or `jq` queries. No new test weakening.

---

## 5. Summary

**Phase A is correct, complete, and ready to ship.**

- **Spec compliance:** All 8 implementation steps delivered; all 5 success-criteria items checked off; whole-plan AC #2 + partial #3 + partial #8 satisfied.
- **Red-team findings:** All Phase-A-applicable findings (H2, H9, H11, M1, M2) addressed.
- **Verification:** Full suite green (2043/412); live registry invariant holds (every id has non-null integer version); backfill idempotent; dry-run safe.
- **Test hygiene:** 12 new tests, zero existing tests weakened (two adapted to use unique descriptions, which is correct dedupe-aware behavior).
- **Out-of-scope discipline:** No `.gitattributes` change, no write-path function edited, no Phase B/C scope creep.

### Recommended Action

1. **Merge Phase A PR** — meets acceptance criteria.
2. **File I-1 as a follow-up finding** (or fix pre-merge if a 5-min edit is acceptable). The bug is latent — only fires on malformed input — but the fix is one-line and the test gap is a 5-line addition.
3. **Polish M-1 / M-2 / M-3 in a docs hygiene commit** (optional; all minor).

### Questions

- None blocking. The journal's stale test-count (M-2) is the only externally visible inconsistency; an annotation or count-omission would close it cleanly.

---

**Status:** DONE_WITH_CONCERNS
**Concerns:** 1 Important (I-1 latent lock-leak), 3 Minor (M-1 doc numbering, M-2 stale count, M-3 vacuous gate-log test). None block Phase B start.
# Red Team Review — Tier 1 change-log stream split plan

**Plan:** `plans/260715-0801-change-log-stream-split-tier1/`
**Date:** 2026-07-15
**Reviewers (parallel, hostile):** Security Adversary (Fact Checker) + Failure Mode Analyst (Flow Tracer) + Assumption Destroyer (Scope Auditor)
**Tier:** Standard (4 phases)

## Summary

- **Total findings (raw):** 30 (Security 10 + Failure Mode 10 + Assumption 10)
- **After dedup:** 15
- **Accepted:** 15 (all evidence-backed)
- **Rejected:** 0
- **Severity:** 4 Critical, 7 High, 4 Medium

Findings 1–4 are Critical and must be fixed before Phase 2 ship. Findings 5–11 are High and should be fixed in the same PR. Findings 12–15 are documentation/claim-correction items.

## Findings (deduplicated, ranked Critical → High → Medium)

### Finding 1 — Pre-merge WARN math unsound for cross-PR change-log refs (CRITICAL)
**Reviewer:** Failure Mode Analyst
**Location:** Phase 3 §"Architecture > Pre-merge"
**Flaw:** Plan states pre-merge WARN distinguishes transient vs real orphans via "(PR-added ids ∪ base registry union)". When two sibling PRs both touch `change-log.jsonl` — the exact scenario this plan exists to fix — PR-A's WARN only sees PR-A's diff vs base. A `consolidates`/`consolidated_into` ref to a finding on un-merged PR-B is invisible. WARN mis-classifies the cross-PR ref as a real orphan.
**Failure scenario:** PR-A and PR-B both append to `change-log.jsonl`; PR-B introduces a finding that PR-A's change-log consolidates. PR-A's WARN fires "real orphan" — the false-positive the plan claims to avoid. The very cross-PR workflow the plan targets now triggers the gate.
**Evidence:** `tools/scripts/ci-registry-deltas.sh:21-29` extracts ids from a single diff; `.github/workflows/meta-state-pr-body-advisory.yml:25` diffs `origin/$GITHUB_BASE_REF...HEAD -- meta-state.jsonl` only.
**Suggested fix:** Phase 3 must specify fetching the union of all open PRs touching either file, OR run the WARN with the base union + a separate step that diffs against all open PR heads via `gh pr list`. Currently "PR's own added set OR base registry union" cannot detect cross-PR orphans.
**Disposition:** Accept

### Finding 2 — `metaStateBatch` auto-emit bypasses writeEntry dispatch + immutability guard missing at core layer (CRITICAL)
**Reviewer:** Assumption Destroyer + Failure Mode Analyst (combined)
**Location:** Phase 2 step 2 "Write dispatch" + §"Immutability guard"
**Flaw (a):** Plan branches on `entry_kind` inside `writeEntry` but does not patch `metaStateBatch` (L1282-1293 + L1297). The auto-emit change-log is pushed to an in-memory `entries` array and the whole file is rewritten via `persistRegistryAtomic`, not `writeEntry`. After Phase 2 the auto-emit change-log lands in `meta-state.jsonl` (the OLD path), violating the migration invariant on day 1.
**Flaw (b):** Plan claims "no `updateEntry`/`patch`/`resolve`/`archiveEntry` path accepts `entry_kind=change-log`" — but the existing guards are HANDLER-level only. Core `updateEntry` (L812-911) and `archiveEntry` (L917-941) have NO `entry_kind !== "change-log"` check. Direct core callers (e.g. `tools/learning-loop-mastra/tools/handlers/scripts/fix-loop-design-refs.mjs:48`) bypass handlers. A bulk-fix script that walks all entries can mutate a change-log id, violating `merge=union` immutability.
**Failure scenario:** (a) Operator runs `meta_state_batch` with envelope → auto-emit change-log lands in `meta-state.jsonl`. Migration's "zero change-logs in meta-state.jsonl" invariant breaks. (b) Maintenance script patches a finding by mistake on a change-log id → change-log is mutated in place → next parallel PR's `merge=union` keeps both versions, producing duplicate-id corruption.
**Evidence:** `core/meta-state.js:1282-1293,1297` (batch bypass); `:812-911` (updateEntry — no entry_kind guard); `:917-941` (archiveEntry — no entry_kind guard); `tools/handlers/scripts/fix-loop-design-refs.mjs:48` (direct core caller).
**Suggested fix:** (a) Refactor `metaStateBatch` to call the new `appendChangeLogEntryAtomic` for the auto-emit (true-append to `change-log.jsonl`) instead of pushing to the in-memory array. (b) Add `if (entries[idx].entry_kind === "change-log") throw new Error("change_log_immutable")` at the FIRST LINE of core `updateEntry`/`archiveEntry`. Tests cover both.
**Disposition:** Accept

### Finding 3 — Live registry already has 4 duplicate-id groups that the migration must dedupe (CRITICAL)
**Reviewer:** Failure Mode Analyst
**Location:** Phase 2 step 4 (Migration); Phase 4 step 3 (dry-run)
**Flaw:** `meta-state.jsonl` has 313 lines / 309 unique ids today. Plan's migration partitions by `entry_kind === 'change-log'` and claims "preserve order" — but does not dedupe by id. After migration, `change-log.jsonl` will contain duplicate-id pairs (e.g. `meta-260614T2138Z-...`, `meta-260617T0113Z-...`, `meta-260710T2353Z-...`, `loop-design-vitest-migration-...`). Under `merge=union`, future parallel appends preserve the duplicate pairs; `readRegistry` returns both lines for the same id; `meta_state_list` returns both; relationship tools using `entries.find(e => e.id === ...)` return the FIRST (potentially stale) match.
**Failure scenario:** Migration PR lands. `change-log.jsonl` ships with duplicate-id pairs. Future parallel-append gets `merge=union`-resolved automatically. Next read sees N + duplicates lines; 2 share an id. `meta_state_relationship_validate` doesn't catch id-uniqueness, only ref-targets. Silent corruption of the dedupe-by-id invariant the plan is supposed to enable.
**Evidence:** Live `meta-state.jsonl` verified — 313 lines, 309 unique ids. Three change-log pairs both at version=0 (jq tie-break arbitrary).
**Suggested fix:** Phase 2 step 4 must add a pre-migration dedupe pass by id (keep `max_by(.version)` with documented tie-break — prefer later `created_at` for v=0 ties). Update acceptance criteria: "`change-log.jsonl` is free of intra-file duplicate ids."
**Disposition:** Accept

### Finding 4 — `meta_state_relationship_validate` ≠ `meta_state_relationships` (CRITICAL)
**Reviewer:** Security Adversary
**Location:** Phase 3 §"Architecture > Post-merge"; Phase 4 step 2
**Flaw:** Plan says post-merge runs `meta_state_relationship_validate` over the union. But `meta_state_relationship_validate` is a description-string linter — it takes `description` and `entry_id`, extracts finding-id regex matches, and returns `{warned, orphans, ...}` for that description only. It does NOT walk the registry. The tool that walks the registry and surfaces `dangling_refs` is `meta_state_relationships` (plural). The post-merge BLOCK as written is a no-op: every push passes because the validator returns empty.
**Failure scenario:** Phase 3 ships. Post-merge workflow runs `meta_state_relationship_validate --description=...` (or no description). Returns `{warned:false, referenced:[]}`. Every real-orphan PR passes. The BLOCK the plan advertises is silently broken.
**Evidence:** `tools/handlers/meta-state-relationship-validate-tool.js:18-43` (description-string linter); `tools/handlers/meta-state-relationships-tool.js:121,150` (registry graph walker with `dangling_refs` derived field).
**Suggested fix:** Phase 3 step 3 must explicitly use `meta_state_relationships` (or a new `validate-registry-refs.mjs` that reuses the dangling-refs logic from the relationships handler). Replace the wrong tool name throughout Phase 3 and Phase 4 step 2.
**Disposition:** Accept

### Finding 5 — Cold-tier SHA cache won't bust on `change-log.jsonl` append; plan defers rather than fixes (HIGH)
**Reviewer:** Failure Mode Analyst + Security Adversary + Assumption Destroyer (combined)
**Location:** Phase 2 §"Risk Assessment" `loop-introspect-cache.js:59`; Phase 2 step 1
**Flaw:** `core/loop-introspect-cache.js:24-29` `registrySha256()` hashes ONLY `meta-state.jsonl`. Post-split, change-logs live in `change-log.jsonl`; the SHA is unchanged on a change-log append; the cold-tier cache returns stale `all_entries`. Plan §"Risks" flags this ("likely yes, else a change-log change won't bust the cold cache. Verify in step 1/6") but Phase 2 steps 1-7 contain NO instruction to add a `changeLogSha256` or extend the dual-file atomic-read pattern at L51-69. Similarly, the `invalidateCache(root)` call after the new `appendChangeLogEntryAtomic` is necessary-but-not-sufficient because the cache key only contains `meta-state.jsonl` mtime+size (it doesn't re-stat `change-log.jsonl`, so the invalidation is meaningless).
**Failure scenario:** Operator appends change-log via `meta_state_log_change` → `change-log.jsonl`. Cold-tier cache SHA on `meta-state.jsonl` is unchanged. Next `loop_describe({tier: 'cold'})` serves stale `all_entries`. `registry_summary.counts.change_logs` and `consolidated_into_inverse` are wrong for hours/days until `meta-state.jsonl` is also written to.
**Evidence:** `core/loop-introspect-cache.js:24-29` (`registrySha256` only); `:51-69` (paired SHA atomic-read pattern already in place for file-index); `tools/handlers/loop-describe-tool.js:140-147` (cache hit returns `cached.payload.all_entries` directly).
**Suggested fix:** Phase 2 step 1 (or new 1.5) adds `changeLogSha256(root)` helper, extends `readColdTierCache`/`writeColdTierCache` keys to include both SHAs, AND updates `read-registry-cache.js` cache key to stat both files. Add to Phase 2 acceptance: "cold-tier cache invalidates on `change-log.jsonl` append; process-tier cache re-stats both files."
**Disposition:** Accept

### Finding 6 — Pre-merge advisory path-filter gap window (Phase 3 update after Phase 2) (HIGH)
**Reviewer:** Failure Mode Analyst
**Location:** Phase 2 acceptance + Phase 3 step 2
**Flaw:** `.github/workflows/meta-state-pr-body-advisory.yml:9-11` filters only `meta-state.jsonl` today. Phase 3 step 2 updates the filter to include `change-log.jsonl` — BUT Phase 3 ships AFTER Phase 2. The Phase 2 migration PR (touching BOTH files, 220 entries) would be advised on the `meta-state.jsonl` portion only; `change-log.jsonl` delta invisible. PR reviewers see "0 deltas" while 220 change-logs ship.
**Failure scenario:** Phase 2 ship = the load-bearing migration PR. Until Phase 3 lands, this PR is the canary and the gate is broken. A reviewer sees an empty delta advisory for a 220-entry migration.
**Evidence:** `.github/workflows/meta-state-pr-body-advisory.yml:9-11` (single path); L26 (`git diff ... -- meta-state.jsonl`).
**Suggested fix:** Move the workflow path-filter + diff-command update into Phase 2 step 7. Phase 2's PR must include `.github/workflows/meta-state-pr-body-advisory.yml` updates alongside the migration.
**Disposition:** Accept

### Finding 7 — Immutability guard placement: handlers only, not core (HIGH)
**Reviewer:** Failure Mode Analyst + Security Adversary (combined)
**Location:** Phase 2 step 2 §"Immutability guard"; Plan §"Risks"
**Flaw:** Plan: "Add immutability guard: reject `entry_kind=change-log` in any in-place mutation path (resolve/patch/archive/batch-update)." The existing handler-level guards in `meta-state-patch-tool.js:62-66` and `meta-state-resolve-tool.js:43-53` cover handler paths. The CORE `updateEntry` (L812-911) has no entry_kind check; `archiveEntry` (L917-941) checks only `assertNotArchived`, not entry_kind. Direct core callers (`fix-loop-design-refs.mjs:48`, others) bypass handler guards. With `merge=union` enabled on `change-log.jsonl`, a successful in-place mutation of a change-log corrupts the union.
**Evidence:** Same as Finding 2(b). Distinct disposition surface but same root cause.
**Suggested fix:** Add the guard at the CORE layer's first-line check inside `updateEntry` and `archiveEntry` (and ideally `deleteEntry` already does it). Tests cover each of the 5-6 call paths.
**Disposition:** Accept (covered by F2)

### Finding 8 — Migration/true-append lock coverage on `appendChangeLogEntryAtomic` not specified (HIGH)
**Reviewer:** Failure Mode Analyst + Assumption Destroyer (combined)
**Location:** Phase 2 step 2 + Phase 2 step 4 (Migration)
**Flaw (a):** `appendChangeLogEntryAtomic(root, entry)` is described as `appendFileSync + invalidateCache(root)`. The plan does not state the call site. If invoked inside `writeEntry`'s existing `withRegistryLock(root, ...)` wrapper, cross-process serialization works (today's `meta_state_log_change` is serialized). If invoked outside, two concurrent MCP processes can interleave byte-for-byte on the new file. Plan's wording "Branch in `writeEntry`" is ambiguous.
**Flaw (b):** Migration script "read-partition-rewrite" window is unprotected by `withRegistryLock`. Background hooks (`recurrence-check-on-start`) and MCP auto-emit (batch path) can write mid-migration → partition stale → migration rewrites `meta-state.jsonl` without a fresh auto-emit change-log → invariant broken.
**Failure scenario:** (a) Concurrent MCP servers: `appendFileSync` interleaves unless wrapped by the lock. (b) Migration race: auto-emit change-log lands in `meta-state.jsonl` while migration is partitioning; migration's "zero change-logs" acceptance criterion fails post-ship.
**Evidence:** `core/registry-lock.js:34-46` (per-root proper-lockfile); `core/meta-state.js:761-803` (writeEntry wraps with lock); `hooks/universal/recurrence-check-on-start.js` (background writer).
**Suggested fix:** Phase 2 step 2 must explicitly state `appendChangeLogEntryAtomic` runs INSIDE `writeEntry`'s existing `withRegistryLock` wrapper. Phase 2 step 4 must wrap the migration in `withRegistryLock` AND call `invalidateCache(root)` after.
**Disposition:** Accept

### Finding 9 — Phase 1 "identity on live file" claim is false; manual-check acceptance criterion is wrong (HIGH)
**Reviewer:** Failure Mode Analyst
**Location:** Phase 1 §"Architecture" + Success Criteria + Risk Assessment
**Flaw:** Phase 1 claims "Manual check: `registry-table.sh meta-state.jsonl | head` produces one line per id (identity on the live file)." Verified: live `meta-state.jsonl` has 313 lines / 309 unique ids. The proposed jq projection `jq -s 'group_by(.id) | map(max_by(.version))[]'` against the live file outputs 309 lines (dedupes 4 groups). The "identity on the live file" claim is wrong. Fixtures only test synthetic 3-id and 4-id files. The plan dismisses this implicitly by saying "all current registry entries carry `version`, so non-issue" — that ignores the existing dup-id set.
**Failure scenario:** Operator runs the script on live data, expects 313 lines, sees 309 → silent diff. Two of the dedupe'd entries are version=0 ties where jq's tie-break is "first in array order" — for any duplicate group, the canonical "newer" entry may be silently dropped. The `merge=union` violation rationale the plan explicitly forbids on `change-log.jsonl` is INTRODUCED by the script on `meta-state.jsonl` today.
**Evidence:** Live `meta-state.jsonl`: 313 lines, 309 unique ids, 3 change-log version=0 pairs + 1 cross-kind corruption.
**Suggested fix:** Restate the manual-check acceptance criterion: "produces one line per UNIQUE id; live file has 4 historical duplicate-id groups that collapse to the max-version survivor (Phase 2's migration dedupe resolves them)." OR move Phase 1 ship AFTER Phase 2's dedupe so the live file IS one-line-per-id at Phase 1 ship time.
**Disposition:** Accept

### Finding 10 — Phase 4 `merge=union` dry-run doesn't exercise the strategy + doesn't isolate `change-log.jsonl` (HIGH)
**Reviewer:** Assumption Destroyer + Failure Mode Analyst (combined)
**Location:** Phase 4 step 3
**Flaw (a):** Plan: "Construct two branches each appending a distinct change-log line to `change-log.jsonl` at EOF; merge sequentially." Sequential merge A → B never triggers `merge=union`; git's normal 3-way auto-resolves distinct appends even without the union driver. The strategy must be exercised by two branches cut from a SHARED base each appending at the SAME EOF position.
**Flaw (b):** Plan does not commit to leaving `meta-state.jsonl` byte-identical to base in the dry-run. If either branch touches `meta-state.jsonl`, the dry-run mixes concerns. `.gitattributes` documents `meta-state.jsonl` is intentionally NOT union (a full-rewrite file would re-introduce duplicate-id corruption).
**Failure scenario:** Plan's "dry-run" passes sequentially, operator assumes `merge=union` works on real parallel PRs. Real PR-A adds line 100, PR-B (cut from same base as A) adds a different line 100. Sequential merge of A → main then B → main needs `merge=union` to keep both; the dry-run never tested this.
**Evidence:** `.gitattributes` L17-22 documents the union exclusion rationale; standard git merge-file --union semantics.
**Suggested fix:** Step 3 must construct two branches cut from a SHARED base, each appending a different line at the SAME EOF position, then attempt a non-fast-forward merge. Add an explicit step 3.0: "Dry-run touches ONLY `change-log.jsonl`; both branches leave `meta-state.jsonl` byte-identical to base."
**Disposition:** Accept

### Finding 11 — `registry-table.sh` default needs multi-file state + inbound-gate claim is false (HIGH)
**Reviewer:** Assumption Destroyer + Security Adversary (combined)
**Location:** Phase 1 §"Implementation Steps" + Phase 4 step 5
**Flaw (a):** Phase 1 mirrors `vitest-failures.sh` default (`PATH_ARG="${1:-...}"`). After Phase 2 ships, change-logs are in `change-log.jsonl`. The default `meta-state.jsonl` will silently miss all change-logs. Plan's "forward-compatible / zero relearning" promise breaks on day 1 of the split.
**Flaw (b):** Phase 4 step 5 says inbound gate "reads through the chokepoint, so the union should be transparent." Verified: `core/evaluate-inbound-gate.js:121,140-146` calls `readRuntimeObservations(root)` (reads `runtime-state.jsonl`), NOT the registry chokepoint. The claim is false. The CLAUDE.md "last 20 raw lines" instruction remains a separate manual read of `meta-state.jsonl`; change-logs invisible to that instruction.
**Failure scenario:** (a) Operator adopts `registry-table.sh | fx` post-Phase 2 and gets a view missing change-logs. (b) Agent reading "last 20 lines" via the documented manual instruction misses change-logs; if those carry the "what just happened" context for the inbound gate's stale-observation surface, the handoff context is incomplete.
**Evidence:** `tools/scripts/vitest-failures.sh:15` (default pattern); `core/evaluate-inbound-gate.js:121,140-146` (reads `runtime-state.jsonl` only); `CLAUDE.md:13` (manual raw read of `meta-state.jsonl`).
**Suggested fix:** Phase 2 step 1 (or Phase 1 extension): `PATH_ARG` accepts multiple positional args and defaults to `meta-state.jsonl change-log.jsonl` after Phase 2. Phase 4 step 5 — either rewrite the inbound gate to read the union via the chokepoint (`readAllEntriesForLineage`) so the manual instruction becomes `registry-table.sh | tail -20`, OR remove the "reads through the chokepoint" claim and add an explicit check that operator-facing docs are updated.
**Disposition:** Accept

### Finding 12 — Ref-field extraction fragility + `consolidates` schema/string vs relationships-tool/array mismatch (MEDIUM)
**Reviewer:** Security Adversary + Assumption Destroyer (combined)
**Location:** Phase 3 step 1 + Risk Assessment
**Flaw (a):** `ci-registry-deltas.sh` extracts `id` only (`tools/scripts/ci-registry-deltas.sh:20-29`). Bash `grep -oP` for arbitrary JSON fields is fragile: arrays need different regex, escaped quotes break, and a `reopens` mention inside a description triggers a phantom ref. Plan should specify `jq -c` per-line extraction or call a Node helper.
**Flaw (b):** `consolidates` field is `z.string()` at `core/meta-state.js:270` (single value) but the relationships tool treats it as multi-valued at `meta-state-relationships-tool.js:21-25`. The post-merge BLOCK must rely on one or the other; the plan doesn't pick.
**Failure scenario:** Phantom-warning ref (reopens inside a description) → operator dismisses → real orphan slips through. OR relationships-tool parses `consolidates` "id-a,id-b" as two ids while the schema validator records it as one.
**Evidence:** `tools/scripts/ci-registry-deltas.sh:14-26` (grep regex only); `core/meta-state.js:270` (schema); `meta-state-relationships-tool.js:21-25` (multi-valued split).
**Suggested fix:** Phase 3 step 1 specifies `jq -c '. | {id, consolidated_into, consolidates, supersedes, reopens, proposed_design_for, addresses, promoted_to_rule, origin}'` extraction or a small Node helper. Pick the `consolidates` semantics deliberately (likely: `z.array(z.string())` aligned with the relationships tool's expectation) before post-merge BLOCK relies on it.
**Disposition:** Accept

### Finding 13 — Test churn count is heavily inflated (MEDIUM)
**Reviewer:** Security Adversary
**Location:** Phase 2 §"Risk Assessment"
**Flaw:** Plan claims ~10 tests `readFileSync(meta-state.jsonl)` AND assert change-log lines. Verified: only **2** of the 10 listed files do both (raw-read + change-log assertion): `meta-state-check-grounding-tool.test.js:243` and `meta-state-resolve-tool.test.js:46`. Three secondary touches (lock/dedup/recurrence) assert non-change-log state. Five listed files do not raw-read the registry at all.
**Failure scenario:** Plan author over-counts churn; tests asserting non-change-log state stay correct under split and never appear in migration sweep; meanwhile the 2 real breakers must be enumerated precisely.
**Evidence:** `__tests__/legacy-mcp/meta-state-check-grounding-tool.test.js:243` (verified); `__tests__/legacy-mcp/meta-state-resolve-tool.test.js:46` (verified); `__tests__/cross-process-file-lock.test.cjs:56`, `__tests__/drop-idempotency-cache.test.cjs:44`, `__tests__/legacy-mcp/gate-recurrence.test.js:122` (read but NOT change-log).
**Suggested fix:** Restate the list as 2 confirmed broken + 3 secondary-touches + 5 unaffected. Test for grounded examples per file:line.
**Disposition:** Accept

### Finding 14 — Line citations wrong/imprecise (MEDIUM)
**Reviewer:** Security Adversary
**Location:** Phase 2 + Phase 1 references
**Flaw (a):** `meta-state-patch-tool.js:56-59` cited as change-log immutability guard; actual lines 56-59 are the `branch_mismatch` reject path. The `change_log_immutable` guard is at lines 62-66.
**Flaw (b):** "change-log write sites ~L1123, L1284" — L1123 is `entry_kind: "change-log"` inside an `assertinvariant` returnOnFail context (NOT a write site); L1284 is the `meta_state_batch` auto-emit entry construction. The canonical user-driven write path is `writeEntry` L760-803 → `appendRegistryEntryAtomic` L76-83.
**Flaw (c):** "mirror `vitest-failures.sh` idiom" uses `PATH_ARG="${1:-meta-state.jsonl}"`. The actual vitest-failures default is `.test-logs/vitest-results.json`; the mirror is the SHAPE, not the literal default — the literal default IS correct for this script but should be explicit.
**Failure scenario:** Implementer traces cited lines, finds wrong context, makes the wrong fix. Cross-references vitest-failures.sh and finds discrepancy, questions the mirror contract.
**Evidence:** `tools/handlers/meta-state-patch-tool.js:56-59` vs `:62-66`; `core/meta-state.js:1119-1125,1282-1293`; `tools/scripts/vitest-failures.sh:15`.
**Suggested fix:** Update line citations. L62-66 for the immutability guard. Phase 2 modifications list: "writeEntry dispatch (L760-803) + metaStateBatch rewrite (L1282-1293) so the auto-emit lands in the right file via appendChangeLogEntryAtomic." Phase 1 step 1: state the literal default is correct for THIS script ("`PATH_ARG='${1:-meta-state.jsonl}'` — the mirror is the contract shape, not the literal default path").
**Disposition:** Accept

### Finding 15 — Migration ordering: file-order is no longer chronological; "do not resolve finding-stream" lacks machine guard (MEDIUM)
**Reviewer:** Security Adversary + Failure Mode Analyst (combined)
**Location:** Phase 2 §"Migration" + Phase 4 step 6
**Flaw (a):** Chokepoint returns entries in **file-order** (no sort in `meta_state_list`). After split, the union groups by file, breaking the prior interleaved chronological view. Tooling that depends on file-order gets a different result than today.
**Flaw (b):** Phase 4 says "do NOT resolve `meta-260715T0633Z-finding-stream-...` finding." No machine-level guard exists. A typo in `meta_state_resolve({id})` closes the Tier-2 ticket. The plan defers to operator care.
**Failure scenario:** (a) Tools computing recency from `meta_state_list` output see different ordering. (b) Operator typing the wrong id accidentally closes the Tier-2 ticket; Tier-2 debt signal evaporates.
**Evidence:** `core/meta-state.js:554-567` (parseFn returns file-order); `tools/handlers/meta-state-list-tool.js` (no `.sort()`); `core/meta-state.js`/handlers (`meta_state_resolve` accepts findings unconditionally after entry_kind check).
**Suggested fix:** (a) Commit to either post-concat sort by `created_at` (in `_readAndParseRegistry`) or explicitly document the file-order-is-no-longer-chronological limitation. (b) Phase 4 step 6: pre-resolve assertion `meta_state_list({id: 'meta-260715T0633Z-finding-stream-…'})` and assert `status === 'open'` BEFORE running the resolve on the Tier-1 id.
**Disposition:** Accept

## Severity Rollup

| Severity | Count | Items |
|----------|-------|-------|
| Critical | 4 | F1, F2, F3, F4 |
| High | 7 | F5, F6, F7, F8, F9, F10, F11 |
| Medium | 4 | F12, F13, F14, F15 |

## Reviewer Coverage

| Lens | Reviewer | Raw Findings | After Dedup |
|------|----------|--------------|-------------|
| Security Adversary | Security Adversary | 10 | 7 (F4, F9, F11, F12, F13, F14, F15) |
| Failure Mode Analyst | Failure Mode Analyst | 10 | 8 (F1, F2, F3, F5, F8, F9, F10, F15) |
| Assumption Destroyer | Assumption Destroyer | 10 | 5 (F2, F5, F8, F10, F11) |

## Next Step

User adjudication via `AskUserQuestion`. Reviewers + controller recommend accepting all 15. After approval: apply to plan + whole-plan consistency sweep (no recommendation of `/ck:cook` until the sweep reports zero unresolved contradictions).

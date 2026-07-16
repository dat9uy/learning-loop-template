# Code Review (Failure-Mode-Analyst, Murphy's Law + Flow Tracer)

**Plan under review:** `plans/260716-1101-tier2-versioned-append-mutable-stream/`
**Role:** HOSTILE failure-mode analyst — race conditions, data loss, cascading failures, recovery gaps, deployment risks, rollback holes.
**Mode:** Ignore default code-quality checks; treat the plan as the artifact under attack.

Pre-review verification of plan-supplied facts:
- `meta-state.jsonl`: 100 lines (verified `wc -l`) — **TRUE**
- 14 entries with null/non-integer `version` (verified `jq -s [...]`) — **TRUE**
- 0 duplicate ids across `meta-state.jsonl` + `change-log.jsonl` (verified `jq -s 'group_by(.id) | map(length) | map(select(. > 1)) | length'`) — **TRUE**
- `metaStateEntrySchema version` default at line 372 (`grep -n` confirms) — **TRUE**
- `_readAndParseRegistry` does not run `safeParse`; only `JSON.parse` + `withDefaults` (verified `sed -n '641,673p'`) — **TRUE**
- `appendChangeLogEntryAtomic:161` already uses `appendFileSync` (verified `grep -n "appendFileSync.*change-log"`) — **TRUE**

Plan is factually grounded. Probing failure modes now.

---

## Finding 1: appendFileSync crash leaves a partial last line that crashes all subsequent reads
- **Severity:** Critical
- **Location:** Phase 2 (phase-02), §Architecture "appendRegistryEntryAtomic → true append" and §Risk Assessment "Append not atomic across crash"
- **Flaw:** The plan claims the Phase B risk "append not atomic across crash" is "mitigated by appending under `withRegistryLock` + per-root queue (same discipline as `appendChangeLogEntryAtomic`)". Neither `withRegistryLock` nor `enqueue` prevents a partial write from a crash/SIGKILL/power loss mid-`appendFileSync` — they only serialize concurrent writers. The mitigation copy-pastes the same flaw `appendChangeLogEntryAtomic:161` already carries.
- **Failure scenario:**
  1. Process P1 acquires `withRegistryLock`, calls `appendRegistryEntryAtomic` for entry `E_new`.
  2. `appendFileSync` writes 7,300 of an 8,000-byte line, then the OS/SIGKILL/ENOSPC fires between byte 7,300 and 8,000.
  3. `meta-state.jsonl` ends with `{...,"id":"meta-260716T1159Z-x","status":"o` (truncated, no trailing newline).
  4. Process P2 (or a fresh `readRegistry`) calls `_readAndParseRegistry` → `readFileSync(path,"utf8").split("\n").filter(line => line.trim() !== "")` → the truncated line passes the trim filter → `JSON.parse(line)` at `core/meta-state.js:658` throws.
  5. Exception unwinds out of `readRegistryWithCache`; the next read returns *whatever the *previous* cached entry was* (the cache was never invalidated), so callers see a stale snapshot — or, on cache-cold reads, the entire registry session breaks. `meta_state_list` returns `[]` because the inner throw bypasses the seam's return.
  6. Operator's only recovery: hand-edit the truncated line back to valid JSON. With 100 filesize lines and no fsync the chance of crash is small, but the registry is exactly the data you cannot afford to half-write.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:657-664` — `_readAndParseRegistry` does bare `JSON.parse(line)` with no try/catch on the per-line read.
  - `tools/learning-loop-mastra/core/read-registry-cache.js:60` — cache is keyed on mtime+size, so a *successful* truncation changes mtime and busts the cache; a crash leaves mtime advanced but content corrupt.
  - `tools/learning-loop-mastra/core/meta-state.js:163` — `appendChangeLogEntryAtomic` uses `appendFileSync(path, JSON.stringify(entry) + "\n", "utf8")`. No `fsync`. Same shape will be reused for `meta-state.jsonl` in Phase B.
- **Suggested fix:** Either (a) write the line to a `.tmp` file then `renameSync` (atomic on POSIX; preserves the "no line replacement" invariant because the rename replaces the whole file, not a line within it); OR (b) explicitly adopt the same risk `change-log.jsonl` already carries and at minimum catch JSON.parse failures in `_readAndParseRegistry`, drop the offending line, and emit a `lint:registry_corrupt_line_warning` so the operator can decide whether to compact. Either path must be in the plan, not deferred.

---

## Finding 2: No-op short-circuit compares by JSON.stringify on cross-reference arrays — false-positive bug
- **Severity:** Critical
- **Location:** Phase 2 (phase-02), §Architecture "No-op short-circuit detail"
- **Flaw:** The plan's short-circuit compares "the post-`Object.assign` entry against the existing max-version entry, excluding the `version` field" using `JSON.stringify` for array fields. JSON.stringify on an array with the same elements returns the same string regardless of element identity, but **the patch object holds the original array reference** that `Object.assign` placed onto `entry`. If a *different* caller has since mutated the array elements in place (or the same caller did between read and write), the post-`Object.assign` state and the original JSON-serialized state *could* differ in deep-equal terms but stringify identically.
- **Failure scenario:**
  1. Patch `{ addresses: [arr1] }` arrives at `meta_state_patch`. Handler validates the patch then calls `updateEntry(root, id, { addresses: arr1_ref })`.
  2. The existing entry on disk has `addresses: [refX]`. Phase B reads the existing entry, `Object.assign`s `arr1_ref` onto it, and stringifies both sides:
     - Pre-patch disk: `addresses: ["meta-…"]` (empty after read)
     - Post-patch: `addresses: ["meta-…", "loop-design-…"]` (the new ref)
  3. Edge case: caller later mutates `arr1_ref.push("extra")` *after* validation succeeded but *before* short-circuit compares. JSON.stringify uses the *current* state of the array — it cannot detect "the caller intended this exact slice". Concretely, two `meta_state_patch` calls with `[{addresses: arrA}, {addresses: arrB}]` whose arrays happen to stringify the same will both short-circuit as no-ops, and the second `meta_state_promote_rule`/`meta_state_log_change` audit trail is silently lost — only the first wins; the second patch's audit record never appended.
  4. The same falsifies for `proposed_design_for` and `reopens` (called out in the plan §Architecture "No-op short-circuit detail (the `meta-260715T2311Z` resolution)"). The plan even concedes "patches are flat; arrays compared by reference-into-JSON is acceptable but use `JSON.stringify` for array fields to be safe" — this concedes the wart, then proposes JSON.stringify as the fix. JSON.stringify is **not** reference-stable, only value-stable. Once `entry.addresses` is the array reference and the patch closed over the same reference, in-place mutation by a sibling caller makes the comparison meaningless.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:1041-1051` — `Object.assign(entry, cleanPatch)` mutates in place. After Phase B, this is the *source* of the patched entry.
  - `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:24-25` — the patch schema preprocesses `deepStripEnvelope`; the array objects emitted into the schema-validated patch share references with caller-side arrays unless `JSON.parse(JSON.stringify(...))` is applied — the plan does not propose deep-cloning the patch.
  - `tools/learning-loop-mastra/core/meta-state.js:1367` — `metaStateBatch` case "update" also does `Object.assign(entries[idx], patch)` without deep-cloning. The plan claims this path also gets the no-op short-circuit (phase-02 §Architecture "Each append site…"), but the plan body for `metaStateBatch` is not specified beyond "for each mutated id, append a new versioned line." With `Object.assign` and live references, the same falsify exists.
- **Suggested fix:** Either (a) deep-clone the patch before `Object.assign` (`structuredClone(patch)`), then JSON.stringify both sides — guarantees value-equality on independent memory; OR (b) compare by JSON.stringify of *stringified-then-reparsed* copies so any caller-side in-place mutation is reflected correctly (still not identity-safe, but at least deterministic). The plan should pick one and write the test for a same-shape-different-reference case explicitly.

---

## Finding 3: Phase C flip is irreversible-in-effect across squash or force-push of Phase B
- **Severity:** Critical
- **Location:** Phase 3 (phase-03), §Risks "Flip lands before Phase B is on main"
- **Flaw:** The plan correctly flags "flip is the last step" but does not gate Phase C's *acceptance criteria* on the persistence of Phase B's commit hash. If Phase B is merged with squash and the commit hash drops from history, OR if someone force-pushes `main` to fix a Phase B bug, every clone that pulled from `main` while Phase C's `.gitattributes` flip was active now has `merge=union` enabled on a `meta-state.jsonl` whose content is still the pre-Phase-B full-rewrite semantics (because `git fetch` re-applied the flipped `.gitattributes` against a `meta-state.jsonl` whose writers do not append). For the operator's parallel-resolve workflow, the result is the exact failure mode the plan calls out: in-place mutation + union = duplicate ids → corruption.
- **Failure scenario:**
  1. Phase B lands (`appendRegistryEntryAtomic` now true-appends), Phase C flips `.gitattributes` + CI advisory.
  2. Operating agent runs Phase B's `updateEntry(...)` from a stale worktree pinned to a pre-Phase-B `meta-state.js` (workflow checks cache, hot-reload skipped).
  3. The stale agent writes to `meta-state.jsonl` via the old `persistRegistryAtomic` (full-rewrite). The clone's `.gitattributes` says `merge=union`.
  4. Operator branches `feature/A` from `main` and resolves finding `F`. Their branch mutates in place. Merged back into `main` via union, both versions of `F` land in the file — duplicate ids. The projection now has TWO rows for `F`.
  5. There is no test that catches "Phase B's write-path is the versioned-append behavior" vs. "the writer's behavior comes from pre-Phase-B code" because the `.gitattributes` flip is independent of the writer's source code. A hot-reloaded worktree, an MCP server that did not restart, a `pnpm vitest` operator's local install — any of these can be in the wrong code/config combination.
- **Evidence:**
  - `.gitattributes` (current state) — explicitly forbids `merge=union` on `meta-state.jsonl`: "DO NOT add meta-state.jsonl here: it is NOT true append-only — entries are mutated in place for status flips (resolve / patch / batch), and the registry is full-rewritten on every write. merge=union on a full-rewrite file would keep BOTH the stale base-version and the mutated version of any mutated entry id, producing duplicate ids and corrupting the registry."
  - The plan's mitigation (phase-03 §Risks): "Phase C depends on Phase 2; flip is the last step; CI runs against the post-Phase-B state." This is necessary but not sufficient — no test pins Phase B's behavior as the precondition for the flip persisting.
- **Suggested fix:** Add an "assert registry writer is the versioned-append variant" smoke test run by CI on every PR touching `meta-state.jsonl` (asserts `appendRegistryEntryAtomic`'s implementation, not just `.gitattributes`). Or add a CI gate that fails if `.gitattributes` is modified without a corresponding Phase-B-shape `meta-state.js` ref.

---

## Finding 4: Cache invalidation map after Phase B rewrite — `shipLoopDesign`, `archiveEntry`, `metaStateBatch` paths
- **Severity:** High
- **Location:** Phase 2 (phase-02), §Architecture
- **Flaw:** The plan rewrites `appendRegistryEntryAtomic` to do a `appendFileSync` then `invalidateCache(root)` ("appendRegistryEntryAtomic → true append … invalidate cache"). Today `persistRegistryAtomic` calls `invalidateCache` (line 87). The current `appendRegistryEntryAtomic` is `read-all + persistRegistryAtomic` so it transitively invalidates. After Phase B, `appendRegistryEntryAtomic` is a NEW direct `appendFileSync` + `invalidateCache` — but the plan only sketches one call site for the rewrite, not all five (writeEntry, updateEntry, archiveEntry, deleteEntry, shipLoopDesign, metaStateBatch). The other four each currently call `persistRegistryAtomic(tableOnly(...))` which invalidates as a side effect. After Phase B, those paths must each INVALIDATE THE CACHE after appending.
- **Failure scenario:**
  1. Path `deleteEntry` after Phase B: `appendFileSync(path, …) + invalidateCache(root)` (per the plan's prescription). Correct.
  2. But `metaStateBatch` (phase-02 §Architecture case-by-case) has multiple mutation kinds inside one `withRegistryLock`:
     - For 5 `update` ops on the same id (each `Object.assign`-and-append in Phase B's rewrite — but the plan body is silent on how the append path through `metaStateBatch` is constructed), the cache could plausibly be invalidated once at end-of-batch (correct).
     - But the existing rollback path (lines 1262-1269, 1399-1411, 1504-1511) calls `invalidateCache` after `writeFileSync(path, preBatchContent, "utf8")` to roll back — under Phase B's versioned-append semantics this rollback REWRITES the file (not append), which works (it restores the prior EOF state), but it contradicts Phase B's "no line is ever replaced" invariant because the rewrite necessarily REPLACES lines that were appended during the partial batch. The plan's Risk Assessment "Phase B does not claim to remove the cross-branch speed limiter" doesn't cover intra-process rollback rewriting the file.
  3. Concretely: if the 4th `update` op in a 10-op `metaStateBatch` throws "version_mismatch", the rollback rewrites the file with `preBatchContent` (the pre-batch file). This removes the 3 successfully-appended lines. Now Phase B's "never replace a line" invariant is violated within a single process's lifetime. The cache was invalidated at line 1405, so subsequent reads are correct, but the file no longer has the versioned-append invariant. A later `git merge-file --union` cross-branch would treat this reverted content as if the original line was committed from this side — restoring original lines, not the new versions.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:1262-1269, 1399-1411, 1504-1511` — three rollback sites use `writeFileSync(path, preBatchContent, "utf8")` to restore on partial-batch failure.
  - `tools/learning-loop-mastra/core/read-registry-cache.js:36-84` — process-lifetime LRU cache. Two processes with cached stale entries DO NOT see each other's invalidation (Finding 7 below).
  - `tools/learning-loop-mastra/core/meta-state.js:1234` — `metaStateBatch` outer `withRegistryLock` provides cross-process race safety; the rollback writes happen *inside* the lock so file state is consistent, but the "no line replacement" invariant is broken by the rollback.
- **Suggested fix:** Phase B must keep a "differential" rollback (re-append the version-bump-revert lines) or, more cheaply, gate `metaStateBatch` on validating all versions up-front before any append, OR refactor the rollback to "scan the file for lines appended during this batch's lock acquisition window and truncate at the EOF marker written by `enqueue`". The current `writeFileSync(preBatchContent)` rollback is incompatible with append-only semantics — the plan must address this.

---

## Finding 5: `_readAndParseRegistry` does not run `metaStateEntrySchema.safeParse` — empty/null version fields survive the projection swap
- **Severity:** High
- **Location:** Phase 1 (phase-01), §Architecture and §Implementation Steps
- **Flaw:** Phase A swaps the projection from "concat + sort by `created_at`" to "group_by(.id) | max_by(.version)". The seam (parseFn in read-registry-cache.js:36-60) calls `_readAndParseRegistry(root)`, which only does `JSON.parse` + `withDefaults` (line 657-664). It does NOT run `metaStateEntrySchema.safeParse`. The schema default `version: z.number().default(0)` at line 372 only fires when entries are validated by `metaStateEntrySchema.safeParse` in write paths — NOT on read.
- **Failure scenario:**
  1. Phase A backfills the 14 null-version entries with `version: 0` and runs the test "Real `meta-state.jsonl` has zero null/non-integer `version` fields after backfill."
  2. Between Phase A landing and Phase B rewriting the write paths, an operator writes a finding via MCP `meta_state_report`. The `writeEntry` (line 889) calls `metaStateEntrySchema.safeParse(entry)` (line 925) — schema defaults `version` to 0 — so the on-disk entry does have version. Good.
  3. But before the backfill PR lands (the plan's risk "Backfill clobbers a real version" assumes the backfill is run; what if a stale pre-backfill file is read by a post-Phase-A projection?), entries without a `version` field are dropped by `max_by(.version)` because JSON's `undefined` is ignored by `max_by` — actually `undefined < undefined` is false, so behavior is platform/jq-version-dependent. The plan claims `max_by` is "undefined when `version` is null across a group" (phase-01 §Architecture). For the *projection* swap this is silently lossy: a group with two `null` versions and one integer version may pick the wrong one or get `null` and become undefined in JS post-parse.
  4. The plan mitigates with the backfill landing in the same PR. That mitigates the read-backfill race but does NOT mitigate: the projection does not validate. After Phase B, operators can still write schema-defaulted entries (version=0 from the schema), but if anything ever bypasses the schema (e.g., a manual file edit, a future migration script that forgets the schema), the projection silently drops those entries from `meta_state_list`.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:657-664` — `_readAndParseRegistry` does bare `JSON.parse(line)` + `entry_kind` coerce + `withDefaults(entry)`. No schema validation on read.
  - `tools/learning-loop-mastra/core/meta-state.js:372` — `version: z.number().default(0)` only fires in `safeParse`.
  - `tools/scripts/registry-table.sh` (full file) — projection is done in `jq -sc 'group_by(.id) | map(max_by(.version))[]'`. When `.version` is `null` across a group, `max_by` returns the first null entry or `null` depending on jq impl.
- **Suggested fix:** Phase A must add a `read-time schema validation` pass to `_readAndParseRegistry` (similar to the `readFileIndex` validator at `tools/learning-loop-mastra/core/meta-state.js:741-777`), OR explicitly tag the backfill migration as a prerequisite of "any clone older than <git-sha> must run the backfill before projection goes live".

---

## Finding 6: Compaction hook retired in Phase B; file grows monotonically until Phase C ships — but Phase C has no upper bound on initial size
- **Severity:** High
- **Location:** Phase 2 (phase-02) §Risk Assessment "Compaction hook lost" + Phase 3 (phase-03) §Success Criteria
- **Flaw:** Phase B removes inline compaction from `updateEntry` (line 1033-1039 in `meta-state.js`). Phase C ships `compact-registry.sh --check` + CI notice at threshold `raw_lines >= 1000`. The plan claims "File grows monotonically until then (acceptable: 100 ids, solo scale, Phase C threshold 1000)." But with versioned-append, ONE update operation creates a new line. Each id has potentially many versions. Total raw lines = `Σ(version_count_per_id)`. If 50 active findings each get 20 patches between Phase B and Phase C shipping, plus 14 backfilled null versions, plus 100 base, the file would be ~1100 lines within days — and Phase C's threshold of 1000 is *the advisory trigger*, not a hard cap. The advisory says "WARN, no block", so the file can blow through 1000 to 10000 without anyone noticing until manual sweep.
- **Failure scenario:**
  1. Phase B merges; operators work normally; each `updateEntry` appends a new line (no compaction).
  2. 10 days pass. File has 800 lines.
  3. Phase C merges; the CI advisory emits "compaction eligible at N raw lines" but blocks nothing.
  4. The advisory reaches a watcher that ignores non-blocking PR-body notices. Operator never runs `compact-registry.sh`.
  5. File grows to 5000 lines. Next `updateEntry` is still fast (append-only) but the projection re-reads the whole file (no incremental projection cache exists; `_readAndParseRegistry` is `split + parse + sort` over the whole file every read after cache miss). A 5000-line file with say 200 entries averages 25 versions per entry — the sort/group is O(n) but every `meta_state_list` call does this on cache miss.
  6. The compaction that Phase C introduces (`max_by(.version)` per id) REDUCES the file but DOES NOT run automatically. The whole mechanism depends on operator discipline.
- **Evidence:**
  - `tools/learning-loop-mastra/core/meta-state.js:202` — `COMPACTION_AGE_MS = 7 * 24 * 60 * 60 * 1000;` inline compaction lives at line 1033-1039 inside `updateEntry`.
  - Phase 2 says "Inline compaction removed (no full rewrite to piggyback)."
  - Phase 3 §Implementation Step 8 says "Implement `compact-registry.sh`" + "Compaction `--check` test"; §Success Criteria does NOT include a hard cap or auto-compaction.
- **Suggested fix:** Either (a) keep the inline compaction on the new path (re-append the full file under the same lock — defeats versioned-append but contains the size); OR (b) add an automatic compaction trigger at threshold (run via a single-shot cron or precommit hook, NOT in CI which is just an advisory); OR (c) re-think the threshold semantics — e.g., 1000 raw_lines triggers a CI BLOCK (not advisory) for the next PR touching `meta-state.jsonl`. The plan's "advisory only" stance is a soft choice that compounds.

---

## Finding 7: `deleteEntry` tombstone append — cross-process cache staleness
- **Severity:** High
- **Location:** Phase 2 (phase-02), §Architecture "`deleteEntry`" and Phase 3 (phase-03), §Risks (none addressing this)
- **Flaw:** The plan converts `deleteEntry` from a full-rewrite-hard-delete to a tombstone append. The plan correctly notes "in-process concurrency still safe (per-root `enqueue` queue + `withRegistryLock`)". But `read-registry-cache.js:36-60` caches the projection per-process for the *process lifetime*. Two `pnpm dev` servers running side-by-side each have their own cache, but more importantly **multiple MCP-server processes that share the same root** (the plan acknowledges "concurrent MCP servers" elsewhere at `meta-state.js:152`) read stale cache after process B's tombstone lands.
- **Failure scenario:**
  1. Process A (MCP server instance 1) reads `meta-state.jsonl` with finding `F` at version 3. Caches the projection.
  2. Process B (MCP server instance 2) receives a `meta_state_delete(F)` call. Acquires `withRegistryLock` (line 34-46 of registry-lock.js). Appends tombstone line. Invalidates B's own cache. Releases lock.
  3. Process A's cache still has F at version 3 (because cross-process invalidation is not a thing — `read-registry-cache.js` has no fsnotify).
  4. Process A serves `meta_state_list({ include_archived: true })` from its stale cache. Returns F (because A's cache predates the tombstone). The agent runtime thinks F is still recoverable.
  5. Operator runs `compact-registry.sh` and the file shrinks. Process A's cache mtime+size keys invalidate (step 4's mtime/size change), so A re-reads. By this point, the operator's invariant that "F is deleted" is fragile.
- **Evidence:**
  - `tools/learning-loop-mastra/core/read-registry-cache.js:36-60` — cache is process-local, keyed on mtime+size. mtime only changes when the file is rewritten; for appendFileSync the mtime DOES advance, so the cache invalidates per-write. BUT multi-process concurrency is still a problem: if process A caches at T=0, process B appends at T=1, process A's next read sees mtime/size change and re-reads. Actually this works.
  - However, between A's cache and B's write, there is a window of A-serving-stale state during which A's tools may take a write action based on stale state. Phase B doesn't introduce new races (since `withRegistryLock` serializes), but it does mean a stale A-reader can take an action that was valid at read-time but is invalid by the time write completes (same TOCTOU as today; not new). The plan does not address this.
- **Suggested fix:** For versioned-append the TOCTOU window may widen because the file append is shorter than a full-rewrite (faster), so the window between A's last read and B's append is shorter, but the window between A's cache hit and B's append is unchanged. Add a "version monotonicity" check at writeEntry / updateEntry that re-reads with `mtime+size` key invalidation, OR document explicitly that cross-process MCP servers may see stale reads for up to one cache-hit period. The plan should call this out and add at minimum a TTL to the cache.

---

## Finding 8: Phase C flip loses the per-branch provenance of audit trail
- **Severity:** Medium
- **Location:** Phase 3 (phase-03), §Architecture "`.gitattributes` flip"
- **Flaw:** Phase B makes `meta-state.jsonl` append-only + versioned. Phase C flips `merge=union`. Under union, two branches that each append to the same id land BOTH versions in the merged file. The projection picks last-wins-by-max-version. The plan accepts this as "audit-complete" because both lines remain. But which line "won" the merge (which is the projected canonical state) is determined by EOF concatenation order, NOT by which branch produced which version. There is no `created_by_branch` or merge-time marker.
- **Failure scenario:**
  1. Branch A: agent-A resolves finding `F` from `version=3 → version=4` (status: resolved).
  2. Branch B: agent-B supersedes finding `F` from `version=3 → version=4` (status: superseded).
  3. Both branches commit version 4 of F (using Phase B's append). After `merge=union` of the two branches into `main`, the file has TWO lines with id=F, version=4, different `status`, different `created_by`, different `created_at`.
  4. The projection picks max(version)=4 max-by-version. jq's `max_by` is unspecified for ties (and `_readAndParseRegistry` runs through `JSON.parse` — no schema dedupe). On an even tie, `max_by` returns the first occurrence (jq semantics; documented behavior, see [jq#max_by](https://jqlang.org/manual/v1.7/#max_by-exp)). Neither the projection nor the file marks which `version=4` is authoritative.
  5. CI advisory emits WARNING "duplicate version per id for F" — correct detection — but does not BLOCK. The agent that handles the next `meta_state_resolve(F)` patch operates on whichever `version=4` the projection shows. The other `version=4` sits silently in the file until compaction.
- **Evidence:**
  - `.gitattributes` — already cites this risk for `change-log.jsonl` merge: "merge=union on this file is safe because change-logs are never mutated in place (enforced by the core-layer immutability guard …)." For `meta-state.jsonl` post-Phase-B, the equivalent guarantee is "mutations always bump version, so two branches producing same version on same id is technically the same conceptual state." But the plan does NOT add a branch marker.
  - `tools/learning-loop-mastra/core/meta-state.js:1414-1466` — `buildEnvelope` auto-emit lives in change-log.jsonl; the new lines added to `meta-state.jsonl` carry no merge-provenance metadata.
  - `tools/scripts/ci-registry-deltas.sh` (full file) — current advisory detects refs, not duplicate-version-per-id.
- **Suggested fix:** Either (a) accept the ambiguity and document it as the new "last-writer-by-merge-order wins" semantic, OR (b) bake in a merge-time marker (e.g., a `merged_at` + `merge_commit` field stamped by a post-merge hook or bot). The plan currently elides this entirely; a Tier 2 ticket comment is required.

---

## Finding 9: CI advisory silent-pass when jq errors or fixtures mismatch
- **Severity:** Medium
- **Location:** Phase 3 (phase-03), §Architecture "CI advisory (Q2)"
- **Flaw:** The plan's CI advisory is a jq query `jq -s 'group_by(.id) | map(group_by(.version) | map(length)) | map(any(. > 1)) | any' meta-state.jsonl change-log.jsonl`. WARNING only, no block. The plan warns the operator of duplicate-version-per-id but does not call out the "no WARNING == no problem" failure mode the operator must defend against — i.e., a CI run where `jq -s` produces `false` because the file is missing, jq is missing, or the union of files is empty (e.g., a PR that only touches `.gitattributes` and the registry files are filtered out by the diff stage). The advisory cannot distinguish "0 duplicate-version-per-id because registry is fine" from "0 duplicate-version-per-id because registry was not inspected."
- **Failure scenario:**
  1. CI advisory runs against the diff-set (per the script's name `ci-registry-deltas.sh <diff-file>`). The PR doesn't touch either JSONL file. The diff file is empty. `jq -s` returns `false`.
  2. CI post emits "no warnings." Reviewer checks the box, merges. The flip is now active in `.gitattributes` for all future PRs that DO touch the file.
  3. Future PR touches `meta-state.jsonl`. Two branches each append the same id with version=4. CI advisory fires — but if the CI workflow's `paths-filter` excludes JSONL files in some setup (a known CI gotcha), the advisory is silent. Operator runs `git merge` manually.
- **Evidence:**
  - `tools/scripts/ci-registry-deltas.sh:18-22` — the script exits 0 (advisory) on no violations.
  - The jq query in the plan (phase-03 §Architecture "CI advisory (Q2)") is advisory only — there is no exit-code check upstream.
- **Suggested fix:** Either (a) make the advisory fire a non-zero exit code on the jq-level error (so a missing-file ci run fails loud), OR (b) make the CI workflow `paths-filter` always include the registry files when the changed-files list intersects with `.gitattributes` or `core/meta-state.js`, OR (c) document "missing WARNING is OK" explicitly and add a test that asserts the CI workflow emits a positive "registry scanned" message even when no warnings.

---

## Finding 10: Phase A "byte-identical `meta_state_list`" assertion depends on `group_by` order semantics not anchored in the plan
- **Severity:** Medium
- **Location:** Phase 1 (phase-01), §Architecture and §Success Criteria
- **Flaw:** Phase A claims the projection produces "byte-identical `meta_state_list` output before/after" because each id is a singleton today. The re-sort by `created_at` is load-bearing because `group_by(.id)` preserves first-appearance order, not chronological. The plan's test asserts "ordering-preservation test (chronological by `created_at` after dedupe)" — but the test asserts ordering only IF the dedupe is identity. With singleton-only files today, identity holds. The plan's risk "Re-sort changes `meta_state_list` ordering" mitigated by "ordering-preservation test (TDD step 2) written before the swap." However, the test fixture is constructed by the test author. If the test author writes a "singleton-only fixture" that hides the dedupe path, the test passes today but the projection is never exercised on its real path until production. The plan does NOT mandate a "versioned fixture" assertion — only "duplicate-id → max version; singleton → identity" (phase-01 §Success Criteria item 1).
- **Failure scenario:**
  1. Phase A merge test runs. The projection swaps `group_by(.id) | max_by(.version)` in place. Tests assert identity for current singleton file.
  2. Test author writes a "versioned fixture" with `id=X, version=0` and `id=X, version=2`. Plan claims this is the first TDD step (phase-01 §Implementation Step 1 "build a fixture `meta-state.jsonl` with two versioned lines for one id (v0 + v2) and a singleton id; assert `_readAndParseRegistry` returns the v2 line for the dup-id").
  3. Reading the actual code path: `_readAndParseRegistry` does NOT do `group_by + max_by` in Phase A. Phase A moves that into the seam (`read-registry-cache.js#parseFn`)? Wait — let me re-read. §Architecture says: "Today `parseFn` concats both files and sorts by `created_at` ascending. After: concat both files → group by `id` → pick `max_by(.version)` per id → re-sort by `created_at` ascending."
  4. So the seam needs to swap `parseFn` to a new function. The plan claims Phase A's "modify" target is `_readAndParseRegistry` (line 641) — but the seam is `parseFn` parameter in `readRegistryWithCache(root, parseFn)`. If the swap happens in `_readAndParseRegistry` itself, every caller of `readRegistry(root)` (which the test bypasses the seam for) gets the new behavior. If the swap happens in `read-registry-cache.js#parseFn`, callers that bypass the cache (none today, but possible) get the old behavior. The plan is silent on *where* the swap lives.
  5. Test asserts `_readAndParseRegistry` directly. If the swap is in the seam, `_readAndParseRegistry` is unchanged; the test asserts the old behavior. The "swap" is invisible to the test. The test passes; the seam ships broken.
- **Evidence:**
  - `tools/learning-loop-mastra/core/read-registry-cache.js:36-60` — `parseFn` parameter IS the seam.
  - `tools/learning-loop-mastra/core/meta-state.js:681` — `readRegistry(root)` is `readRegistryWithCache(root, _readAndParseRegistry)`. The "today" parseFn is `_readAndParseRegistry`; Phase A's swap is to a NEW `lastWinsByMaxVersion` parser that gets passed to the seam.
  - The plan's "Related Code Files" for Phase A only names `core/meta-state.js` as the modify target. `core/read-registry-cache.js` is NOT listed.
- **Suggested fix:** Plan must specify "swap happens in the seam via a new `_lastWinsByMaxVersion` helper passed as `parseFn`" or "swap happens inline in `_readAndParseRegistry` and the seam is unchanged." Pick one and assert the test's coverage matches the chosen location. The test as written (`_readAndParseRegistry` direct assertion) only exercises the inline case.

---

## Finding 11: BATCH_SIZE_LIMIT drift between core/constants.js (500) and meta-state.js comment (100)
- **Severity:** Medium
- **Location:** Phase 2 (phase-02), §Architecture (no entry); observed in surrounding code
- **Flaw:** `tools/learning-loop-mastra/core/constants.js:23` defines `BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500`. The comment in `meta-state.js:1212-1217` claims "BATCH_SIZE_LIMIT reduced from 500 → 100 so that worst-case batch fits inside the registry-lock's `stale: 30000` window on slow disks (Finding 12). Larger batches risk lock-stealing by concurrent processes that observe a >30s-old lock." The actual limit is 500, not 100. This is a pre-existing inconsistency (not introduced by Tier 2) but Phase B rewrites `metaStateBatch` to do per-id appends — each id's append is `enqueue + withRegistryLock + appendFileSync`. Going from O(1) full-rewrite under the lock to O(N) appends under the same lock widens the lock-held window by a factor of `N op count × per-op time`. The plan doesn't restate the 100-vs-500 limit; it leaves the actual constant at 500.
- **Failure scenario:**
  1. `metaStateBatch` is called with 500 ops (the limit). Each op in Phase B does: read-modify-write one append + cache invalidate. Five hundred ops, each `O(read_one_id + append_one_line + invalidate)`. Under contention, this exceeds the `stale: 30000` lockfile window.
  2. A second MCP server process observes a stale lock and steals it. The two writers interleave appends. The file now has 500 lines from process A + N lines from process B with no deterministic ordering per id.
  3. The projection (Phase A) does NOT dedupe across-process-order; it dedupes by max-version within each process's view.
- **Evidence:**
  - `tools/learning-loop-mastra/core/constants.js:23` — `BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500`.
  - `tools/learning-loop-mastra/core/meta-state.js:1212-1217` — comment claims 100; reality is 500.
  - `tools/learning-loop-mastra/core/registry-lock.js:36-40` — `stale: 30000`.
- **Suggested fix:** Either (a) Reconcile: change the constant to 100 OR change the comment to 500; (b) Make Phase B's `metaStateBatch` rewrite either (i) batch all appends into ONE `appendFileSync` call (single syscall, single fsync), or (ii) build the file in a `.tmp` then rename (single atomic write). With either approach, the per-op lock-held cost drops by an order of magnitude and the 500 limit is safe.

---

## Finding 12: `loop_describe` registry_stats shell-out from MCP server risk
- **Severity:** Low
- **Location:** Phase 3 (phase-03), §Architecture "Compaction signal (DRY: one stats helper, three surfaces)"
- **Flaw:** Plan says "prefer a `core/` helper imported by both to avoid shelling out from the MCP server". The text-level hedge "(or have the script be the single source and the warm tier shell out — pick whichever the codebase finds natural)" leaves implementation ambiguous. The MCP server's gate preflight (`gate_mark_preflight` per `AGENTS.md`) might block shell-out to `compact-registry.sh` for product/** writes, which would gate the read on `compact-registry.sh` invocation.
- **Evidence:**
  - `tools/learning-loop-mastra/core/loop-introspect.js` (full file) — introspect is pure JS; no shell-out.
  - `AGENTS.md` (project instructions) — references `tools/scripts/registry-table.sh | tail -20` for inbound gate; this is the *documented* shell-out pattern. So shell-out is acceptable for read-only scripts.
  - The plan's `core/` helper vs. shell-out tradeoff is genuinely a small choice; flagging it as a touchpoint: whichever is chosen, the warm-tier handler `loop-describe-tool.js:35-100` must import it consistently.
- **Suggested fix:** Plan should explicitly mandate the `core/` helper (per the plan's own rationale — avoid subprocess overhead + gate concerns) and the helper must be imported by both the warm-tier handler and the script (the script becomes a thin wrapper).

---

## Summary

The plan is **factually grounded** — every cited file:line and grep'd file count checks out against the codebase. The mental model is also correct: append-only + union-merge + last-wins-by-max-version is the standard pattern (event sourcing / Kafka log compaction), and the 3-PR split (projection → write-path → flip) is a sensible ordering.

**Blocking findings (Critical):**
1. `appendFileSync` crash semantics leave partial last line; `JSON.parse` crashes every subsequent read; neither `withRegistryLock` nor `enqueue` mitigates this.
2. JSON.stringify short-circuit cannot detect caller-side in-place array mutations; second patch silently loses audit trail.
3. Phase C flip is irreversible-in-effect under squash/force-push/squash-merge combinations; no CI gate pins Phase B's writer behavior as a precondition for the flip persisting.

**High-priority findings (High):**
4. `metaStateBatch` rollback rewrites the file with `preBatchContent`, which contradicts Phase B's "no line replacement" invariant.
5. `_readAndParseRegistry` does not run schema validation; null/missing version fields survive the projection.
6. Compaction is fully manual until Phase C; the 1000-line threshold is advisory, not blocking.

**Watchlist (Medium/Low):**
7. Cross-process cache staleness (TOCTOU windows in versioned-append).
8. Phase C flip loses per-branch provenance for same-version concurrent mutations.
9. CI advisory silent-pass when jq / fixture is absent.
10. Phase A "byte-identical" test depends on test author exercising the dedupe path; seam-vs-inline location is unspecified.
11. BATCH_SIZE_LIMIT drift between constants.js (500) and meta-state.js comment (100); Phase B's per-op append amplifies lock-held time.
12. registry_stats shell-out / core-helper ambiguity.

**Recommended next steps before merging the plan:**
1. Decide: keep inline compaction, or accept the monotone-growth phase and ship an auto-compaction?
2. Pick a rollback strategy for `metaStateBatch` under Phase B's versioned-append (differential revert? preflight validation?).
3. Decide: deep-clone patch for short-circuit, or accept second-patch silent-drop and add an explicit test for it?
4. Reconcile BATCH_SIZE_LIMIT (constants.js vs. meta-state.js comment) and size Phase B's batch path accordingly.
5. Add a CI gate that fails when `.gitattributes` is modified without a corresponding Phase-B-shape writer.

---

**End of red-team failure-mode-analyst review.**

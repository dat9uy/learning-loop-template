# Code Review — bf64ee1 "feat(meta-state): promote archived into schema enum + add restore tool"

**Plan:** plans/260731-1325-meta-state-archive-lifecycle-honest-schema-enum-restore-tool/ (plan.md + 4 phases, all read in full)
**Base:** bf64ee1~1 → **HEAD:** bf64ee1 (single commit, 28 files, +821/−77)
**Review mode:** read-only. Tests executed: `core/restore-entry.test.js`, `core/meta-state.test.js`, `core/entry/{finding,rule,loop-design}.test.js` (55/55 green), `__tests__/legacy-mcp/meta-state-unarchive-tool.test.js`, `meta-state-archive-tool.test.js`, `cli-write-tool-set.test.js` (21/21 green). Plus a standalone empirical probe of the D1 recovery-filter scenario (/tmp/d1-check.mjs, no repo mutation).

## Verdict: SHIP with one Important test-quality fix

Spec compliance is high. All 10 acceptance criteria are met or met-in-substance; all red-team corrections C1/D1/D2/H1/H2/M1/M2 are implemented as specified. One Important finding: the D1 regression test is a phantom — it passes with the load-bearing recovery filter removed (proven empirically). The production code itself is correct.

---

## Acceptance Criteria Audit

| # | Criterion | Status |
|---|-----------|--------|
| 1 | 3 factories accept `archived` via direct `schema.parse`; parse-for-read.js deleted, no importers | MET — enums at meta-state.js:362, 539, 615; file deleted; grep confirms zero production importers (only a comment mention); placement.yaml entry removed |
| 2 | `meta_state_relationships` over archived entry: no ZodError (regression test) | MET (finding, in unarchive tool roundtrip test). Rule/loop-design kinds covered at factory level by entry tests; no per-kind relationships regression — acceptable, same crash class |
| 3 | writeEntry + batch case:"write" reject forged `status:"archived"` with clear reason | MET with caveat — writeEntry throws InvalidEntryError whose zod issues mention "archived" (test asserts `/archived/`); batch case:"write" collapses to generic `validation_failed` (meta-state.js:1824-1825), losing the guard's message. See Finding 4 |
| 4 | `CANONICAL_STATUS_KEYS`/`by_status` unchanged | MET — not touched in diff; full stats path green |
| 5 | restoreEntry: pre-archive live status+content via readRegistryAllVersions, clears archived_*/tombstone_kind, version = tombstone+1, assertinvariant-wrapped | MET — meta-state.js:1501-1581; roundtrip test proves all of it |
| 6 | Rejections: not_archived / not_archived (change-log) / delete_not_restorable (no flag), bucket shape, mutation-does-not-run, D1 filter | MET in code; golden-fixture test covers all rejections + no-append guards. D1 filter present and load-bearing in code — but its test is phantom (Finding 1) |
| 7 | Tool rides CLI+MCP; classified in manifest.json + agent-manifest.json + CLI_WRITE_TOOLS; no allow_delete_restore | MET — all 3 sites updated; drift/classification tests green; no flag anywhere (grep-clean) |
| 8 | End-to-end archive → relationships → unarchive → relationships | MET — meta-state-unarchive-tool.test.js roundtrip test |
| 9 | docs/meta-state-lifecycle.md + hint-registry.js:84 updated | MET — Decision #1 inverted, terminal framing collapsed to one set, Restore Mechanics section, transitions, tools table row; hint rewritten |
| 10 | C1 repoint before resolve; both findings resolved; loop-design logged/shipped; stale premises corrected; file-index refreshed | MET in substance — see Findings 5/6 for two literal-text gaps (source_refs citation, evidence_test field) |

Red-team corrections: C1 done (v1 patch line repoints evidence_code_ref to core/meta-state.js before v2 resolve line — ordering correct in the JSONL). D1 filter present (meta-state.js:1542-1547). D2/H2 bucket shape `{restored:false, reason, id}` matches archiveEntry's `{archived:false, reason, id}`. H1: no change_log_immutable branch. M1: no allow_delete_restore. M2: no persisted restored_* fields (only in the return value, gate-logged by handler — as designed).

---

## Critical Issues

None.

## Important

### 1. CONFIRMED — D1 tombstone-recovery test is a phantom: passes with the filter removed
**File:** tools/learning-loop-mastra/core/restore-entry.test.js:153-213 ("recovery filter excludes prior tombstones")
**Severity:** Important (test quality — the one test guarding the red-team D1 load-bearing fix proves nothing)

The test intends to prove the `e.status !== "archived"` recovery filter (meta-state.js:1545) but constructs a scenario where the filter is a no-op:
- Seed: v0 open → archiveEntry (v1 archive tombstone) → batch-delete (v2 delete tombstone).
- The test then **drops the v2 delete line entirely** and **bumps the v1 archive tombstone to version 99**.
- Result: the only line with `version < 99` for that id is v0 open. The candidate set contains **zero archived lines**, so deleting the `status !== "archived"` filter from restoreEntry changes nothing — the test still passes.

Empirical proof (read-only probe /tmp/d1-check.mjs): Variant A (the test's construction) — candidates without the filter = `[{v:undefined, status:"open"}]`; filter removes 0 lines. Variant B (the true D1 scenario: keep both tombstones, patch v2's tombstone_kind to "archive") — without the filter the reduce picks `{v:1, status:"archived"}` → frankenstein "restored but still archived" line; with the filter (actual code) restoreEntry returns `restored:true, restored_status:"open"`.

**Failure scenario the test was meant to catch:** archive → batch-delete (v2) → delete tombstone rewritten as archive-kind → restore picks the v1 archive tombstone (higher version than v0), clears its markers, and appends a "restored" line that is `status:"archived"` — invisible to meta_state_list, silently re-archived.

**Fix:** construct Variant B in the test — after batch-delete, rewrite the v2 line's `tombstone_kind` from "delete" to "archive" **in place** (keep version 2) instead of dropping it and bumping v1. Then candidates below the tombstone are {v0 open, v1 archive tombstone}; without the filter the reduce picks v1 and `restored_status` would be "archived" — the test fails if the filter regresses. The current dead `maxLine` variable + "avoid unused warning" assertion (test line ~207-212) is also slop that falls out of this fix.

### 2. CONFIRMED — batch case:"write" rejection loses the guard's reason (AC#3 "clear reason" partially unmet)
**File:** tools/learning-loop-mastra/core/meta-state.js:1824-1825
**Severity:** Important→Minor boundary (pre-existing pattern, but the AC explicitly says "clear reason")

`metaStateBatch` case:"write" does `if (!validation.success) throw new Error("validation_failed")` — the zod issue carrying the guard's message ("status:\"archived\" is a tombstone status appended only by archiveEntry/deleteEntry…") is discarded. An agent forging via batch gets an opaque `validation_failed` with no hint that `archived` is the problem or which tool to use. writeEntry (line 1228-1230) wraps the full ZodError in InvalidEntryError, so its path is clear. The batch test (meta-state.test.js, new guard suite) accommodates this by accepting `/archived|validation_failed/` — encoding the loss. Fix: include `validation.error.issues` in the thrown error/reason, as writeEntry already does. (Note: this generic-throw predates the commit for other validation failures; the commit had the opportunity to meet AC#3 fully on the batch path and did not.)

## Minor

### 3. CONFIRMED — AC#10 literal gap: loop-design id not cited in either finding's source_refs / resolution
The plan requires the loop-design decision entry be "cited in both findings' `source_refs`". The resolved finding lines (meta-state.jsonl v2 of meta-260731T1102Z, v20 of meta-260614T1236Z) contain no `source_refs` field and their `resolution` texts cite "Plan 260731-1325" but never `loop-design-meta-state-archive-lifecycle-honest-schema-enum-write-bounda`. The reverse direction exists (the loop-design's `addresses` lists both findings), and findings have no source_refs field in their schema (source_refs is a meta_state_report field), so the intent is arguably covered — but the AC as written is not literally satisfied. Non-blocking; fix by amending resolution text or accept the addresses-link as the citation.

### 4. CONFIRMED — write-side finding's dead `evidence_test` field not corrected
Phase 4 step 5 / red-team M3 says the dead path `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` should be corrected "for hygiene". The resolved v20 line still carries the dead value in `evidence_test`; only the resolution prose mentions the live path. evidence_test is never file-hashed, so no gate impact — cosmetic.

### 5. CONFIRMED — success return adds `reason: reason ?? null` not in the plan stub
meta-state.js:1576. Harmless (audit-friendly, handler spreads named fields only), but it is an un-spec'd deviation from the Phase 2 return contract. Note for the record; no action needed.

### 6. PLAUSIBLE — stale docstring on the union schema
meta-state.js:649 comment still says "Cross-cutting union validator — for readRegistry validation, loop_describe, etc." Verified: no read path consumes the union (readRegistry uses raw JSONL parse fns; the only consumers are writeEntry:1228, batch-write:1824, tryClaimSessionId:2175). With the new superRefine the union is now *exclusively* a write gate, and the stale "readRegistry validation" framing invites a future caller to validate reads through it — which would now reject every archived tombstone row on disk. The new guard comment block above it mitigates but doesn't remove the stale sentence. Fix: delete/correct the first line of that docstring.

## Regression Risk from parseForRead Deletion (explicitly checked)

- All other read paths: `loadPromotedRules` (gate-logic.js) filters `status==="active"` before parse — archived rules excluded before any schema sees them. `meta_state_list` filters archived at the tool layer. Factories are the only schema.parse-on-disk-row paths; all 3 now accept `archived`. No residual crash surface found.
- Patch path: `status` is on IMMUTABLE_PATCH_FIELDS, enforced at meta-state-patch-tool.js:106 and metaStateBatch case:update:1884-1885 — the forge vector via patch stays closed even though the finding patch schema now technically admits "archived" in its enum. The core-level `updateEntry` passthrough-patch gap is pre-existing (red-team S5, plan open-question (f)) and unchanged by this commit — not a regression.

## Concurrency / Edge Cases (checked, no defects)

- archive→restore→archive→restore: candidates below the new tombstone = {v0, v2-restore}; reduce picks v2 (most recent live) — correct.
- Restore after delete: rejected `delete_not_restorable` before the scan — correct.
- Restore-after-restore (already active): `not_archived` — correct.
- Unknown/empty id: `not_found`, no append — correct.
- Version collision: impossible — enqueue + withRegistryLock serialize; version = tombstone+1 under lock; invalidateCache after append.
- `readRegistryAllVersions` reads change-log.jsonl too: change-log ids exit at `not_archived` before the scan; the scan is id-scoped — safe (H1 holds).

## DRY/YAGNI/KISS / AI-slop notes

- Handler (meta-state-unarchive-tool.js) is a clean shim mirroring the archive tool; gate-log append names fields explicitly rather than spreading — fine.
- restoreEntry mirrors archiveEntry/deleteEntry structure; comments are dense but explain real invariants (D1, M1, H1) — acceptable.
- Slop: the D1 test's unused-`maxLine` workaround assertion (Finding 1) and the plan-id-prefixed comments ("Plan 260731-1325 Phase 1/2") sprinkled through production code (meta-state.js, factories) — repo convention appears to tolerate these, but per stable-artifact norms the invariant text would stand alone without plan IDs.

## Metrics

- Tests run: 76/76 green across 8 files (5 core + 3 tool/drift suites)
- parseForRead importers remaining: 0 (grep-verified)
- allow_delete_restore / restored_* persisted fields / change_log_immutable branch: 0 occurrences (grep-verified)

## Unresolved Questions

None blocking. Whether AC#10's "source_refs citation" is satisfied by the loop-design's `addresses` back-reference is a plan-author judgment call (Finding 3).

## Recommended Actions

1. (Important) Rewrite the D1 test per Finding 1 so it actually fails when the recovery filter is removed.
2. (Minor) Surface zod issues in batch case:"write" rejections (Finding 2).
3. (Minor) Fix the stale "for readRegistry validation" docstring line on the union (Finding 6).
4. (Minor) Optionally correct the dead evidence_test field + add loop-design id to resolution texts (Findings 3/4).

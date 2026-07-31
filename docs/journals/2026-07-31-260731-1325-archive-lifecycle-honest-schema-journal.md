---
date: "2026-07-31T08:55:00.000Z"
plan: "260731-1325-meta-state-archive-lifecycle-honest-schema-enum-restore-tool"
status: complete
tags: [meta-state, archive-lifecycle, schema, versioned-append, restore, journal]
---

# Plan 260731-1325 — Archive Lifecycle Honest Schema + Restore Tool

## The Gap

`status:"archived"` was a second-class citizen. `archiveEntry`/`deleteEntry` wrote the tombstone as a true-appended JSONL line, but the per-kind write schemas deliberately excluded `"archived"` from the status enum. Every read path that built an entry factory from a projected (max-version) row — `meta_state_relationships`, `validateCrossRefs`, `outboundRefsAll` — re-parsed the row through the same write schema, so any archived row crashed the parse. A band-aid (`core/entry/parse-for-read.js`) stripped+restored `"archived"` around the parse in 3 factories.

Two open findings pinned the gap:
- `meta-260731T1102Z-under-the-append-only-versioned-append-cli-surface-meta-stat` (read-side: archived tombstones crash factory-built reads)
- `meta-260614T1236Z-no-mcp-path-exists-to-unarchive-a-meta-state-entry-or-transi` (write-side: no MCP path to undo an erroneous archive; direct JSONL edit was the documented recovery)

## The Decision

Honest schema (brainstorm approach A). Promote `"archived"` into the per-kind enums (finding/rule/loop-design) so `schema.parse` accepts what the tombstone already writes. The band-aid accrues callers — every factory-built read path had to remember to wrap its parse. The parse-crash class was load-bearing; any new entry factory would have to remember the workaround.

The trade-off flipped: the union `metaStateEntrySchema` (the write-validation gate) now needs a `superRefine` rejecting caller-supplied `status:"archived"`. Reads use per-kind schemas via factories; the guard is write-only. `archiveEntry`/`deleteEntry` bypass the union via `trueAppendAtomicRaw`; the guard closes the forge vector without affecting reads or legitimate archive writes.

Restore: a sanctioned `meta_state_unarchive` tool backed by `restoreEntry(root, id, reason)` — true-append a new line that supersedes the archive tombstone (max-by-version wins), restoring the pre-archive **live** status + content via `readRegistryAllVersions`. Wrapped with `assertinvariant` for the `not_archived` pre-condition. No `allow_delete_restore` flag (the incident was an erroneous archive, not delete). No persisted `restored_*` audit fields (the restored line IS the pre-archive state at a new version; the version sequence is the audit trail).

## Red-Team Corrections Applied

- **C1 (CRITICAL):** deleting `parse-for-read.js` made finding `meta-260731T1102Z` its own orphan in the global `rule-no-orphaned-evidence` consult-gate. Repoint the `evidence_code_ref` to `core/meta-state.js` + refresh the file index BEFORE the first resolve.
- **D1 (HIGH):** the recovery filter MUST exclude prior tombstones (`e.status !== "archived"`) so `archive → batch-delete → restore` never picks a prior archive tombstone and produces a "restored" line still archived.
- **H1:** no `change_log_immutable` branch — change-logs are always `status:"active"`, so `assertArchivedTombstone` returns `not_archived` first; adding the branch would be dead code.
- **M1 (YAGNI):** no `allow_delete_restore` flag — delete-tombstones reject unconditionally.
- **L1 (LOW):** collapse the two-set terminal framing (`{resolved,superseded}` schema-enum vs `{resolved,superseded,archived}` predicate-effective) — after the enum change, they are identical.

## Implementation

- **Phase 1:** added `"archived"` to the 3 status enums; added union `superRefine` rejecting caller-supplied `status:"archived"`; deleted `parse-for-read.js`; updated 3 factories to call `schema.parse` directly.
- **Phase 2:** added `restoreEntry(root, id, reason)` + `assertArchivedTombstone` helper. Recovery filter excludes prior tombstones. Golden-fixture + roundtrip + D1 tests.
- **Phase 3:** created `meta-state-unarchive-tool.js` handler. Classified in `tools/manifest.json` + `agent-manifest.json` + `CLI_WRITE_TOOLS`. Roundtrip + invariant rejection tests. 5/5 green.
- **Phase 4:** updated `docs/meta-state-lifecycle.md` (Status Definitions, Terminal vs Non-Terminal collapsed, Archive Mechanics + Restore subsection, Transitions, Tools table, Decision #1 inverted). Updated `core/hint-registry.js:84` warm hint. Repointed finding 2 evidence (C1). Created + shipped loop-design `loop-design-meta-state-archive-lifecycle-honest-schema-enum-write-bounda` citing this plan. Resolved both source findings. Refreshed file index for all touched cited code paths.

## Test Results

Full suite: 2730 tests, 2729 passed, 0 failed. Touched test files: `core/entry/finding.test.js`, `core/entry/rule.test.js`, `core/entry/loop-design.test.js`, `core/meta-state.test.js`, `core/restore-entry.test.js` (new), `__tests__/legacy-mcp/meta-state-unarchive-tool.test.js` (new), `__tests__/legacy-mcp/meta-state-archive-tool.test.js` (regression), `__tests__/legacy-mcp/meta-state-relationships-tool.test.js` (regression), `__tests__/cli-write-tool-set-drift.test.js`, `__tests__/legacy-mcp/runtime-agnostic.test.js`. Adjusted count assertions in `__tests__/cli-mcp-subset-registration.test.js`, `__tests__/cli-write-tool-set.test.js`, `__tests__/cold-session-enumerate-mastra.test.cjs`, `__tests__/manifest-arithmetic.test.cjs`, `__tests__/legacy-mcp/cold-session-discoverability.test.cjs`, `__tests__/legacy-mcp/tool-deletion-coverage.test.js`, `__tests__/workflow-parity.test.cjs`. Updated `cli-context-savings-script.test.js.snap` for the new tool's bytes + sketch. Removed `parse-for-read.js` reference from `core/placement.yaml`.

## Follow-ups (Out of Scope)

- (a) a `restore` op in `metaStateBatch` (`BATCH_OP_TYPES` has no `"restore"`)
- (b) wiring the referenced-but-absent `check_assertinvariant_coverage` MCP tool
- (c) bulk multi-id unarchive
- (d) an `allow_delete_restore` flag if an erroneous-delete incident occurs
- (e) upstream hardening — make `deleteEntry` + batch `case:"delete"` reject already-archived targets via `assertNotArchived` (the recovery `status !== "archived"` filter is sufficient alone; this is defense-in-depth)
- (f) `updateEntry` lacks an `IMMUTABLE_PATCH_FIELDS` check for direct core callers (pre-existing)

## What Worked

- TDD with the per-kind factory tests as the load-bearing red signal: the tests were the cleanest expression of "the enum must accept archived."
- Treating the write-boundary guard and the read-side enum as the SAME decision, not two. The union refine is a 1-line refactor of the pre-existing union; the per-kind enum changes are 3 single-element additions.
- Single-source-of-truth for the bucket rejection shape (`{restored:false, reason, id}`) DRY with `archiveEntry`'s `{archived:false, reason, id}`. No shape divergence between the two archive-lifecycle operations.
- C1 repoint as a separate "Phase 4 step 3, before any resolve" — doing the resolve first would have deadlocked the consult-gate on a missing file.

---
phase: 2
title: "restoreEntry core function + assertinvariant wrapping"
status: pending
priority: P0
effort: "3h"
dependencies: [1]
---

# Phase 2: restoreEntry core function + assertinvariant wrapping

## Overview

Add `restoreEntry(root, id, reason)` to `core/meta-state.js` — a true-appended line that supersedes the archive tombstone (max-by-version wins), restoring the pre-archive **live** status + content. Mirror `archiveEntry`'s `enqueue` + `withRegistryLock` + `trueAppendAtomicRaw` + `invalidateCache` structure; wrap the `not_archived` pre-condition with `assertinvariant`. No `allowDeleteRestore` flag (red-team M1 — delete-tombstones reject unconditionally). No persisted `restored_*` fields (validation decision — the restored line is the pre-archive state at a new version; the restore action is audited in the gate log, not the registry line). TDD: golden-fixture invariant tests + roundtrip test first.

## Requirements

- **Functional:** `restoreEntry` reads the pre-tombstone **live** version via `readRegistryAllVersions(root)` (all version lines per id, sorted), true-appends a new line with `status = preTombstone.status`, `archived_*` + `tombstone_kind` cleared, `restored_at`/`restored_by`/`restored_reason` stamped, `version = tombstone.version + 1` (new max → projection picks it). The archive tombstone line stays on disk (union-safe; never removed).
- **Non-functional — rejection shape (DRY with archiveEntry):** returns the bucket-style `{restored:false, reason:"…", id}` (mirrors `archiveEntry`'s `{archived:false, reason, id}`). `assertinvariant` wraps the one invariant pre-condition for gate-log audit: `not_archived` (via `assertArchivedTombstone`, inverted `assertNotArchived` + `reason_code:"not_archived"`). This single wrapper covers both already-active AND change-log targets (both are `status !== "archived"` → `not_archived`); there is no separate `change_log_immutable` branch (red-team H1). Plain `return`s (no assertinvariant) handle: missing id (`not_found`), delete-tombstone (`delete_not_restorable`), no prior live version (`no_pre_tombstone_version` — defensive).
- **Non-functional — tombstone recovery guard (red-team D1):** the pre-tombstone recovery filter MUST exclude prior tombstone lines (`e.status !== "archived"`), picking the most recent **live** line below the current tombstone. Without this, `archive → batch-delete(op:delete) → restore` is reachable (deleteEntry / batch `case:"delete"` do not reject already-archived targets, unlike batch `case:"archive"` which calls `assertNotArchived`) and the reduce would pick the prior archive tombstone (`status:"archived"`), then clear its markers → a "restored" line that is still archived and hidden by `meta_state_list`. The filter fix is load-bearing; it is correct across every cycle (archive→restore; archive→restore→archive→restore) and closes the frankenstein-tombstone failure.
- **Non-functional:** `restoreEntry` is a boundary mutation op owning agent-relevant invariants → must be wrapped (rule `assertinvariant-at-boundary`). Since no automated boundary-coverage test exists, this phase ADDS a golden-fixture test so the invariant is test-enforced, not agent-remembered.

**Red-team corrections locked:**
- **No `change_log_immutable` branch in restoreEntry** (red-team H1): change-logs are always `status:"active"` (schema `z.literal("active")`) and can never be archived, so `assertArchivedTombstone` returns `not_archived` before any entry_kind check. The `change_log_immutable` requirement is dropped; the honest reason for a change-log id is `not_archived`. (The `assertNotChangeLog`-style guard remains unused here — do not add dead code.)
- **No `allow_delete_restore` flag** (red-team M1, YAGNI): the motivating incident (`meta-260614T1236Z`, subtype `escape-hatch-abuse`) was an erroneous *archive*, not delete. `tombstone_kind:"delete"` is rejected unconditionally with `delete_not_restorable` — no flag, no branch, no test case. This also closes D1's `archive→batch-delete→restore(true)` cycle upstream (delete-tombstones are un-restorable). Add the flag only if an erroneous-delete incident actually occurs.

## Architecture

Mirror `archiveEntry` (`meta-state.js:1375-1407`) and `deleteEntry` (L1425-1469):

```js
export function restoreEntry(root, id, reason) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const projected = readRegistry(root);
      const idx = projected.findIndex((e) => e.id === id);
      if (idx === -1) return { restored: false, reason: "not_found", id };
      // assertinvariant wrapper (gate-log audit); returns boolean (mirrors assertNotArchived).
      // Covers change-logs too: they are status:"active", so this returns not_archived
      // before any entry_kind check — no separate change_log_immutable branch (red-team H1).
      if (!(await assertArchivedTombstone(projected, idx, root, id))) {
        return { restored: false, reason: "not_archived", id };
      }
      const current = projected[idx];
      // Delete is a stronger operator intent than archive; not restorable (red-team M1, no flag).
      if (current.tombstone_kind === "delete") {
        return { restored: false, reason: "delete_not_restorable", id, tombstone_kind: "delete" };
      }
      // Recover pre-tombstone LIVE line: every version for this id below the tombstone,
      // EXCLUDING prior tombstones (status:"archived"). Without the status!=="archived"
      // guard, archive→batch-delete→restore would pick the prior archive tombstone and
      // clear its markers → a "restored" line that is still archived (red-team D1).
      const allVersions = readRegistryAllVersions(root);
      const tombstoneVersion = current.version ?? 0;
      const preTombstone = allVersions
        .filter((e) => e.id === id && (e.version ?? 0) < tombstoneVersion && e.status !== "archived")
        .reduce((a, b) => ((b.version ?? 0) > (a.version ?? 0) ? b : a), null);
      if (!preTombstone) return { restored: false, reason: "no_pre_tombstone_version", id };

      const restoredAt = new Date().toISOString();
      // The restored line IS the pre-archive state at a new version — no restore-specific
      // audit fields (validation decision: "when we read, we always read the final version";
      // the version sequence [v0 open, v1 archive tombstone, v2 open] is the audit trail).
      // The restore *action* is recorded in the gate log via the return's restored_at, not
      // in the registry line. restored_* are NOT persisted; archived_*/tombstone_kind deletes
      // are defensive (preTombstone, a live line, won't carry them).
      const restoredEntry = {
        ...preTombstone,
        status: preTombstone.status,   // pre-archive status, NOT "open"
        version: tombstoneVersion + 1,
      };
      delete restoredEntry.archived_at;
      delete restoredEntry.archived_by;
      delete restoredEntry.archived_reason;
      delete restoredEntry.tombstone_kind;   // defensive — preTombstone won't have it
      trueAppendAtomicRaw(root, getRegistryPath(root), restoredEntry);
      invalidateCache(root);
      return { restored: true, id, restored_status: preTombstone.status, restored_at: restoredAt, version: tombstoneVersion + 1 };
    })
  );
}
```

`assertArchivedTombstone` mirrors `assertNotArchived` (L1103-1119) inverted: `check: (e) => e.status === "archived"`, `returnOnFail: { reason_code: "not_archived", id }`. It returns a boolean; restoreEntry maps the false case to `{restored:false, reason:"not_archived", id}` (bucket shape, DRY with `archiveEntry`'s `{archived:false, reason, id}` — red-team D2/H2). The `assertinvariant` `returnOnFail.reason_code` goes to the gate log for audit; it is NOT surfaced in the tool return.

**Design decisions (locked):**
- `tombstone_kind` is **cleared** (not set to `"restore"`) — a restored line is a live entry, not a tombstone; the version history (archive tombstone + restore line) is the audit trail.
- **No persisted `restored_*` audit fields** (validation decision): the restored line IS the pre-archive state at a new version — `readRegistry`'s projected (max-version) read shows the restored status, so the restore is self-evident from the version sequence. The restore *action* is audited in the gate log (via the return's `restored_at`, spread into the `appendGateLog` call in Phase 3), NOT in the registry line. This drops `restored_at`/`restored_by`/`restored_reason` from the on-disk line and the `restoredBy` param from the signature. (Red-team M2 is moot — no `restored_*` fields to be stripped on read.)
- **Status restoration source:** read the pre-tombstone **live** version via `readRegistryAllVersions` (auto-restore prior status + content; no caller burden).
- `restoreEntry` bypasses the union `metaStateEntrySchema` (uses `trueAppendAtomicRaw`, like `archiveEntry`) — so the Phase 1 write-guard does not block legitimate restore.
- **Optional defense-in-depth (not required by this plan):** make `deleteEntry` + batch `case:"delete"` reject already-archived targets via `assertNotArchived` (mirroring batch `case:"archive"` at L1788), so tombstones can never stack. The recovery `status !== "archived"` filter is the load-bearing fix and is sufficient alone; the upstream hardening is a separate behavior change tracked as a follow-up (validation confirmed: leave as follow-up).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` (add `restoreEntry` near `archiveEntry` L1375; add `assertArchivedTombstone` near `assertNotArchived` L1103; export `restoreEntry`)
- Test: `tools/learning-loop-mastra/core/meta-state.test.js` or a new `core/restore-entry.test.js` (golden-fixture invariant + roundtrip, mirroring `core/operation-invariant.test.js`)

## Implementation Steps

1. **RED — invariant golden-fixture:** Seed a temp registry (mirror `meta-state-archive-tool.test.js` seeding: `mkdtempSync`, `GATE_ROOT`, inline `writeFileSync`) with: an already-active finding, a change-log (status:"active"), an archive-tombstone finding (`tombstone_kind:"archive"`), a delete-tombstone finding (`tombstone_kind:"delete"`). Assert `restoreEntry` on each rejects with the bucket shape `{restored:false, reason:"…", id}` (NOT `{ok, reason_code}` — red-team D2/H2): already-active → `not_archived`; change-log → `not_archived` (red-team H1: change-logs are active, so assertArchivedTombstone returns not_archived; there is NO change_log_immutable branch); delete-tombstone → `delete_not_restorable` (no flag — red-team M1). AND assert the registry is byte-unchanged (mutation guard — no new line appended). RED (function doesn't exist).
2. **RED — roundtrip:** Seed an open finding → `archiveEntry` → `restoreEntry` → assert `readRegistry` shows `status:"open"` (pre-archive), `archived_*` absent, `tombstone_kind` absent, `version` = tombstone+1, and the tombstone line still on disk (`readRegistryAllVersions` length grew by 1). RED.
3. **RED — D1 tombstone-recovery guard:** Seed an open finding → `archiveEntry` (v1 archive tombstone) → `metaStateBatch` `{op:"delete"}` (v2 delete tombstone) → `restoreEntry`. Assert it returns `{restored:false, reason:"delete_not_restorable"}` (delete-tombstone is un-restorable, no flag). Separately, seed open → archive → batch-delete → then patch the delete tombstone to `tombstone_kind:"archive"` (or assert directly via a unit test on the filter): the recovery filter `e.status !== "archived"` MUST pick the v0 live line, not the v1 archive tombstone. Assert the restored line's `status` is the pre-archive value (e.g. "open"), never "archived". RED until the filter is in place.
4. **GREEN:** Implement `assertArchivedTombstone` + `restoreEntry` per the architecture stub (with the `status !== "archived"` filter). Tests GREEN.
5. Verify `operation-invariant.test.js` still green (the primitive is unchanged; `restoreEntry` is a new consumer). Confirm `archiveEntry`/`deleteEntry` behavior unchanged.

## Success Criteria

- [ ] `restoreEntry` restores pre-archive status + content via `readRegistryAllVersions` (filtering out prior tombstones); clears `archived_*` + `tombstone_kind`; bumps version past tombstone; tombstone line preserved.
- [ ] D1 guard: recovery never picks a prior tombstone (`status:"archived"`) as the pre-tombstone line (red-team D1 test green).
- [ ] Golden-fixture test: rejects already-active (`not_archived`), change-log (`not_archived` — no dead change_log_immutable branch), delete-tombstone (`delete_not_restorable`, no flag) — bucket `{restored:false, reason, id}` shape + mutation-did-not-run guard.
- [ ] `restoreEntry` wrapped with `assertinvariant` (pre-state-only, inside `withRegistryLock`) for the `not_archived` pre-condition (gate-log audit); the single `assertArchivedTombstone` wrapper covers both already-active and change-log targets.
- [ ] `pnpm test:one` green on `core/meta-state.test.js`, `core/operation-invariant.test.js`, new restore test.

## Risk Assessment

- **Risk (red-team D1, resolved):** recovery picks a prior tombstone (`archive→batch-delete→restore`), yielding a "restored" line still `status:"archived"`. **Mitigation:** the `e.status !== "archived"` filter is load-bearing; step 3's test proves it. Optional upstream hardening (make deleteEntry/batch-delete reject already-archived) is a separate follow-up, not required.
- **Risk:** A corrupted registry (tombstone with no prior **live** version line). **Mitigation:** the `no_pre_tombstone_version` defensive guard returns a structured reason rather than throwing.
- **Risk:** `readRegistryAllVersions` returns both files (meta-state + change-log); a stray could let restore touch a change-log line. **Mitigation:** change-logs are `status:"active"`, so `assertArchivedTombstone` returns `not_archived` before the version scan; the version filter is also scoped to `e.id === id`. No separate `entry_kind === "change-log"` branch is needed (red-team H1 — adding one would be dead code).
- **Risk:** Legacy entries with missing `version` (treated as 0). **Mitigation:** `reduce` max-by-version handles 0; the tombstone always has a numeric version (`archiveEntry` sets `version: (current ?? 0) + 1`).
- **Risk:** The assertinvariant rule is agent-enforced; forgetting the wrapper. **Mitigation:** the golden-fixture test asserts the `not_archived` rejection shape, which only the `assertArchivedTombstone` wrapper produces — a missing wrapper fails the test. (Note: only `not_archived` goes through assertinvariant; `not_found`/`delete_not_restorable`/`no_pre_tombstone_version` are plain returns — the test covers all paths regardless.)

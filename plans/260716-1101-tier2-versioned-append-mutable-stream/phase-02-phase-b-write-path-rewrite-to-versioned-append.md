---
phase: 2
title: "Phase B: Write-Path Rewrite to Versioned-Append"
status: completed
priority: P1
dependencies: [1]
shipped_at: "2026-07-16T12:55:00.000Z"
shipped_by: "operator"
shipped_via: "PR #65 (merge e9e02a6, 2026-07-16)"
test_summary: "TDD: trueAppendAtomic crash-safety + canonical-compare + write-path append/no-op + archived-tombstone + batch-delete routing. Full suite green post-Phase B."
---

# Phase 2: Phase B — Write-Path Rewrite to Versioned-Append

## Overview

Rewrite the mutable-stream write path so no line is ever replaced: `writeEntry` (new) true-appends a v0 line; `updateEntry`/`archiveEntry`/`deleteEntry`/`shipLoopDesign`/`metaStateBatch` append a new highest-version line instead of mutating-in-place + full-rewrite. Adds the no-op short-circuit that resolves `meta-260715T2311Z-gratuitous-mutations`. `deleteEntry` becomes an `archived` tombstone append (hard-delete is gone). No `.gitattributes` flip yet — Phase B is internal correctness; cross-branch parallel appends still conflict at merge until Phase C.

## Requirements

- **Functional:** every mutation appends a new JSONL line with `version = maxVersionForId + 1`; no existing line is modified or removed. `updateEntry` short-circuits (no append, no version bump) when the patch produces no field change. `deleteEntry` appends `status: "archived"` + `archived_reason: "deleted: <reason>"`. `meta_state_list` hides archived/delete tombstones via the existing `e.status !== "archived"` filter.
- **Non-functional:** in-process concurrency still safe (per-root `enqueue` queue + `withRegistryLock`). `persistRegistryAtomic` retired for the mutable stream (kept only for compaction). `tableOnly` + `assertNoChangeLogLeak` still guard the change-log leak. All existing tests green.

## Architecture

Today: `appendRegistryEntryAtomic` reads all → pushes → full rewrite; `updateEntry` reads all → mutates in place → full rewrite (with inline compaction); `archiveEntry`/`deleteEntry`/`metaStateBatch` similar.

After:
- **`appendRegistryEntryAtomic`** → `trueAppendAtomic(path, line)` helper. Open file with `O_APPEND | O_CREAT`; `writeSync` the JSON+`\n`; `fsyncSync`; `closeSync`. Drops the read-all. New entries get `version: 0`. The helper is shared with `appendChangeLogEntryAtomic` (line 161) and any future true-append surface.

   <!-- RT: H1 — `trueAppendAtomic` adds explicit fsync. Today's `appendFileSync` does
   NOT fsync (precedent: `change-log:163`, `runtime-state:79`). Process kill mid-write
   leaves a partial-JSON last line; `_readAndParseRegistry`'s blank-line filter at
   `core/meta-state.js:651` doesn't catch it (a partial line parses and throws at
   `core/meta-state.js:658`). fsync is non-negotiable when true-append replaces
   durable full-rewrite. Plan's previous contradiction (`:25` says fsync, `:80` says
   `appendFileSync`) is reconciled here. -->

   The helper also calls `assertNoChangeLogLeak([entry], root)` BEFORE the file write (the guard moves from `persistRegistryAtomic:79` into the new path).

   <!-- RT: H4 — `assertNoChangeLogLeak` (line 127) fires before any persistence to
   `meta-state.jsonl`. Current callers go through `persistRegistryAtomic:79` which
   contains the guard inline. The new true-append path bypasses `persistRegistryAtomic`;
   without this guard, a future caller passing `entry_kind:"change-log"` silently
   leaks a change-log line into `meta-state.jsonl`. Phase C's `merge=union` then
   duplicates the entry (same id) on parallel merge. -->

- **`updateEntry`** → read (validate id exists, invariants, CAS) → compute patched entry via `Object.assign` → **no-op short-circuit** via canonical comparator (see detail below) → if canonical-equal, return `true` with no append → else append new line `version = maxVersionForId + 1`. No full rewrite. Inline compaction removed (no full rewrite to piggyback).
- **`archiveEntry`** → read (validate, `assertNotArchived`, `assertNotChangeLog`) → append new line `status: "archived"`, `archived_at`, `archived_by`, `archived_reason`, `tombstone_kind: "archive"`, `version = maxVersionForId + 1`.

   <!-- RT: H6 — `tombstone_kind: "archive" | "delete"` discriminator. Without it,
   `status: "archived"` from `deleteEntry` and `archiveEntry` are field-identical
   except for `archived_reason` prefix — a casual `meta_state_list({status:"archived",
   include_archived:true})` cannot distinguish. A `tombstone_kind` enum closes the
   audit-shape gap. Migration path: phase-02 emits both fields; older lines without
   `tombstone_kind` are inferred from `archived_reason` prefix. -->

- **`deleteEntry`** → read (validate, `assertNotChangeLog`) → append new line `status: "archived"`, `archived_reason: "deleted: <reason>"`, `archived_at/by`, `tombstone_kind: "delete"`, `version = maxVersionForId + 1`. (Collapse into the archive shape; `tombstone_kind` discriminator distinguishes them.)
- **`meta_state_batch case "delete"`** (line 1370-1378) is the only reachable caller for `deleteEntry` (the function is module-private). Rewrite `case "delete"` to call `deleteEntry(...)` instead of `entries.splice(idx, 1)`; the byte-snapshot rollback at line 1400-1405 must still work because the `deleteEntry` true-append is captured in the pre-batch `readFileSync` snapshot (line 1244).

   <!-- RT: H3 — `meta_state_batch case "delete"` is the only external caller. Today
   it splices lines; Phase B must rewrite it to either (a) route to `deleteEntry`,
   OR (b) keep the in-place splice AND emit a tombstone separately (no-op line + 
   splice = no contract change but loses audit shape). Recommend (a). The
   pre-batch byte-snapshot rollback at `:1400` still works because we capture
   the file's bytes BEFORE the batch. RT: H10 — rollback discipline (byte-snapshot)
   remains valid post-Phase B because we capture file-bytes pre-batch, not
   registry-shape. -->

- **`shipLoopDesign`** → append new line `status: "inactive"`, `shipped_in_plan`, `shipped_at`, `version = maxVersionForId + 1`.
- **`metaStateBatch`** → for each mutated id, append a new versioned line via `trueAppendAtomic`. Change-logs in the batch still true-append to `change-log.jsonl` via `appendChangeLogEntryAtomic`.
- **`tableOnly`** → now "filter change-logs from the read-set before computing max-version-per-id" (still needed; `readRegistry` returns the union).
- **`assertNoChangeLogLeak`** → still fires on any persist site that would write a change-log to `meta-state.jsonl`; the new true-append path now runs it inline (see `appendRegistryEntryAtomic` above).

**No-op short-circuit detail (the `meta-260715T2311Z` resolution):** compare the post-`Object.assign` entry against the existing max-version entry. Use a canonical comparator:

```js
function canonicalize(entry) {
  // sorted-keys JSON.stringify; arrays sorted element-wise (set semantics).
  const sortKeys = (obj) => Object.keys(obj).sort().reduce((acc, k) => {
    const v = obj[k];
    acc[k] = Array.isArray(v) ? [...v].sort() : (v && typeof v === "object" && !Array.isArray(v) ? sortKeys(v) : v);
    return acc;
  }, {});
  return JSON.stringify(sortKeys(entry));
}
```

Then `canonicalize(patched) === canonicalize(existing)` decides no-op. Excluding `version` is implicit (the canonicalizer re-orders both sides identically). A CAS-only call (`_expected_version` present, no other field) is still a no-op → no bump, no append, return `true`.

<!-- RT: C2 — `JSON.stringify` is NOT order-insensitive (`[1,2,3] !== [3,2,1]` under
stringify). Multiple patch fields (`reopens`, `change_diff.added`, `consolidates`,
`applies_to.{tools,surfaces,rules,statuses,schemas}`, `proposed_design_for`,
`addresses`) accept arrays; same set in different order would falsely bump. The
canonical comparator fixes this. Patch must deep-sort all array fields before
compare. RT: H8 — `assertinvariant` is pre-state-only; post-short-circuit
"real change" semantics are encoded in `canonicalize`, not the wrapper. Any future
invariant that must-fire-on-real-change must express via comparator extensions,
not via `assertinvariant`. -->

Guard the promote tool's unconditional `updateEntry(root, id, { status: "open" })` (meta-state-promote-rule-tool.js:190) — with the short-circuit in place it becomes a no-op when already open. Defense-in-depth: a single pre-call check in `meta_state_promote_rule` (not the generic `updateEntry` path) that reads the entry, validates `entry_kind === "finding"`, and bails on `entry.status === "open"`.

**Read-path schema precondition for the short-circuit (H9):** `_readAndParseRegistry` (line 657-664) does not run `metaStateEntrySchema.safeParse`, so legacy entries with no `version` field return `entry.version === undefined`. The canonical comparator above treats `undefined !== undefined` as equivalent (the canonicalizer omits `undefined` values via `Object.keys`), so the short-circuit remains correct. But the projection's `max_by(.version)` mispicks undefined-version entries — already mitigated by Phase A backfill (every entry has `version: 0` post-backfill). Layered defense: Phase B's short-circuit runs `applyDefaults(entry)` (`withDefaults` at line 194) BEFORE `canonicalize` to fill `affected_system` (and any other default that schema apply would have filled) so the canonical form is consistent regardless of whether the entry was read from disk raw or written through schema.

<!-- RT: H9 — `_readAndParseRegistry` doesn't run schema; legacy entries have raw
`version: undefined`. The short-circuit is fine because `canonicalize` ignores
`undefined` keys (deep-sort with absent keys yields same result on both sides).
But this MUST be tested as a precondition — add to TDD step 2: "canonical-equality
holds on a legacy entry lacking schema-defaulted fields". -->

**Agent-side arm of `meta-260715T2311Z`:** prune the stale split-patch guidance (the array-alone/scalar-alone `meta_state_patch` split) from AGENTS.md, CLAUDE.md, and any loop-design/finding docs that still prescribe it. The wire-format bug is fixed (patch tool derives schema from 4-kind records + `deepStripEnvelope`); a single combined `meta_state_patch` call is correct.



## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` — `appendRegistryEntryAtomic` (:139, replace with `trueAppendAtomic`), `persistRegistryAtomic` (:79, retire for mutable stream; keep as compaction primitive), `updateEntry` (:950, add canonical-comparator short-circuit), `archiveEntry` (:1067, add `tombstone_kind`), `deleteEntry` (:1104, add `tombstone_kind`), `metaStateBatch` case "delete" branch (:1370-1378, route to `deleteEntry`), `shipLoopDesign`, `tableOnly` (:99, unchanged)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js` (drop unconditional `updateEntry({status:"open"})`; replace with pre-call guard in the tool — DRY: short-circuit is the blanket fix, call-site guard is defense-in-depth)
- Create: `tools/learning-loop-mastra/core/registry-append-atomic.js` — `trueAppendAtomic(path, line)` helper (open+O_APPEND+writeSync+fsyncSync+closeSync); `assertNoChangeLogLeak([entry], root)` first; shared by `appendRegistryEntryAtomic` and `appendChangeLogEntryAtomic` (already true-append but lacks fsync — both migrate).
- Create: `tools/learning-loop-mastra/core/canonical-compare.js` — `canonicalize(entry)` (sorted-keys + set-semantics on arrays) for the short-circuit.
- Modify: `AGENTS.md`, `CLAUDE.md` — prune stale split-patch guidance; (read-instruction update is Phase C)
- Test: `tools/learning-loop-mastra/__tests__/` — write-path append behavior, no-op short-circuit (canonical comparator with array-reorder, wire-wrapper no-op, nested-object mutation), CAS, archived-tombstone delete, batch append, `trueAppendAtomic` crash-safety (kill -9 mid-write recovery)
- Create: change-log entry recording the `deleteEntry` semantic shift (hard-delete → archived tombstone) + the `meta-260715T2311Z` resolution + the `tombstone_kind` discriminator
- Create: `tools/scripts/compact-registry.sh --check` (read-only stats helper for early-signal between Phase B and Phase C; full run ships in Phase C)
- No change (this phase): `.gitattributes`, `_readAndParseRegistry` (Phase A shipped the projection), `registry-table.sh` (Phase A flipped default)

## Implementation Steps (TDD — tests first)

1. **`trueAppendAtomic` helper test.** Inject a process-kill mid-`writeSync` and verify the file has no partial line (either full line or no line — never mid-JSON). Assert fsync was called.
2. **Canonical-comparator test.** Same-set-different-order arrays (`{reopens:["X","Y"]}` vs `{reopens:["Y","X"]}`) compare equal. Nested-object mutation compares different. Wire-wrapper re-emit compares equal. Whitespace/key-order differences compare equal.
3. **Append-behavior test.** Assert `updateEntry` on a real field change appends a new line (file line count +1) with `version = prev+1`; the old line is unchanged in the file. Assert `writeEntry` of a new id appends a v0 line (no full rewrite — file line count +1, no other line touched).
4. **No-op short-circuit test (the `meta-260715T2311Z` repro).** Assert `updateEntry(root, id, { status: "open" })` on an already-open finding produces zero file change (line count unchanged, mtime unchanged or no append). Assert `meta_state_promote_rule` on an already-open finding is a no-op. Assert a CAS-only call (`_expected_version` matching, no field) is a no-op.
5. **Archived-tombstone delete test.** Assert `deleteEntry` appends a highest-version line with `status: "archived"` + `archived_reason: "deleted: …"` + `tombstone_kind: "delete"`; `meta_state_list` (default) hides it; `meta_state_list({ include_archived: true })` shows it. Assert the old line is unchanged in the file. Assert `meta_state_list({status:"archived", tombstone_kind:"delete"})` filters by discriminator.
6. **CAS still works test.** Assert `_expected_version` mismatch returns `"version_mismatch"` with no append; match proceeds (append).
7. **Change-log immutability still holds test.** Assert `updateEntry`/`archiveEntry`/`deleteEntry` on a change-log id throws `change_log_immutable`; assert `assertNoChangeLogLeak` still fires if a change-log reaches the new true-append path.
8. **Batch append test.** Assert `metaStateBatch` with multiple id mutations appends one new versioned line per mutated id; change-logs in the batch go to `change-log.jsonl`; `case "delete"` routes through `deleteEntry` (tombstone append, not splice).
9. **`metaStateBatch` rollback test.** Mid-batch failure (artificial throw at op 3 of 5) restores `preBatchContent` byte-for-byte; no partial-write line remains. (Snapshot at line 1244 is still valid post-Phase-B because we capture file bytes, not registry shape.)
10. **Implement the write-path rewrite** per Architecture. Retire `persistRegistryAtomic` for the mutable stream (keep it as the compaction primitive, clearly commented). Move `assertNoChangeLogLeak` into `trueAppendAtomic`.
11. **Add the `tombstone_kind` discriminator** in `archiveEntry` and `deleteEntry`; migration: legacy lines without `tombstone_kind` fall back to `archived_reason` prefix inference.
12. **Add the promote call-site guard** at the `meta_state_promote_rule` tool (pre-call check on `entry.status === "open"`); drop the unconditional `updateEntry` at line 190.
13. **Prune stale split-patch guidance** in AGENTS.md/CLAUDE.md; note the single combined call is correct.
14. **Emit the change-log entry** (via `meta_state_log_change`) recording: `deleteEntry` hard-delete → archived tombstone; `meta-260715T2311Z` resolved (canonical-comparator short-circuit + guidance prune); `tombstone_kind` discriminator added; `trueAppendAtomic` adds fsync. Resolve `meta-260715T2311Z` via `meta_state_resolve`.
15. **Ship early-signal helper**: `tools/scripts/compact-registry.sh --check` (read-only `raw_lines/deduped_ids/dead_version_lines/compaction_eligible`); Phase B ships --check now, Phase C ships --full.
16. **Run focused tests**: `pnpm exec vitest run --bail=1` on the meta-state write-path suite; then `pnpm test:iter`. Fix regressions, do not weaken tests. Run `pnpm exec vitest --changed` post-edit.
17. **Do NOT close `meta-260715T0633Z-…-finding-stream-…`** — it stays open as the Tier 2 ticket until Phase C lands.

## Success Criteria

- [x] Append-behavior test passes (mutations append; old lines untouched).
- [x] No-op short-circuit test passes (`meta-260715T2311Z` repro = zero file change).
- [x] Archived-tombstone delete test passes; `meta_state_list` hides tombstones.
- [x] CAS test passes; change-log immutability test passes; batch append test passes.
- [x] `meta-260715T2311Z-gratuitous-mutations` resolved + change-log entry emitted.
- [x] Stale split-patch guidance pruned from AGENTS.md/CLAUDE.md.
- [x] `meta-260715T0633Z-…-finding-stream-…` still OPEN (Tier 2 ticket) — closed at Phase C.
- [x] Full meta-state test suite green (`pnpm test:iter`).
- [x] No `.gitattributes` change this phase.

## Risk Assessment

- **No-op short-circuit false-negative** (skips a real change) → mitigated by canonical comparator (sorted-keys + set-semantics on arrays); TDD step 2 covers the canonical cases + a real-change counter-test.
- **No-op short-circuit false-positive** (appends despite no change) → mitigated by canonical-equality; repro test asserting zero file change.
- **`deleteEntry` callers expecting true erasure** → mitigated by the change-log entry documenting the shift; the projection + `meta_state_list` filter preserve the observable "gone" behavior; `tombstone_kind` discriminator surfaces the difference in audit. Surface in PR body.
- **`meta_state_batch case "delete"` left untouched** → mitigated by step 8 in Implementation Steps; explicit test routes through `deleteEntry`.
- **`assertNoChangeLogLeak` bypassed by new path** → mitigated by guard embedded in `trueAppendAtomic` (step 7 + step 10); regression test covers `entry_kind: "change-log"` reaching the new path.
- **`tombstone_kind` collides with `meta_state_archive`** → mitigated by `tombstone_kind: "archive" | "delete"` discriminator + per-discriminator filter support.
- **Compaction hook lost + file growth between Phase B and Phase C** → mitigated by `compact-registry.sh --check` shipping in Phase B (early signal); full compaction in Phase C. File growth is observable.
- **Append not atomic across crash** → mitigated by `trueAppendAtomic(path, line)` helper with explicit `fsyncSync`; TDD step 1 (kill -9 mid-write recovery).
- **`_readAndParseRegistry` returns raw entries (no schema validation)** → mitigated by `canonicalize` ignoring `undefined` keys + `applyDefaults` before compare; precondition tested in TDD step 4.
- **`assertinvariant` doesn't see post-short-circuit semantics** → mitigated by encoding any "real change" invariant in the comparator; documented inline.
- **Parallel-branch appends still conflict at EOF** → expected; not fixed until Phase C flip. Phase B does not claim to remove the cross-branch speed limiter.
- **`metaStateBatch` rollback discipline** → byte-snapshot at line 1244 + writeFileSync restore at lines 1263/1401/1506 still valid post-Phase-B (we capture file bytes pre-batch, not registry shape).

### Whole-Plan Consistency Sweep

- Architecture: `trueAppendAtomic` helper added (H1); `assertNoChangeLogLeak` moves into the new path (H4); `case "delete"` rewrite explicit (H3); `tombstone_kind` discriminator (H6); canonical comparator replaces `JSON.stringify` (C2); `assertinvariant` precondition documented (H8); `applyDefaults` before compare (H9); batch rollback still valid (H10).
- Related Code Files: `canonical-compare.js` and `registry-append-atomic.js` created; `metaStateBatch` case "delete" added; `compact-registry.sh --check` ships in Phase B (H7).
- Implementation Steps: 17 steps (was 12); new tests for fsync + canonical comparator + tombstone_kind + batch delete routing.
- Risk Assessment updated: 12 risks tracked.
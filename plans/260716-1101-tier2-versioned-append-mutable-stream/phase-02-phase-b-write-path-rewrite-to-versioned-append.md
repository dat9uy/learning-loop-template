---
phase: 2
title: "Phase B: Write-Path Rewrite to Versioned-Append"
status: pending
priority: P1
dependencies: [1]
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
- **`appendRegistryEntryAtomic`** → true append (open file, append one line, fsync). Drop the read-all. New entries get `version: 0`.
- **`updateEntry`** → read (validate id exists, invariants, CAS) → compute patched entry via `Object.assign` → **no-op short-circuit**: compare patched entry vs existing max-version entry field-by-field excluding `version`; if identical, return `true` with no append → else append new line `version = maxVersionForId + 1`. No full rewrite. Inline compaction removed (no full rewrite to piggyback).
- **`archiveEntry`** → read (validate, `assertNotArchived`, `assertNotChangeLog`) → append new line `status: "archived"`, `archived_at`, `archived_by`, `archived_reason`, `version = maxVersionForId + 1`.
- **`deleteEntry`** → read (validate, `assertNotChangeLog`) → append new line `status: "archived"`, `archived_reason: "deleted: <reason>"`, `archived_at/by`, `version = maxVersionForId + 1`. (Collapses into the archive shape; distinguished by `archived_reason` prefix.)
- **`shipLoopDesign`** → append new line `status: "inactive"`, `shipped_in_plan`, `shipped_at`, `version = maxVersionForId + 1`.
- **`metaStateBatch`** → for each mutated id, append a new versioned line. Change-logs in the batch still true-append to `change-log.jsonl`.
- **`tableOnly`** → now "filter change-logs from the read-set before computing max-version-per-id" (still needed; `readRegistry` returns the union).
- **`assertNoChangeLogLeak`** → still fires on any persist site that would write a change-log to `meta-state.jsonl`; the append path must not accept change-logs (route via `appendChangeLogEntryAtomic`).

**No-op short-circuit detail (the `meta-260715T2311Z` resolution):** compare the post-`Object.assign` entry against the existing max-version entry, excluding the `version` field. Shallow per-field equality suffices (patches are flat; arrays compared by reference-into-JSON is acceptable but use `JSON.stringify` for array fields to be safe). A CAS-only call (`_expected_version` present, no other field) is still a no-op → no bump, no append, return `true`. Guard the promote tool's unconditional `updateEntry(root, id, { status: "open" })` (meta-state-promote-rule-tool.js:190) — with the short-circuit in place it becomes a no-op when already open, but also add the explicit `if (entry.status !== "open")` guard at the call site for clarity (DRY: the short-circuit is the blanket fix; the call-site guard is defense-in-depth).

**Agent-side arm of `meta-260715T2311Z`:** prune the stale split-patch guidance (the array-alone/scalar-alone `meta_state_patch` split) from AGENTS.md, CLAUDE.md, and any loop-design/finding docs that still prescribe it. The wire-format bug is fixed (patch tool derives schema from 4-kind records + `deepStripEnvelope`); a single combined `meta_state_patch` call is correct.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/meta-state.js` — `appendRegistryEntryAtomic` (:139), `persistRegistryAtomic` (:79, retire for mutable stream), `updateEntry` (:950), `archiveEntry` (:1067), `deleteEntry`, `metaStateBatch`, `shipLoopDesign`, `tableOnly` (:99)
- Modify: `tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js` (:190 — call-site guard)
- Modify: `AGENTS.md`, `CLAUDE.md` — prune stale split-patch guidance; (read-instruction update is Phase C)
- Test: `tools/learning-loop-mastra/__tests__/` — write-path append behavior, no-op short-circuit, CAS, archived-tombstone delete, batch append
- Create: change-log entry recording the `deleteEntry` semantic shift (hard-delete → archived tombstone) + the `meta-260715T2311Z` resolution
- No change (this phase): `.gitattributes`, `_readAndParseRegistry` (Phase A shipped the projection), `registry-table.sh`

## Implementation Steps (TDD — tests first)

1. **Append-behavior test.** Assert `updateEntry` on a real field change appends a new line (file line count +1) with `version = prev+1`; the old line is unchanged in the file. Assert `writeEntry` of a new id appends a v0 line (no full rewrite — file line count +1, no other line touched).
2. **No-op short-circuit test (the `meta-260715T2311Z` repro).** Assert `updateEntry(root, id, { status: "open" })` on an already-open finding produces zero file change (line count unchanged, mtime unchanged or no append). Assert `meta_state_promote_rule` on an already-open finding is a no-op. Assert a CAS-only call (`_expected_version` matching, no field) is a no-op.
3. **Archived-tombstone delete test.** Assert `deleteEntry` appends a highest-version line with `status: "archived"` + `archived_reason: "deleted: …"`; `meta_state_list` (default) hides it; `meta_state_list({ include_archived: true })` shows it. Assert the old line is unchanged in the file.
4. **CAS still works test.** Assert `_expected_version` mismatch returns `"version_mismatch"` with no append; match proceeds (append).
5. **Change-log immutability still holds test.** Assert `updateEntry`/`archiveEntry`/`deleteEntry` on a change-log id throws `change_log_immutable`; assert `assertNoChangeLogLeak` still fires if a change-log reaches the append path.
6. **Batch append test.** Assert `metaStateBatch` with multiple id mutations appends one new versioned line per mutated id; change-logs in the batch go to `change-log.jsonl`.
7. **Implement the write-path rewrite** per Architecture. Retire `persistRegistryAtomic` for the mutable stream (keep it as the compaction primitive, clearly commented).
8. **Add the promote call-site guard** at meta-state-promote-rule-tool.js:190.
9. **Prune stale split-patch guidance** in AGENTS.md/CLAUDE.md; note the single combined call is correct.
10. **Emit the change-log entry** (via `meta_state_log_change`) recording: `deleteEntry` hard-delete → archived tombstone; `meta-260715T2311Z` resolved (no-op short-circuit + guidance prune). Resolve `meta-260715T2311Z` via `meta_state_resolve`.
11. **Run focused tests**: `pnpm exec vitest run --bail=1` on the meta-state write-path suite; then `pnpm test:iter`. Fix regressions, do not weaken tests. Run `pnpm exec vitest --changed` post-edit.
12. **Do NOT close `meta-260715T0633Z-…-finding-stream-…`** — it stays open as the Tier 2 ticket until Phase C lands.

## Success Criteria

- [ ] Append-behavior test passes (mutations append; old lines untouched).
- [ ] No-op short-circuit test passes (`meta-260715T2311Z` repro = zero file change).
- [ ] Archived-tombstone delete test passes; `meta_state_list` hides tombstones.
- [ ] CAS test passes; change-log immutability test passes; batch append test passes.
- [ ] `meta-260715T2311Z-gratuitous-mutations` resolved + change-log entry emitted.
- [ ] Stale split-patch guidance pruned from AGENTS.md/CLAUDE.md.
- [ ] `meta-260715T0633Z-…-finding-stream-…` still OPEN (Tier 2 ticket).
- [ ] Full meta-state test suite green (`pnpm test:iter`).
- [ ] No `.gitattributes` change this phase.

## Risk Assessment

- **No-op short-circuit false-negative** (skips a real change) → mitigated by field-by-field compare excluding `version`; TDD step 2 covers the repro + a real-change counter-test.
- **No-op short-circuit false-positive** (appends despite no change) → mitigated by the repro test asserting zero file change.
- **`deleteEntry` callers expecting true erasure** → mitigated by the change-log entry documenting the shift; the projection + `meta_state_list` filter preserve the observable "gone" behavior. Surface in PR body.
- **Compaction hook lost** → acknowledged; inline compaction removed, compaction script + signal ship in Phase C. File grows monotonically until then (acceptable: 100 ids, solo scale, Phase C threshold 1000).
- **Append not atomic across crash** → mitigated by appending under `withRegistryLock` + per-root queue (same discipline as `appendChangeLogEntryAtomic`); use `appendFileSync` with a single `\n`-terminated line.
- **Parallel-branch appends still conflict at EOF** → expected; not fixed until Phase C flip. Phase B does not claim to remove the cross-branch speed limiter.
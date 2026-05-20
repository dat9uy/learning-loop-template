---
phase: 2
title: "Supersession Write-Back Implementation"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Supersession Write-Back Implementation

## Overview

Implement automated supersession write-back in the extraction tool. Make the three failing tests from Phase 1 pass. After this phase, the supersession pair in `records/index/` must reproduce byte-for-byte from extraction without any hand-edit.

## Requirements

- Functional: when a new evidence file's `## Confirmation / Disproof Notes` names an existing assertion-id, the extraction pass writes `superseded_by` on the old entry and `supersedes` on the new entry as part of the same run.
- Functional: old entry's `status` flips from `active` to `superseded` when superseded.
- Functional: hard-stop unchanged when assertion text changes without a disproof note (Phase 1 test 3).
- Functional: `n_count` on the new entry increments per existing aggregation rule; old entry's `n_count` is not touched.
- Non-functional: still no new npm dependencies. Pre-write aggregation in `extract-index.js` is the right insertion point; `index-entry-builder.js` keeps its current pure-function shape.

## Architecture

Today the flow is:

1. Parse evidence files → build new entries (`index-entry-builder.js` with hard-coded `superseded_by: null`, `supersedes: []`).
2. `checkSupersession` compares against existing entries and emits errors.
3. `writeIndexEntry` writes the new entry; old entries are never touched.

New flow:

1. Parse evidence files → build new entries (still hard-coded null/[]).
2. **New pre-write step:** for each disproof-note-confirmed pair `(old_id, new_id)`, mutate the in-memory new entry to set `supersedes: [old_id]`, and load+mutate the existing old entry to set `superseded_by: new_id` and `status: superseded`. Stage both for write.
3. `checkSupersession` still hard-stops when assertion text changed without a disproof note (no change).
4. `writeIndexEntry` writes both entries.

Disproof notes are parsed by the existing `parseDisproofNotes(body)` in `extract-index.js:231`. The aggregation map (`extract-index.js:255`) already holds per-entry state; staging the old-entry mutation alongside the new one is the cleanest insertion point.

## Related Code Files

- Modify: `tools/extract-index/extract-index.js` — add supersession write-back step before final write loop; load existing old entries, mutate, stage for write.
- Modify: `tools/extract-index/index-entry-builder.js` — accept optional `supersedes` array on entry construction (default `[]`), so the builder no longer hard-codes the field.
- Modify (test): `tools/extract-index/extract-index.test.js` — Phase 1 tests should now pass.
- Read for context: `tools/extract-index/file-writer.js` (write path), `records/index/assertion-vnstock-data-runtime-device-id-injection-*.yaml` (target shape).

## Implementation Steps

1. Extend `index-entry-builder.js` `buildIndexEntry` to accept `supersedes` (array, default `[]`). Keep `superseded_by` defaulting to `null`. No other shape changes.
2. In `extract-index.js`, after `parsed[]` is populated and before final write: build a map of disproof intents `Map<new_id, old_id>` from each evidence file's parsed disproof notes paired with the new entry-id derived from that file's findings.
3. Before each new entry is written: if the new entry's id appears as a value in the disproof intents map, set `supersedes: [old_id]` on it.
4. For each `(new_id, old_id)` pair: read `records/index/<old_id>.yaml` via `readExistingIndex`. If absent, treat as orphan and hard-stop with a clear error ("disproof note names non-existent assertion-id <old_id>"). If present, mutate `superseded_by: <new_id>`, `status: "superseded"`, leave `n_count` alone. Stage for write.
5. Pass both new and mutated-old entries through `writeIndexEntry` in the final loop.
6. Update `shouldWrite` (`file-writer.js`) only if needed — if the only delta is `superseded_by`/`status`, `shouldWrite` should still return true because the hash check already ignores those fields. (Verify: the hash compares `extraction.evidence_immutable_hash`, not the full entry. So mutating non-extraction fields needs an additional write path. Add an `or-status-changed` clause to `shouldWrite`, or write unconditionally when an old entry is mutated by supersession.)
7. Re-run Phase 1 tests. All three should pass.
8. Re-run the full `tools/extract-index/` test suite. No regressions.

## Success Criteria

- [ ] All three Phase 1 tests pass.
- [ ] Existing `extract-index.test.js` tests still pass.
- [ ] Re-running `pnpm extract:index` over the current corpus produces byte-identical `superseded_by` / `supersedes` fields on `device-id-injection-required` ↔ `device-id-injection-not-required` (verified in Phase 5).
- [ ] `index-entry-builder.js` no longer hard-codes `supersedes: []` — it accepts an array.
- [ ] No new npm dependencies.

## Risk Assessment

- Risk: orphan disproof notes (naming non-existent assertion-ids) silently no-op. Mitigation: hard-stop in Step 4. Test this in Phase 1 if not already covered (add if missing).
- Risk: `shouldWrite` hash-only check skips the mutated old entry. Mitigation: explicit Step 6 — verify behavior, patch `shouldWrite` to also detect status/supersession-field changes.
- Risk: cross-extraction state corruption — re-running extraction after a partial run leaves old entries in `superseded` status with no matching new entry. Mitigation: the operation is idempotent because the disproof note is in evidence; re-running re-derives the same intent map.

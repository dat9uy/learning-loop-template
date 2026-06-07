---
phase: 5
title: "Refactor #5: Mechanism Check Backfill (TDD)"
status: pending
priority: P2
effort: "1h"
dependencies: [4]
---

# Phase 5: Refactor #5 — `mechanism_check` Backfill on Resolved Findings

## Overview

Backfills `mechanism_check: true` and recomputes `code_fingerprint` (SHA-256) on the 15 of 16 resolved findings that have `evidence.code_ref` or `evidence_code_ref` set. The 1 remaining finding stays `mechanism_check: false`. Coverage rises from 0/16 to 15/16 (94%). Fingerprint-level grounding (`meta_state_check_grounding`) becomes useful on the registry for the first time.

## Requirements

- **Functional**: post-backfill, 15 of 16 resolved findings have `mechanism_check: true` and a `code_fingerprint` (SHA-256 of `evidence.code_ref` or `evidence_code_ref`).
- **Non-functional**: the backfill is idempotent for entry mutations (no duplicate IDs; `updateEntry` is CAS-safe); the backfill emits a `change-log` entry documenting the count (append-only by design, so a second run adds a new change-log line); the backfill never throws on missing files (sets `mechanism_check: false` + logs the reason).

## Architecture

The backfill reuses the existing `meta_state_refresh_fingerprint` tool in a loop. For each `entry_kind: "finding"` with `status: "resolved"` and `evidence.code_ref` or `evidence_code_ref` set, call the tool's handler. The tool computes SHA-256, sets `mechanism_check: true` and `code_fingerprint` via `updateEntry`, and appends a gate log. Alternatively, a lightweight script can call `computeFileHash` from `core/check-grounding.js` and `updateEntry` directly.

```
scripts/backfill-mechanism-check.mjs
  → readRegistry(root)
  → for each entry_kind: "finding" with status: "resolved":
    → const codeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref
    → if no codeRef: skip
    → else: call meta_state_refresh_fingerprint handler({ id: entry.id })
      → if success: mechanism_check: true, code_fingerprint set
      → if error (file missing): set mechanism_check: false, append to skip_log
  → emit change-log entry with change_dimension: "mechanical", change_target: "meta-state.jsonl#mechanism_check-backfill"
```

The script is idempotent for entry mutations: a second run sees `mechanism_check: true` already set and skips (or re-verifies the fingerprint; see Locked Decision below). The change-log emission is append-only by design, so a second run adds a new change-log line.

**Lock-in decisions:**
- (a) **Re-verify fingerprint on re-run, not skip.** This catches the case where the referenced file changed since the last backfill. A 2nd run with a changed file updates the fingerprint. A 2nd run with the same file is a no-op for entry mutations.
- (b) **Skip findings without `evidence.code_ref` or `evidence_code_ref`.** 1 of 16 resolved findings has no code reference. It stays `mechanism_check: false` with a note in the change-log. Coverage: 15/16 (94%), not 16/16.
- (c) **Recompute `code_fingerprint` at backfill time.** Some files may have drifted since the finding was reported. The recomputed fingerprint is the new "as of backfill" baseline.

## Related Code Files

- **Create**: `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs` (~50 lines)
- **Create**: `tools/learning-loop-mcp/__tests__/backfill-mechanism-check.test.js` (~80 lines; 3-4 tests)
- **Modify** (data only, via the script): `meta-state.jsonl` (10-12 entries; +1 change-log entry)

## Implementation Steps

### Red: write the failing test (TDD step 1)

1. In `__tests__/backfill-mechanism-check.test.js`, write 4 test cases:
   - `test('idempotent: re-running with no file changes is a no-op', ...)` — run script on a fixture registry, snapshot, run again, snapshot, assert deep equality.
   - `test('recomputes fingerprint when referenced file changes between runs', ...)` — write file A with content "v1", run script, snapshot, change file A to "v2", run script, assert fingerprint changed.
   - `test('skips findings without evidence.code_ref', ...)` — pre-populate 2 resolved findings, 1 with code_ref, 1 without; run script; assert only 1 has `mechanism_check: true`.
   - `test('sets mechanism_check: false when referenced file is missing', ...)` — pre-populate 1 resolved finding with `code_ref: "nonexistent.js"`; run script; assert `mechanism_check: false` and `skip_log: ['file not found: nonexistent.js']`.
2. Run `npm test -- backfill-mechanism-check` to confirm red.

### Green: implement the script (TDD step 2)

3. Write `tools/learning-loop-mcp/scripts/backfill-mechanism-check.mjs`:
   - Import `readRegistry`, `updateEntry` from `#mcp/core/meta-state.js`.
   - Import `computeFileHash` from `#mcp/core/check-grounding.js`.
   - For each `entry_kind: "finding"` with `status: "resolved"`, run the 3-step logic above.
   - At the end, emit a `change-log` entry with `change_dimension: "mechanical"`, `change_target: "meta-state.jsonl#mechanism_check-backfill"`, `change_diff.changed: ['mechanism_check (15 entries)', 'code_fingerprint (15 entries)']`, `reason: "Backfilled mechanism_check on resolved findings with evidence.code_ref or evidence_code_ref. Pre-backfill coverage: 0/16. Post-backfill coverage: 15/16."`.
4. Re-run tests → green.

### Refactor + accept (TDD steps 3-4)

5. Extract `computeFingerprint(filePath)` as a pure function returning `sha256:...` or `null` on missing file. Unit-test it.
6. Run the script against the live `meta-state.jsonl` (operator approval required).
7. Re-run the cold-tier regression harness (Phase 0). The fixture is updated: post-backfill cold tier has `mechanism_check: true` on 10-12 entries.
8. Run `meta_state_query_drift` (operator-approval required) and confirm the drift count rises (some resolved findings now report drift between report-time code and current code).
9. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `backfill-mechanism-check.mjs` runs idempotently for entry mutations (no duplicate IDs; change-log emission is append-only by design)
- [ ] Post-backfill: 15 of 16 resolved findings have `mechanism_check=true`
- [ ] `meta_state_check_grounding` now works on the 15 resolved findings with `mechanism_check=true` (SP2 fingerprint-level grounding)
- [ ] 3-4 tests pass in `__tests__/backfill-mechanism-check.test.js`
- [ ] 1 `change-log` entry exists in `meta-state.jsonl` documenting the backfill
- [ ] The cold-tier regression fixture is updated
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: the script computes SHA-256 of a file that's been moved or deleted since the finding was reported. → **Mitigation**: the script handles missing files (sets `mechanism_check: false` + logs); a missing file is a valid signal (the code no longer exists; the rule may not apply).
- **Risk**: the script takes a long time on a large registry (1000+ entries). → **Mitigation**: the script iterates the registry once; SHA-256 of a typical file is <1ms. For 16 entries, total <100ms. Acceptable.
- **Risk**: the script's change-log entry contains stale counts (the entry is immutable; if a 2nd backfill adds more, the entry is wrong). → **Mitigation**: each backfill run emits a NEW change-log entry (append-only); the count in the entry is the count at the time of that run. The idempotency test asserts no duplicate entry IDs, while allowing the new change-log line.
- **Risk**: the script's `re-verify on re-run` decision (Locked #1a) means a 2nd run always re-reads files. → **Mitigation**: the cost is <1ms per file; acceptable. The benefit (catches file changes between backfills) outweighs the cost.

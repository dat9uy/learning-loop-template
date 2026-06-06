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

Backfills `mechanism_check: true` and recomputes `code_fingerprint` (SHA-256) on the 10-12 of 16 resolved findings that have `evidence.code_ref` set. The other 4-6 stay `mechanism_check: false`. Coverage rises from 0/16 to ~10-12/16 (60-75%). Drift detection (`meta_state_query_drift`, `meta_state_check_grounding`) becomes useful on the registry for the first time.

## Requirements

- **Functional**: post-backfill, ≥10 of 16 resolved findings have `mechanism_check: true` and a `code_fingerprint` (SHA-256 of `evidence.code_ref`).
- **Non-functional**: the backfill is idempotent (running twice produces no changes); the backfill emits a `change-log` entry documenting the count; the backfill never throws on missing files (sets `mechanism_check: false` + logs the reason).

## Architecture

The backfill script walks `entry_kind=finding` + `status=resolved` entries. For each, if `evidence.code_ref` is set AND the referenced file exists, compute SHA-256 of the file and set `mechanism_check: true, code_fingerprint: "sha256:..."`. If `evidence.code_ref` is set but the file is missing, set `mechanism_check: false` and append a note. If `evidence.code_ref` is not set, skip.

```
scripts/backfill-mechanism-check.mjs
  → readRegistry(root)
  → for each entry_kind: "finding" with status: "resolved":
    → if no evidence.code_ref: skip
    → else: try to read file at evidence.code_ref
      → if exists: compute sha256, set mechanism_check: true, code_fingerprint: "sha256:..."
      → if not exists: set mechanism_check: false, append to skip_log
  → emit change-log entry with change_dimension: "mechanical", change_target: "meta-state.jsonl#mechanism_check-backfill"
```

The script is idempotent: a second run sees `mechanism_check: true` already set and skips (or re-verifies the fingerprint; see Locked Decision below).

**Lock-in decisions:**
- (a) **Re-verify fingerprint on re-run, not skip.** This catches the case where the referenced file changed since the last backfill. A 2nd run with a changed file updates the fingerprint. A 2nd run with the same file is a no-op.
- (b) **Skip findings without `evidence.code_ref`.** 4-6 of 16 resolved findings have no code reference. They stay `mechanism_check: false` with a note in the change-log. Coverage: 10-12/16, not 16/16.
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
   - Import `readRegistry`, `writeEntry` from `#mcp/core/meta-state.js`.
   - Import `createHash` from `node:crypto`.
   - For each `entry_kind: "finding"` with `status: "resolved"`, run the 3-step logic above.
   - At the end, emit a `change-log` entry with `change_dimension: "mechanical"`, `change_target: "meta-state.jsonl#mechanism_check-backfill"`, `change_diff.changed: ['mechanism_check (10 entries)', 'code_fingerprint (10 entries)']`, `reason: "Backfilled mechanism_check on resolved findings with evidence.code_ref. Pre-backfill coverage: 0/16. Post-backfill coverage: ~10/16."`.
4. Re-run tests → green.

### Refactor + accept (TDD steps 3-4)

5. Extract `computeFingerprint(filePath)` as a pure function returning `sha256:...` or `null` on missing file. Unit-test it.
6. Run the script against the live `meta-state.jsonl` (operator approval required).
7. Re-run the cold-tier regression harness (Phase 0). The fixture is updated: post-backfill cold tier has `mechanism_check: true` on 10-12 entries.
8. Run `meta_state_query_drift` (operator-approval required) and confirm the drift count rises (some resolved findings now report drift between report-time code and current code).
9. Run `npm test` — all tests pass.

## Success Criteria

- [ ] `backfill-mechanism-check.mjs` runs idempotently
- [ ] Post-backfill: ≥10 of 16 resolved findings have `mechanism_check=true`
- [ ] `meta_state_query_drift` count rises (some resolved findings now report drift)
- [ ] 3-4 tests pass in `__tests__/backfill-mechanism-check.test.js`
- [ ] 1 `change-log` entry exists in `meta-state.jsonl` documenting the backfill
- [ ] The cold-tier regression fixture is updated
- [ ] `npm test` passes

## Risk Assessment

- **Risk**: the script computes SHA-256 of a file that's been moved or deleted since the finding was reported. → **Mitigation**: the script handles missing files (sets `mechanism_check: false` + logs); a missing file is a valid signal (the code no longer exists; the rule may not apply).
- **Risk**: the script takes a long time on a large registry (1000+ entries). → **Mitigation**: the script iterates the registry once; SHA-256 of a typical file is <1ms. For 16 entries, total <100ms. Acceptable.
- **Risk**: the script's change-log entry contains stale counts (the entry is immutable; if a 2nd backfill adds more, the entry is wrong). → **Mitigation**: each backfill run emits a NEW change-log entry (append-only); the count in the entry is the count at the time of that run.
- **Risk**: the script's `re-verify on re-run` decision (Locked #1a) means a 2nd run always re-reads files. → **Mitigation**: the cost is <1ms per file; acceptable. The benefit (catches file changes between backfills) outweighs the cost.

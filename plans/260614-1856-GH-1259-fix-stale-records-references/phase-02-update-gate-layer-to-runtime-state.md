---
phase: 2
title: "Update gate layer to runtime-state"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Update gate layer to runtime-state

## Overview

Replace `records/observations/` reads in the gate layer with reads from `runtime-state.jsonl`. Protect `runtime-state.jsonl` from direct writes. Keep existing gate decision logic unchanged; only change the observation source and the evidence unlock mechanism.

## Architecture

```
runtime-state.jsonl
  └─ ledger-event rows (affected_system, status, timestamp, metadata, source_ref)
       └─ readRuntimeObservations(root)
            ├─ filters status === "active"
            ├─ maps affected_system → constraint_type via reverse map
            ├─ optionally filters by metadata.authorization for package-manager/vendor-api
            └─ returns observation-shaped objects { id, status, constraint_type, constraint, affected_system, updated_at }
                 ├─ bash-gate.js: checkObservationExists(constraintMatch, observations)
                 ├─ inbound-gate.js: readActiveObservations(root)
                 └─ gate-logic.js evaluateWritePath: records-evidence check
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/file-readers.js`
- Modify: `tools/learning-loop-mcp/core/gate-logic.js`
- Modify: `tools/learning-loop-mcp/hooks/bash-gate.js`
- Modify: `tools/learning-loop-mcp/hooks/write-gate.js`
- Modify: `tools/learning-loop-mcp/hooks/inbound-gate.js`
- Modify: `tools/learning-loop-mcp/core/inbound-state.js` (if staleness logic needs tuning)

## Implementation Steps

1. Protect `runtime-state.jsonl` from direct writes:
   - In `bash-gate.js`, add `runtime-state.jsonl` to `PATH_WRITE_PATTERNS` (alongside the existing `meta-state.jsonl` entries).
   - In `write-gate.js`, add an unconditional block for `runtime-state.jsonl` (next to the `meta-state.jsonl` block if one exists; otherwise add a new top-level block).
2. In `file-readers.js`:
   - Delete `readObservations()` and `readBudgets()`. They read from the empty `records/observations/` directory.
   - Add `readRuntimeObservations(root)` that reads `runtime-state.jsonl`, filters `status === "active"`, and returns observation-shaped objects.
   - Use a reverse mapping from `affected_system` to `constraint_type`:
     ```js
     const AFFECTED_SYSTEM_TO_CONSTRAINTS = {
       vnstock: ["vendor-api", "package-manager"],
     };
     ```
   - For each runtime-state entry, return one observation-shaped object **per mapped constraint** so `checkObservationExists` can match any of them.
   - Derive `updated_at` from `timestamp`.
   - Include a metadata-based authorization filter: only entries whose `metadata.action` or `metadata.authorization` indicates package-manager/vendor-api usage satisfy those constraints. For the current vnstock ledger events, this can be a permissive default (all active vnstock entries authorize both vendor-api and package-manager), but the code must have a clear hook to narrow this later.
3. In `gate-logic.js`:
   - Keep `matchConstraintPattern`, `checkObservationExists`, and `makeGateDecision` unchanged. They already work on observation-shaped objects.
   - For `evaluateWritePath` and the `records-evidence` unlock: **remove the unlock permanently**. The old `records-evidence` observation was migrated to meta-state and evidence is no longer written to `records/evidence/**`. All `records/**` writes are now blocked except `product/**` with a valid preflight marker. Update `evaluateWritePath` to drop the write-path observation check for `records-evidence` and rely solely on the unconditional `records/**` block and the `product/**` preflight check.
   - Add a code comment documenting that the `records-evidence` unlock was removed as part of the Phase A migration.
4. In `bash-gate.js`:
   - Replace `readObservations(root)` with `readRuntimeObservations(root)`.
   - Remove the unused `obsDir` local variable.
5. In `inbound-gate.js`:
   - Replace `readObservations` import/calls with `readRuntimeObservations`.
   - Remove the duplicate `findStaleObservations` function; rely on `checkObservationStaleness` from `inbound-state.js` which already handles active filtering and sidecar lookup.
6. In `inbound-state.js`:
   - Ensure `checkObservationStaleness` handles runtime-state observations correctly. Runtime-state observations will have `updated_at` derived from `timestamp`, so the existing meta-observation path works.
   - Add per-line JSON parse error handling: skip malformed lines instead of failing the entire file.
   - Document that runtime-state writes must use atomic tmp+rename.

## Success Criteria

- [ ] `bash-gate.js` and `write-gate.js` block direct writes to `runtime-state.jsonl`.
- [ ] `bash-gate.js` and `inbound-gate.js` no longer call `readObservations`.
- [ ] `file-readers.js` no longer contains `readObservations` or `readBudgets`.
- [ ] `readRuntimeObservations` returns observation-shaped objects with synthesized `constraint_type` and `updated_at`.
- [ ] `records/evidence/**` unlock is removed; all `records/**` writes are blocked except `product/**` with a valid preflight marker.
- [ ] `runtime-state.jsonl` read handles malformed lines gracefully.
- [ ] All modified gate files still pass targeted tests before phase exit.

## Risk Assessment

- Risk: `runtime-state.jsonl` injection if write protection is missed. Mitigation: add to both bash and write gate block lists; verify in phase 6.
- Risk: Constraint mapping too broad. Mitigation: reverse mapping + metadata authorization hook; `docker` and `sudo` remain blocked.
- Risk: `records-evidence` unlock breaks evidence workflow. Mitigation: unlock is intentionally removed per operator confirmation; evidence is now meta-state-only.
- Risk: Runtime-state read races with writes. Mitigation: document atomic tmp+rename; skip malformed lines; follow up with a dedicated concurrency pass if needed.

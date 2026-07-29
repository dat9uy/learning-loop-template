---
phase: 2
title: "Dedup the Projection (Latest-Per-Surface)"
status: pending
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Dedup the Projection (Latest-Per-Surface)

## Overview

The linchpin that makes the bash-gate collapse safe. Switch `readRuntimeObservations` from the **raw** `readRuntimeStateRows` (one observation per active budget-state row, each with its own row timestamp) to a **kind-before-collapse dedup**: filter to `kind === "budget-state"` THEN `collapseLatestById` (one observation per canonical id = latest `max_by(version)` budget-state row). Now `obs.updated_at` IS the authoritative per-surface-latest timestamp, so the bash gate's sidecar `reduce(latest)` becomes a true no-op (dropped in Phase 4) and the meta/non-meta split collapses. This phase rewires no gate logic — only the shared reader — and must prove the constraint gate (the other consumer) is unaffected. **Kind-before-collapse is mandatory** (mirrors `readBudgetTrackingState`); the kind-agnostic `readRuntimeStateRowsLatest` is forbidden for this path (cross-kind id-collision, re-red-team F1).

## Requirements

- Functional: `readRuntimeObservations` (file-readers.js:64) dedups via **kind-before-collapse** — filter `readRuntimeStateRows` to `kind === "budget-state"` (read-compat: `r.kind ?? "budget-state"`), then `collapseLatestById` — instead of iterating raw rows. The status=active filter, the `assertinvariantSync` unmapped-active-entry drift check, and the `AFFECTED_SYSTEM_TO_CONSTRAINTS` projection are unchanged. **Does NOT call the kind-agnostic `readRuntimeStateRowsLatest`** (cross-kind collision risk).
- Functional: the projection now emits **one observation per (canonical id × constraint)** = the latest row's fields, so `obs.updated_at` is the latest active-row timestamp for that surface.
- Functional: constraint-gate decisions (`checkObservationExists` → `makeGateDecision`) return the **same found/not-found** results as before for every existing fixture.
- Functional: **kind-before-collapse ordering** — filter to `kind === "budget-state"` BEFORE `collapseLatestById`, mirroring `readBudgetTrackingState` (runtime-state.js:343-354). A naive collapse-all-by-id-then-filter-kind is unsafe: `appendLedgerEvent` versions rows kind-agnostically by `id` (runtime-state.js:271 — no kind check), and a canonical-id `ledger-event` is permitted when the surface is active (runtime-state-record-tool.js:122-126; runtime-contract.md:70). Collapse-all would let a higher-version ledger-event sharing the canonical id shadow the budget-state, which the post-collapse kind filter then drops — the budget-state observation vanishes. **This is the re-red-team F1 fix; the earlier draft's "not by dedup" claim was false.**
- Functional: the projection emits **one observation per (canonical id × constraint)** = the latest budget-state row's fields, so `obs.updated_at` is the latest active-row timestamp for that surface.
- Functional: constraint-gate decisions (`checkObservationExists` → `makeGateDecision`) return the **same found/not-found** results as before for every existing fixture. (`makeGateDecision` reads only `constraintMatch` + `observationStatus.found` — verified metadata-insensitive; the Open Question closes clean.)
- Non-functional: ledger-event rows remain excluded by kind (filtered BEFORE dedup so they cannot shadow a budget-state).
- Non-functional: `readBudgetTrackingState` (the canonical lifecycle reader, already kind-before-collapse) is unaffected — this phase only changes the *observation projection*, not the lifecycle reader. Consider extracting a shared `collapseLatestBudgetStateById` helper (DRY) since both `readBudgetTrackingState` and `readRuntimeObservations` now do kind-before-collapse.

## Architecture

```
core/file-readers.js
  readRuntimeObservations(root):
  - const rows = readRuntimeStateRows(resolvedRoot);            ← raw, every row
  + // kind-before-collapse (mirrors readBudgetTrackingState): filter budget-state
  + // BEFORE dedup so a canonical-id ledger-event cannot shadow a budget-state.
  + const rawRows = readRuntimeStateRows(resolvedRoot);
  + const rows = collapseLatestBudgetStateById(rawRows);   // shared helper (see below)
    ... rest unchanged (status=active filter,
        assertinvariantSync unmapped-active-entry check,
        AFFECTED_SYSTEM_TO_CONSTRAINTS projection)
```

`collapseLatestById` (runtime-state.js) dedups by `id` keeping `max_by(version)`, ties broken by newest `timestamp` then last-in-file. The canonical budget-state id is the surface name (runtime-contract.md:68 — "the canonical id is the surface name itself"), so one surface → one latest observation. Filtering `kind === "budget-state"` first ensures only budget-state rows compete in the collapse — a same-id ledger-event (higher version) is dropped before collapse and cannot shadow the budget-state.

**Implementation (validation-chosen): extract a shared `collapseLatestBudgetStateById(rows)` helper in `runtime-state.js`** — filters `kind === "budget-state"` (read-compat: `r.kind ?? "budget-state"`) then `collapseLatestById`, then `.map(e => e.row)`. Reuse it from BOTH `readRuntimeObservations` (file-readers.js) AND `readBudgetTrackingState` (runtime-state.js:343-354, which currently does the same filter-then-collapse inline). This closes the DRY gap the plan's Open Question flagged — both readers now share one kind-before-collapse primitive instead of duplicating the pattern. Do NOT call the kind-agnostic `readRuntimeStateRowsLatest`.

### Why the constraint gate is unaffected

`checkObservationExists` (gate-logic.js:429-439) uses `observations.find(o => o.status === "active" && (o.constraint_type === c || o.constraint === c))` — found/not-found, returns the first match. Dedup changes *which* row is matched (latest vs the oldest active row), but **not** whether a match exists: a surface has an active row iff its latest budget-state row is active (lifecycle: paused/stopped rows are excluded by the `status === "active"` filter both before and after dedup; the `find` predicate is identical). Phase 2 TDD pins current constraint decisions and asserts they hold. Open question (plan.md): confirm `makeGateDecision` is metadata-insensitive to the matched observation — resolve before landing.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/runtime-state.js` (extract + export `collapseLatestBudgetStateById`; refactor `readBudgetTrackingState` to use it)
- Modify: `tools/learning-loop-mastra/core/file-readers.js` (`readRuntimeObservations` calls the shared helper)
- Create: `tools/learning-loop-mastra/__tests__/core/collapse-latest-budget-state-by-id.test.js` (dedup + cross-kind collision)
- Verify: `tools/learning-loop-mastra/core/gate-logic.js` (`checkObservationExists` 429, `makeGateDecision` 464)
- Verify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (constraint path 104-123)
- Regression: `tools/learning-loop-mastra/__tests__/legacy-mcp/file-readers-unmapped-active-entry.test.js`, `file-readers-malformed-line.test.js`, `evaluate-bash-gate-runtime-state.test.js`

## Implementation Steps (TDD — pin constraint decisions before the swap)

### TDD: lock the constraint-gate oracle

1. Enumerate every `evaluate-bash-gate-runtime-state.test.js` fixture and record the expected `{decision, hard_block, constraint_type}` for the constraint path (not the staleness path — that changes in Phase 4). This is the constraint-gate oracle that must NOT change.
2. Read `makeGateDecision` (gate-logic.js:464-end) and confirm it consumes only `constraintMatch` + the `found`/`observation` from `checkObservationExists` — not a field that differs between the oldest and latest active row (e.g. `metadata.value`). If it does consume such a field, **preserve** that field's selection (the latest row's value, which is the correct current budget). Document the resolution in the phase summary. (This is the plan's Open Question.)
3. Add a test: a surface with **multiple active budget-state rows** (T1 older, T2 newer, same canonical id, different versions) → `readRuntimeObservations` returns **one** observation with `updated_at = T2` (the latest). Today it returns two. Pin the new deduped shape.
4. **Add the cross-kind collision test (re-red-team F1 — blocking):** a `budget-state` row `id="vnstock"` v0 status=active, PLUS a `ledger-event` row `id="vnstock"` v1 (higher version, same canonical id, permitted when surface active). `readRuntimeObservations` MUST still emit the vnstock budget-state observation (the ledger-event does not shadow it). Today's raw-per-row code passes this (it sees both); a naive collapse-all-then-filter-kind FAILS it (the v1 ledger-event shadows, then gets kind-filtered, vnstock vanishes). This test is the guard on the kind-before-collapse ordering. Assert `checkObservationExists` returns `{found:true}` and the inbound gate's `loadStaleActiveObservations` sees the vnstock surface.

### Implementation

5. In `runtime-state.js`, **extract a shared `collapseLatestBudgetStateById(rows)` helper**: filter `kind === "budget-state"` (read-compat: `r.kind ?? "budget-state"`), then `collapseLatestById`, then `.map(e => e.row)`. Refactor `readBudgetTrackingState` (runtime-state.js:343-354) to use it (replacing its inline filter-then-collapse), and in `file-readers.js` switch `readRuntimeObservations` to call it (replacing the raw `readRuntimeStateRows` loop). Do NOT call the kind-agnostic `readRuntimeStateRowsLatest`.
6. Run the constraint-gate oracle tests → green (found/not-found unchanged).
7. Run the new multi-row dedup test → green (one observation, latest timestamp).
8. Run the cross-kind collision test → green (vnstock budget-state survives the higher-version ledger-event). **This is the must-pass gate for the kind-before-collapse ordering.**
9. Run `file-readers-unmapped-active-entry.test.js` + `file-readers-malformed-line.test.js` → green (the `assertinvariantSync` drift check and malformed-line skip both survive — malformed rows are skipped at parse in `readRuntimeStateRowsDetailed`, before the kind filter and collapse).

### Verification

8. `evaluate-bash-gate-runtime-state.test.js`: constraint-path decisions unchanged; staleness-path assertions are expected to change (Phase 4 rewrites them) — note which, do NOT "fix" them here. Gate the staleness-test changes behind Phase 4.
9. Cross-check: `readBudgetTrackingState` still uses its own `collapseLatestById` path (unchanged) — no double-dedup or divergence introduced.
10. `pnpm test` on the file-readers + bash-gate test files; tolerate (record) the staleness-fixture failures that Phase 4 will rewrite.

## Success Criteria

- [ ] `readRuntimeObservations` dedups **kind-before-collapse** via shared `collapseLatestBudgetStateById` (extracted in runtime-state.js, reused by `readBudgetTrackingState`); one observation per (surface × constraint), latest
- [ ] **Cross-kind collision test green** (budget-state v0 + canonical-id ledger-event v1 → budget-state observation survives) — re-red-team F1 fix
- [ ] Constraint-gate decisions unchanged on all existing fixtures (oracle green)
- [ ] `makeGateDecision` metadata-insensitivity confirmed (Open Question closed clean)
- [ ] Multi-row dedup test green (one obs, latest `updated_at`)
- [ ] `assertinvariantSync` unmapped-active-entry + malformed-line tests green
- [ ] Staleness-fixture failures recorded for Phase 4 (not "fixed" here)

## Risk Assessment

**Moderate — highest blast-radius phase (shared reader).** `readRuntimeObservations` feeds both the constraint gate and the staleness scan. The constraint gate is found/not-found driven (verified: `makeGateDecision` reads only `constraintMatch` + `found`). The dominant risk is the **cross-kind id-collision** (re-red-team F1): a kind-agnostic collapse-all-then-filter-kind would let a higher-version canonical-id `ledger-event` shadow a `budget-state` and delete it from the projection — a non-deterministic false-block that bites only when the ledger-event is written after the budget-state. Mitigation: **kind-before-collapse**, mirroring `readBudgetTrackingState` (runtime-state.js:343-354), and the collision TDD test (Step 4) is the must-pass gate. A naive `readRuntimeStateRowsLatest` call (kind-agnostic) is explicitly forbidden. The malformed-line test inherits the parse-skip from `readRuntimeStateRowsDetailed` (upstream of the kind filter); `collapseLatestById` guards missing `id` (`typeof id !== "string" || id === "" return`). The staleness-fixture failures are *expected* and deferred to Phase 4 — do not mask them.

---
phase: 1
title: "Regression guard (no-delete-to-clear-gate invariant)"
status: pending
priority: P1
effort: "0.25d"
dependencies: []
---

# Phase 1: Regression guard

## Overview

Lock in the "delete ledger rows to clear the budget gate" flaw class as a failing test BEFORE the refactor. The live sidecar pause is dropped (validate D6) — the warning stays until the merged Phase 2 clears it in-band. This phase is a single mechanism-agnostic regression test; no runtime action, no code change.

## Requirements

- **Functional:** a regression guard that asserts the gate's stale count drops via the tracking lifecycle (pause/stop), NOT via row deletion. The test uses the public tool surface (`runtime_state_pause` + the gate reader), not the sidecar file shape, so it survives Phase 2's sidecar retirement.
- **Non-functional:** zero `runtime-state.jsonl` row deletions in the test; the invariant is **"row count does not decrease"** (assert `>=`, not `===` — Phase 2's in-band pause appends a row; red-team R8). No live pause runs against the real repo.

## Architecture

No code change. The test builds a temp-root fixture with active rows across two surfaces, pauses one via the tool, and asserts the surfaced stale count drops to the non-paused subset while the row count does not decrease. It pins the invariant the PR#77 prune violated.

## Related Code Files

- **Create:** `tools/learning-loop-mastra/__tests__/runtime-state-no-delete-to-clear-gate.test.js`
- **Read-only:** `core/evaluate-inbound-gate.js` (`loadStaleActiveObservations`), `core/runtime-tracking.js` (`isSurfacePaused`)

## Tests (TDD — write first)

`runtime-state-no-delete-to-clear-gate.test.js` (NEW):
- Fixture: temp root with M active rows across 2 surfaces (`vnstock` mapped, `meta-state-tools` unmapped).
- Assert: before pause, stale count includes both surfaces' rows.
- Run `runtime_state_pause({surface:"vnstock"})` via the tool (with preflight marker).
- Assert: stale count drops to the `meta-state-tools` subset ONLY; `runtime-state.jsonl` row count **does not decrease** (assert `>=` previous — red-team R8: Phase 2's in-band pause appends a row, so `===` would break).
- Assert: re-running the gate does NOT zero the count (the lever is pause/lifecycle, not prune).
- The test must NOT depend on `.loop/runtime-tracking.json`'s file shape — only on the public `runtime_state_pause` tool + the gate reader output — so it survives Phase 2's sidecar retirement.

## Implementation Steps

1. Write the regression guard test (above) first; confirm it passes against the current sidecar pause mechanism (green baseline).
2. Verify on the real repo: `runtime-state.jsonl` has 33 rows, all `kind: ledger-event`; `.loop/runtime-tracking.json` absent. (No live pause is run.)
3. `pnpm test` green.

## Success Criteria

- [ ] Regression guard test passes (count drops via pause; row count does not decrease — `>=`).
- [ ] No live sidecar pause written to the real repo.
- [ ] `pnpm test` green.

## Risk Assessment

- The guard pins the current sidecar mechanism; Phase 2 rewires `runtime_state_pause` to append in-band. The "does not decrease" assertion (not `===`) survives that rewrite (red-team R8). If Phase 2 changes the tool's observable behavior, update the test's mechanism but keep the invariant.
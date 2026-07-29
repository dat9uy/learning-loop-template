# Pre-landing review — plan/unify-observation-staleness-mechanism

Diff: `origin/main...HEAD` (7 commits, 26 files). Full `__tests__` suite re-run
during review: 2173 tests, 0 failed, 1 pending (pre-existing skip).

## Pass 1 — CRITICAL

- [tools/learning-loop-mastra/__tests__/legacy-mcp/inbound-state-runtime-state.test.js:152]
  The pre-existing test that pinned the paused-surface skip in
  `checkObservationStaleness` was deleted and replaced by a test with a
  pause-claiming name that never writes a `paused` row and asserts
  `stale === true`. The `isSurfacePaused` skip at inbound-state.js:115-119 now
  has no regression pin. Same vacuity at
  evaluate-inbound-gate-staleness.test.js:150: verified empirically that its
  fixture makes `readRuntimeObservations` return 0 observations, so the test
  passes through the Phase-2 status filter and would still pass with
  `isSurfacePausedRead` deleted. The skip is genuinely load-bearing on legacy
  multi-id surfaces (probe: legacy active `slot-1` + canonical `paused`
  `vnstock` → 2 observations survive the projection, `isSurfacePaused` is the
  only thing that drops them). Runtime behavior is correct today; the safety
  net for it was removed by this diff.
  Category: CRITICAL
  Fix: Add one test per gate using a legacy-distinct-id active row plus a
  canonical paused row (the shape where the projection does not already filter)
  and rename the two misleading tests.

No security, injection, deserialization, race, off-by-one, or wrong-projection
defects found. Public MCP tool shapes and gate decision shapes are unchanged.
Hook contract verified: `hooks/universal/bash-gate.js` is a thin adapter over
`core/evaluate-bash-gate.js`, so both gates reach the same
`core/observation-staleness.js` primitives — the mode split (age vs marker) is
intentional and documented. The active→paused constraint-gate flip is pinned at
collapse-latest-budget-state-by-id.test.js:206.

## Pass 2 — INFORMATIONAL

- [core/inbound-state.js:28] `isMarkerFresh` now derives the operator-marker TTL
  from `OBSERVATION_STALENESS_WINDOW_MS`, silently coupling two distinct
  concepts. `META_STATE_OBSERVATION_STALENESS_WINDOW_MS=60000` would shrink the
  marker TTL too. constants.js:14-24 documents only the two staleness scans, and
  claims the constant is kept "distinct ... so the two concepts do not drift" —
  which is exactly what happened here.
  Category: INFORMATIONAL
  Fix: Extend the constants.js JSDoc to name `isMarkerFresh` as a third
  consumer, or give the marker TTL its own constant aliased to the same default.

- [core/constants.js:25] The window is read from `process.env` at module load.
  The bash-gate hook and the MCP server are separate processes; an override set
  only in a runtime's `mcp.json` env makes the two gates disagree — the drift the
  plan set out to eliminate.
  Category: INFORMATIONAL
  Fix: Note in the constant's JSDoc that the override must be exported to both
  the hook and MCP environments.

- [__tests__/legacy-mcp/observation-staleness.test.js:157-163] "default 30 min
  when env override unset" asserts `30*60*1000 === 1800000` — a tautology that
  never touches the constant.
  Category: INFORMATIONAL
  Fix: Import `OBSERVATION_STALENESS_WINDOW_MS` and assert it equals 1800000.

- [__tests__/legacy-mcp/observation-staleness.test.js:61] `WINDOW` is hardcoded
  rather than imported, so a default change silently desyncs the boundary tests.
  Category: INFORMATIONAL
  Fix: Import the constant.

- [__tests__/legacy-mcp/inbound-state-runtime-state.test.js:248] "read gate
  degrades to not-paused on corrupt budget-tracking read" never reaches
  `isSurfacePaused` — the projection returns 0 observations, so the loop body
  never runs. The try/catch degrade branch is untested.
  Category: INFORMATIONAL
  Fix: Rename to describe what it pins, or drive a real corrupt-sidecar read.

- [core/runtime-state.js:126] JSDoc says "Module-private" on an exported symbol
  consumed by file-readers.js:81.
  Category: INFORMATIONAL
  Fix: Drop the "Module-private" sentence.

- [core/observation-staleness.js:48] `findObservationsStaleByAge` folds a
  `status === "active"` filter into a module documented as pure age predicates,
  and its only caller (evaluate-inbound-gate.js:176) already applied that filter.
  Category: INFORMATIONAL
  Fix: Drop the redundant filter or rename to `findActiveObservationsStaleByAge`.

- [core/gate-logic.js:1, core/runtime-tracking.js:37, core/evaluate-inbound-gate.js:32]
  Three more bare `30 * 60 * 1000` literals survive the "unification".
  Category: INFORMATIONAL
  Fix: Leave as-is (different concepts) but avoid claiming full unification.

- [docs/architecture.md:167] "both use `OBSERVATION_STALENESS_WINDOW_MS`" is
  inaccurate for the marker mode: `isObservationStaleByMarker` compares
  `markerTs > ref` and never reads the window. The window reaches the outbound
  path only via `isMarkerFresh`.
  Category: INFORMATIONAL
  Fix: Reword to "one window governs the age scan and the marker TTL".

- [__tests__/runtime-state-no-delete-to-clear-gate.test.js:35] Comment locates
  `OBSERVATION_STALENESS_WINDOW_MS` in `core/observation-staleness.js`; it is
  defined in `core/constants.js`.
  Category: INFORMATIONAL
  Fix: Correct the path.

- [__tests__/legacy-mcp/collapse-latest-budget-state-by-id.test.js:122,230]
  `test("setup")` / `test("teardown")` instead of `beforeAll`/`afterAll` makes
  the suite order-dependent and leaks the tmpdir if an inner test throws.
  Category: INFORMATIONAL
  Fix: Convert to `beforeAll`/`afterAll`.

- [core/runtime-state.js:145-149] `collapseLatestBudgetStateById` appends no-id
  rows after all id'd rows, changing emission order versus file order. Harmless
  for found/not-found, but `checkObservationStaleness` returns the first stale
  observation, so escalation messages may name a different id than pre-change.
  Category: INFORMATIONAL
  Fix: None required; note the ordering contract in the JSDoc.

## Review-brief corrections

Four claims in the task brief do not match the diff: there is no
`isObservationFresh` (it is `isObservationStaleByAge`/`ByMarker`), no
`MAX_OBSERVATION_AGE_MS` (it is `OBSERVATION_STALENESS_WINDOW_MS` in
constants.js), no `latestPerSurface` projection (it is
`collapseLatestBudgetStateById` in runtime-state.js), and
`notify-artifact-tool.js` does not re-emit latest finding/change-log versions —
it only drops a now-dead `checkObservationStaleness` import.
`hooks/universal/bash-gate.js` is not in the diff at all.

Status: DONE_WITH_CONCERNS
Summary: The unification is well-executed, well-documented, and behaviorally
correct — the projection dedup, the cross-kind collision guard, and the
block-on-pause flip are all deliberate and pinned. The one blocking concern is a
coverage regression: the paused-surface skip lost its only regression test and
two replacement tests carry pause-claiming names while exercising a different
code path.
Critical: 1
Informational: 12
Concerns/Blockers: Add the pause-skip pins before landing (cheap); consider
documenting the marker-TTL coupling to the shared window.

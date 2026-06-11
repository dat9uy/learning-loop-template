---
phase: 3
title: "Regression guard + cross-CLI parity"
status: completed
priority: P2
effort: "2h"  # Red-team Finding 8: 1h → 2h to account for claude-code probe refactor scope expansion
dependencies: [1, 2]
---

# Phase 3: Regression guard + cross-CLI parity

## Overview

This phase adds the meta-test that locks the conditional-emission invariant: a test that asserts the cold-session probe does NOT write to `meta-state.jsonl` on pass, even when the probe is run repeatedly. It also adds the analogous probe in `claude-code-mcp-loading.test.cjs` and runs the full test suite to confirm 100% pass. The regression guard is the safety net: a future contributor who re-introduces unconditional writes will be caught at PR time.

> **Red-team correction (Finding 8):** `claude-code-mcp-loading.test.cjs` does NOT use `tryClaimSessionId`; it uses `writeEntry + readRegistry.find` (the TOCTOU pattern the predecessor plan fixed for cold-session only, at `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:198-244`). The cross-CLI parity claim in Plan.md is false. This phase's Step 2 includes a behavior change for the claude-code test: port it to use the `probeL1` helper from Phase 1 (which already uses `tryClaimSessionId`). The effort estimate for Phase 3 increases from 1h to 2h to account for this scope expansion.

## Requirements

- **Functional**:
  - The regression-guard test (added in Phase 1, Step 2) is hermetic: it imports `probeL1` and `probeL2` from `probe-helpers.cjs`, calls them with `root=tempRoot` and `gapOpen=false`, and asserts the tempRoot's `meta-state.jsonl` is empty.
  - The same regression-guard pattern is added to `claude-code-mcp-loading.test.cjs` (which is also refactored to use the `probeL1` helper — Finding 8).
  - The full test suite (`pnpm test`) reports 100% pass.
- **Non-functional**:
  - The regression-guard test is fast (<100ms; no real agent CLI is spawned).
  - The test is deterministic (no timing dependencies; no shared state with other tests).
  - The test's failure message is actionable: it names the entry that was written, so a contributor who re-introduces unconditional writes knows exactly which line is the regression.

## Architecture

The regression-guard test is a *meta-test* (a test that asserts the test infrastructure's behavior). It does NOT stub the probe (no mock framework per Finding 2); instead, it imports the `probeL1`/`probeL2` pure functions from `probe-helpers.cjs` (introduced in Phase 1, Step 1) and calls them with `root=tempRoot` and synthetic parameters.

The cross-CLI parity test mirrors the L1 logic in `claude-code-mcp-loading.test.cjs`. The two probe files (cold-session-discoverability, claude-code-mcp-loading) are independent test files but share the same evidence contract via the `probeL1` helper from `probe-helpers.cjs`. The regression-guard test in claude-code-mcp-loading is structurally identical to the one in cold-session-discoverability. The claude-code probe is also refactored to use `probeL1` (Finding 8) — this is a behavior change, not a test-only addition.

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (the regression-guard test added in Phase 1, Step 1; verified here)
- **Modify**: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` (analogous regression-guard test + the Phase 1 refactor applied)

## Implementation Steps

### Step 1: Verify the Phase 1 regression-guard test

Re-run the regression-guard test added in Phase 1, Step 2. It should pass on the refactored code. Confirm the test fails on a *temporarily reverted* version of the refactor (i.e., the test catches the regression it's designed to catch).

### Step 2: Add the analogous test to claude-code-mcp-loading.test.cjs and refactor to use `probeL1`

Mirror the Phase 1 refactor in `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`:
- **Refactor (Finding 8)**: replace the current `writeEntry + readRegistry.find` pattern (`.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:198-244`) with a call to `probeL1` from `probe-helpers.cjs`. This is a behavior change: the claude-code probe will now use the atomic dedup helper, eliminating a TOCTOU race that the predecessor plan fixed for cold-session only.
- Add a regression-guard test asserting `probeL1(tempRoot, { sessionId: "test-synthetic-claude", runtime: "claude", gapOpen: false })` does NOT write to `meta-state.jsonl`.

The test uses a fresh `mkdtempSync` (passed as `root` to the helper, not via `GATE_ROOT`). The expected outcome is the tempRoot's registry is empty after the synthetic pass.

### Step 3: Run the full test suite

Run `pnpm test`. All tests must pass. Specifically:
- `pnpm test -t cold-session-discoverability` — the 5 (or 6) cold-session tests pass, including the regression-guard test.
- `pnpm test -t claude-code-mcp-loading` — the claude probe tests pass, including the regression-guard test.
- `pnpm test -t gate-resolution-evidence` — the 10 rule-mechanism fixtures pass (the rule is unchanged, so these should be unaffected).
- `pnpm test -t meta-state` — the meta-state tool tests pass (the migration in Phase 2 is a registry mutation; verify the tool tests still work).
- `pnpm test` — full suite; 100% pass.

### Step 4: Verify the invariant holds under repeated runs

Run the cold-session test 5 times in a row:

```bash
for i in 1 2 3 4 5; do pnpm test -t cold-session-discoverability 2>&1 | tail -n 1; done
```

Each run should report the same test count and pass count. The `meta-state.jsonl` size should be unchanged after 5 runs (the test does not write on pass).

### Step 5: Verify the rule still gates `meta_state_resolve`

Sanity-check: the rule `rule-cold-session-test-must-pass-before-resolution` is unchanged, so its behavior on `meta_state_resolve` is unchanged. Verify by:
- Running `pnpm test -t gate-resolution-evidence` (10 fixtures, all pass).
- Manually invoking `meta_state_resolve` on `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` and confirming the rule blocks (or passes, depending on the current state of the cold-session test).

## Success Criteria

- [ ] Step 1: Phase 1's regression-guard test passes; it fails on a temporarily reverted refactor.
- [ ] Step 2: analogous test added to `claude-code-mcp-loading.test.cjs`; passes.
- [ ] Step 3: full test suite reports 100% pass.
- [ ] Step 4: 5 consecutive runs of the cold-session test produce no new registry entries.
- [ ] Step 5: `meta_state_resolve` on `meta-260606T0443Z-...` is still gated by the rule (no regression in the rule's evidence contract).

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| The regression-guard test passes on the refactored code but would *also* pass on the un-refactored code (a false-negative guard) | low | The test is verified in Step 1 by temporarily reverting the refactor; the test must fail on the un-refactored code. If it does not, the test is too weak and must be strengthened. |
| The full test suite has flaky tests that intermittently fail | low | The plan is not responsible for pre-existing flakiness; if any test fails, the failure is recorded and triaged separately. The conditional-emission refactor itself is hermetic and does not introduce flakiness. |
| The 5-consecutive-runs check produces a registry mutation due to a hidden side effect | low | The check is automated; if the registry grows, the cause is investigated and fixed. The most likely cause is a test that legitimately writes a finding (e.g., test 1's internalization probe, which is a *real* spawn test, not a synthetic pass). The 5-run check is on `cold-session-discoverability` only; test 1 is excluded if its L2 gap is open (existing skip behavior). |
| The rule's evidence contract is silently broken | low | The rule is unchanged; Step 5's `gate-resolution-evidence` test run catches any regression. |

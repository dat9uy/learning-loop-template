---
phase: 1
title: "Test-first refactor of L1+L2 probes"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Test-first refactor of L1+L2 probes

## Overview

Refactor `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (L1 test 3, L2 test 5) and `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` to emit a `meta_state` `finding` only on novel failure. Pass path: write nothing. Fail path: dedup-write via the existing `tryClaimSessionId` helper. Remove the soft-delete-on-gap-close branch entirely. The refactor follows strict TDD: a regression-guard test is written first (red), the refactor makes it pass (green), and the code is cleaned up (refactor).

## Requirements

- **Functional**:
  - The L1 probe (test 3) writes a `finding` only when `STRICT_MCP_TOOL_PATTERN.test(toolsList)` is `false` AND no existing active finding tracks `(sessionId, "mcp-client-loading", runtime, "L1")`.
  - The L2 probe (test 5) writes a `finding` only when `probeL2Gap().gapClosed` is `false` AND no existing active finding tracks `(sessionId, "mcp-client-loading", runtime, "L2")`.
  - The L1/L2 probes write NOTHING to the registry on a pass.
  - The soft-delete-on-gap-close branch is removed (the registry's normal lifecycle handles cleanup).
  - The same refactor applies to `claude-code-mcp-loading.test.cjs`.
- **Non-functional**:
  - The refactor preserves the test 1 L2-skip behavior (test 1 reads `l2Result.gapClosed`, not the registry).
  - The refactor preserves the `tryClaimSessionId` dedup semantics (same `(session_id, subtype, runtime, layer)` key).
  - The refactor does not modify `core/gate-logic.js#checkResolutionEvidence` or `rule-cold-session-test-must-pass-before-resolution`.

## Architecture

> **Red-team correction (Finding 1):** The refactor must NOT replace `tryClaimSessionId` with `readRegistry + writeEntry`. The current code already uses `tryClaimSessionId` (the atomic dedup helper at `core/meta-state.js:535-563`) which returns `{claimed: false, existing: match}` on dedup. The predecessor plan `260610-1203` shipped `tryClaimSessionId` to fix the TOCTOU race; this plan must preserve that atomicity. The refactor's only behavior change is on the **gap-close branch** (soft-delete removal), not the gap-open branch.

The current probe uses the atomic dedup helper (no change needed for gap-open):

```js
// Current test 3 (gap-open branch) — UNCHANGED by this plan
const claim = await tryClaimSessionId(projectRoot, { sessionId, subtype: "mcp-client-loading", runtime: cli, layer: "L1" }, () => ({ /* finding payload */ }));
if (claim.claimed) { /* log first-claim */ } else { /* log existing */ }
```

The refactored gap-close branch becomes a no-op:

```js
// Refactored test 3 (gap-closed branch) — the only behavior change
// Before: looked up the L1 finding and called updateEntry to set status: "stale".
// After: no-op. The registry's normal lifecycle (reported → active → resolved on TTL
//         or operator meta_state_resolve) handles cleanup.
return;
```

> **Red-team correction (Finding 7):** The "no-op on gap-close" + "rule still gates on active findings" combination creates a contradiction. The active findings the probe previously soft-deleted are now orphaned and will block `meta_state_resolve` of `meta-260606T0443Z-...` indefinitely. The plan must either (a) keep a single gap-close cleanup call, or (b) reframe the goal. **This plan adopts option (a): the gap-close branch calls `meta_state_resolve` on the L1/L2 finding (one per session).** See "Gap-close cleanup mechanism" below.

### Gap-close cleanup mechanism

To preserve the rule's "no active findings" invariant while honoring the "no new writes on pass" goal, the gap-close branch:

1. Looks up the L1/L2 finding matching `(sessionId, "mcp-client-loading", runtime, layer)`.
2. If found and `status === "reported"` or `status === "active"`, calls `meta_state_resolve` with `resolution: "gap closed in subsequent run; conditional emission"`. This is a *single* registry mutation, not the previous soft-delete + restore cycle.
3. If not found, no-op (the probe never wrote anything; nothing to clean up).

This preserves the rule's evidence contract (`checkResolutionEvidence` requires no active `mcp-client-loading` findings) while removing the unconditional write pattern. The migration is operator-gated (`OPERATOR_MODE=1`); see Phase 2 for the script's role requirement.

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (tests 3 and 5; L1 and L2 probe branches)
- **Modify**: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` (analogous probe)
- **Modify**: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` test 4 ("cold-session test soft-deletes persisted finding on gap-close") — update to reflect the new invariant: the test no longer soft-deletes; it asserts the registry is unchanged on pass.
- **Read-only references**:
  - `tools/learning-loop-mcp/core/meta-state.js#tryClaimSessionId` (the dedup helper; unchanged)
  - `tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence` (the rule's evidence check; unchanged)
  - `meta-state.jsonl` (the registry; 18 historical entries to be migrated in Phase 2)

## Implementation Steps (TDD)

> **Red-team correction (Findings 2 and 3):** The regression-guard test cannot stub the probe (the test file uses `node:test` with no mock framework installed; grep for `vi.mock|jest.mock|mockRequire` returns zero matches), and the probe's `tryClaimSessionId` / `updateEntry` calls hard-code `projectRoot` (not `GATE_ROOT`). The plan is revised: refactor the L1/L2 probe logic into importable pure functions that accept a `root` parameter, then write a static regression-guard test that imports those functions and asserts the registry is empty after a synthetic pass. The probe's external `test()` blocks continue to call the pure functions with `projectRoot`.

### Step 1: Refactor probe logic into pure functions

Extract the L1 and L2 probe write logic from `cold-session-discoverability.test.cjs` into a new helper file `tools/learning-loop-mcp/__tests__/probe-helpers.cjs`:

```js
// tools/learning-loop-mcp/__tests__/probe-helpers.cjs
const { tryClaimSessionId, readRegistry } = require("../../core/meta-state");

async function probeL1(root, { sessionId, runtime, gapOpen, writeFn = defaultWriteFn }) {
  if (!gapOpen) {
    // Gap-close branch: clean up any active finding via meta_state_resolve (operator-gated).
    // On a passing run with no prior finding, this is a no-op.
    const existing = readRegistry(root).find(/* predicate */);
    if (existing) {
      // Operator-gated; in test context we call writeFn which is meta_state_resolve
      await writeFn(root, existing.id, { resolution: "gap closed in subsequent run" });
    }
    return;
  }
  // Gap-open branch: atomic dedup via tryClaimSessionId (unchanged from current code).
  const claim = await tryClaimSessionId(root, { sessionId, subtype: "mcp-client-loading", runtime, layer: "L1" }, () => ({ /* finding payload */ }));
  return claim;
}

async function probeL2(root, { sessionId, runtime, gapOpen, writeFn = defaultWriteFn }) { /* analogous */ }

module.exports = { probeL1, probeL2 };
```

This satisfies Finding 1 (atomic helper preserved) and Finding 3 (probe accepts `root` parameter).

### Step 2: Red — write the regression-guard test

Add a new test in `cold-session-discoverability.test.cjs` (place it after test 5) that:

1. Sets `GATE_ROOT` to a fresh `mkdtempSync` dir.
2. Imports `probeL1` and `probeL2` from `probe-helpers.cjs`.
3. Calls `probeL1(tempRoot, { sessionId: "test-synthetic", runtime: "test", gapOpen: false })` and `probeL2(tempRoot, { ... })`.
4. Asserts the tempRoot's `meta-state.jsonl` is empty (or contains zero `entry_kind: "finding"` entries with `subtype: "mcp-client-loading"`).
5. Restores `GATE_ROOT`.

This test fails on the current code because the current code uses `updateEntry` directly on the live registry (via `projectRoot` hardcode). The new helper accepts `root`, so the test can isolate the real probe logic to a tempRoot.

### Step 3: Green — refactor the production test branches

In `cold-session-discoverability.test.cjs` test 3 (L1):

- Replace the inline probe logic with a call to `probeL1(projectRoot, { sessionId, runtime: cli, gapOpen: <result> })`.
- The `gap-closed` branch of the production test becomes a single function call (the helper handles the resolve-via-writeFn).

In `cold-session-discoverability.test.cjs` test 5 (L2): same refactor.

In `claude-code-mcp-loading.test.cjs`: same refactor. (This also addresses Finding 8: the claude-code test currently uses `writeEntry + readRegistry.find`; the new helper unifies the pattern with cold-session.)

### Step 4: Update test 4

Test 4 ("cold-session test soft-deletes persisted finding on gap-close") currently:
1. Pre-populates a finding in tempRoot.
2. Calls the soft-delete branch.
3. Asserts the finding is now `status: "stale"`.

After the refactor, the soft-delete branch is replaced by a `meta_state_resolve` call. Test 4 should be rewritten to:
1. Pre-populate a finding in tempRoot.
2. Run the gap-closed branch (which now calls `meta_state_resolve` via the helper).
3. Assert the finding is now `status: "resolved"`.

> **Red-team correction (Finding 15):** Do not run `pnpm test` between Phase 1 commit and Phase 2 commit — test 4's assertion is shape-locked to the `status: "resolved"` invariant once Phase 1 lands. The Phase 2 verification should run `pnpm test` only after both phases commit.

### Step 5: Refactor — clean up

- Remove the `updateEntry` import from the test file if no longer used.
- Add a comment at the top of each probe branch explaining the conditional-emission invariant.

### Step 6: Verify

- `pnpm test -t cold-session-discoverability` — all 5 (or 6, after Step 2) tests pass.
- `pnpm test` — full suite passes; no new failures.
- The new regression-guard test catches a re-introduction of unconditional writes (verify by temporarily reverting the refactor and running the test; it should fail).

## Success Criteria

- [ ] Step 1: regression-guard test written; it fails on the current code.
- [ ] Step 2: refactor in place; the regression-guard test passes.
- [ ] Step 3: test 4 rewritten to assert the "no-op on gap-close" invariant.
- [ ] Step 4: code cleanup complete; no dead imports.
- [ ] Step 5: `pnpm test` reports 100% pass; the regression-guard test catches a re-introduction of unconditional writes.
- [ ] Same refactor applied to `claude-code-mcp-loading.test.cjs`; that test file's full suite passes.
- [ ] The 18 historical `mcp-client-loading` entries in `meta-state.jsonl` are *not* touched in this phase (they migrate in Phase 2).

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Test 1's L2 skip check breaks (it reads `l2Result.gapClosed`, not the registry, but a regression in the probe helper would cascade) | medium | Test 1's assertions are unchanged; the L2 helper still returns `{ gapClosed, exitCode, stdout, stderr }`. Verify by running test 1 in isolation after the refactor. |
| The dedup-via-`tryClaimSessionId` semantics break on concurrent runs | low | The helper is unchanged; only the *caller* changes. The helper still uses the same `(session_id, subtype, runtime, layer)` key. |
| The regression-guard test is flaky (e.g., timing-dependent) | low | The test uses a fresh `mkdtempSync` and stubs the probe; it is hermetic and deterministic. No real agent CLI is spawned. |
| The refactor breaks the `gate-resolution-evidence.test.js` 10 fixtures | low | Those fixtures use a sandbox and exercise the rule mechanism; they are unaffected by the test refactor. Verify by running `pnpm test -t gate-resolution-evidence` after the refactor. |

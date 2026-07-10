---
phase: 2
title: "Derive-Status Fidelity"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Derive-Status Fidelity (WS1)

## Overview

Fix the two false-positive modes in `core/derive-status.js#computeKind`: (a) symptom-file `evidence_code_ref` flipping `mechanism-shipped`/`resolve` on bare existence; (b) `:line-range`/`#anchor`-suffixed refs returning `code-missing`. Two surgical changes: reuse `stripEvidenceAnchor` in `checkExists` (DRY with SP2), and make `test_passed` the positive signal for `mechanism-shipped` (SP1/SP2 symmetry). Bundled with WS2 in a single PR (Phase 4); multi-PR deferred until `meta-260709T1017Z-…-parallel-prs` is fixed.

## Requirements

- Functional: `mechanism-shipped` requires a positive test-pass signal (Option B per Phase 1 Probe 1), not bare file existence; suffixed refs resolve to the base file path.
- Non-functional: no new helper — reuse `stripEvidenceAnchor` from `core/gate-logic.js`. `computeKind` signature change stays internal (pure function, injected `codeContext`). No subprocess added.

## Architecture

`computeKind` currently ignores `test_passed` (collected in `signals` at `derive-status.js:66` but never passed to `computeKind` at line 70). The fix threads the already-plumbed signal into the decision:

```
// pseudo — final shape locked in Phase 1
function computeKind(codeRefExists, testFileExists, testPassed, codeRef, testPath) {
  if (codeRef === null && testPath === null) return "no-signals";
  if (codeRefExists === false) return "code-missing";
  if (testPath !== null && testFileExists === false) return "code-only";
  // mechanism-shipped: file(s) exist AND (test passed OR no test required to confirm).
  // testPassed === true → confirmed. testPassed === null/false → code-only (uncertain).
  if (testPassed === true) return "mechanism-shipped";
  return "code-only";
}
```

And `checkExists` strips the suffix before resolving (mirrors `check-grounding.js:154`):
```
import { stripEvidenceAnchor } from "./gate-logic.js";   // reuse, single source of truth
function checkExists(root, path) {
  const stripped = stripEvidenceAnchor(path);
  ... resolveSafePath(root, stripped) ...
}
```

Downgrade effect (verified in Phase 1 Probe 1): a finding that was falsely `mechanism-shipped`/`resolve` becomes `code-only`/`investigate` — `query-drift.js:90` still counts `active-uncertain` as drift, so **drift detection is preserved**; only the recommendation narrows from `resolve` to `investigate`. This is exactly the failure the #48 closeout hit (reported `resolved-by-mechanism` because `.gitignore` exists → misled the next-move pick).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/derive-status.js` (`computeKind` + `checkExists` + the `computeKind` call site at line 70).
- Modify tests: `__tests__/legacy-mcp/derive-status.test.js` (flip the tests Phase 1 Probe 1 enumerated: those asserting `mechanism-shipped`/`resolve` under `run_tests:false` → now `code-only`/`investigate`; add new tests for suffixed-ref resolution + `test_passed:true` → `mechanism-shipped`).
- Possibly modify: `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` if it asserts a `resolve` recommendation under default `run_tests:false`.
- Create: none.

## Implementation Steps

1. **TDD — write failing tests first** (Red). In `derive-status.test.js`: (a) a finding with `evidence_code_ref: "src.js:102-113"` where `src.js` exists → currently `code-missing` → assert `code-only` (will fail until Step 2). (b) a finding with `evidence_code_ref: ".gitignore"` (symptom file) exists, no `test_passed` → assert `code-only` + recommendation `investigate` (not `resolve`). (c) a finding with both files existing AND `codeContext.test_passed: true` → assert `mechanism-shipped` + `resolve`. (d) `code-only` → recommendation `investigate` (Probe 2 lock). Run `node --test` on the file → confirm Red on the new assertions.
2. **Fix `checkExists`** — import `stripEvidenceAnchor` from `./gate-logic.js`, strip the ref before `resolveSafePath`. (Reuses the exact helper `check-grounding.js:154` uses — DRY.) This closes mode (b).
3. **Fix `computeKind`** — thread `test_passed` into the signature and the decision (Option B per Probe 1). Update the call site at line 70 to pass `codeContext.test_passed ?? null`. This closes mode (a): bare existence no longer yields `mechanism-shipped`.
4. **Fix `computeRecommendation`** — add `if (kind === "code-only") return "investigate";` before the final `return "no_action"` (Probe 2 lock). 1-line.
5. Run the derive-status test file → Green. Then flip `sp1-derive-status-acceptance.test.js:42-51` — the named acceptance test that locks the buggy contract (`handler({ id })` with default `run_tests:false`, no test file). All four assertions flip: `mechanism-shipped`→`code-only`, `resolve`→`investigate`, `drift:true`→`drift:false` (validation Q2: derive_status's `drift` field diverges from query-drift by design; query-drift stays the drift-detection source of truth), `signals.test_passed` stays `null`. Update the test title to reflect the corrected contract (PR #47 precedent: tests documenting broken behavior flip to the terminal-state pattern). Re-run → Green.
6. **Re-ground check.** Re-derive the two escalate silent-persistence-fail findings (`meta-260619T2233Z` `meta-state-log-change-tool.js:102-113`, `meta-260626T1419Z` `meta-state-supersede-tool.js:52-73`) via `meta_state_derive_status`. Confirm they no longer report `code-missing`/`investigate-as-missing` from the `:line-range` bug → now correctly `code-only`/`investigate` (file exists, mechanism not shipped). This is the live re-ground Phase 2 was chosen to deliver.

## Success Criteria

- [ ] Suffix-stripping reuse: `checkExists` calls `stripEvidenceAnchor`; no second regex written.
- [ ] `test_passed === true` is required for `mechanism-shipped` (Option B); bare existence yields `code-only`.
- [ ] `sp1-derive-status-acceptance.test.js:42-51` flipped: `mechanism-shipped`/`resolve`/`drift:true` → `code-only`/`investigate`/`drift:false` (drift-field divergence from query-drift accepted per validation Q2).
- [ ] `code-only` recommendation is `investigate`.
- [ ] The two `:line-range` escalate findings re-derive to `code-only`/`investigate` (not `code-missing`).
- [ ] `pnpm test` green; the flipped tests document the corrected contract.

## Risk Assessment

- **Contract-tightening (Option B, locked in validation):** Option B was chosen over Option A in Validation Session 1 — both fix all currently-affected findings (none carry `evidence_test`); B preferred for SP1/SP2 symmetry + stronger fidelity. Option A (evidence_test *exists*) stays a documented alternative only, not the shipped path.
- **`stripEvidenceAnchor` import cycle:** `core/derive-status.js` importing from `core/gate-logic.js` — verify no circular import (gate-logic does not import derive-status). One-time `node --test` run surfaces any cycle immediately.
- **Test-flip honesty:** only flip tests that documented the *broken* passthrough (existence=shipped). Do not flip tests asserting genuinely-shipped mechanisms with passing tests — those stay Green unchanged. Match the PR #47 "accept-and-unwrap terminal-state pattern" framing in the change-log.

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
  // mechanism-shipped: test_passed === true → confirmed. Null/false → code-only (uncertain).
  // (Red-Team Finding 3: this is a deliberate broader contract change — findings with
  // only evidence_code_ref (no evidence_test) now derive code-only too, matching the
  // symptom-file false-positive fix intent. ~38 registry entries flip; the cascade
  // is the deliverable, not a regression.)
  if (testPassed === true) return "mechanism-shipped";
  return "code-only";
}
```

**Contract change scope (Finding 3):** the previous contract returned `mechanism-shipped` for any finding whose `evidence_code_ref` existed. The new contract returns `mechanism-shipped` only when `test_passed === true` — for all findings, including those with only `evidence_code_ref`. This is a deliberate decision to ship the symptom-file false-positive fix (mode (a)) consistently across the registry. The blast radius is ~38 registry entries; re-derive them in Phase 2 Step 5.5 and append the diff to the change-log.

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
- Modify tests (Phase 1 Probe 1 lock — Red-Team Finding 1):
  - `__tests__/legacy-mcp/derive-status.test.js` — flip lines ~36-48, ~87-97, ~122-141, ~158-169, ~171-180 (`mechanism-shipped`/`resolve`/`drift:true` → `code-only`/`investigate`/`drift:false`); add new test for suffixed-ref resolution + symptom-file case + `test_passed:true` → `mechanism-shipped`.
  - `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` — flip lines ~63-113, ~92-95 (`mechanism-shipped`/`resolved-by-mechanism`/`drift:true` → `code-only`/`investigate`/`drift:false`).
  - `__tests__/legacy-mcp/meta-state-stale-flag.test.js:109-126` (T5) — flip `re_verify` to `investigate`.
- Modify (acceptance test): `__tests__/legacy-mcp/sp1-derive-status-acceptance.test.js:42-51` (4 assertions flip).
- Create: none.

## Implementation Steps

1. **TDD — write failing tests first** (Red). In `derive-status.test.js`: (a) a finding with `evidence_code_ref: "src.js:102-113"` where `src.js` exists → currently `code-missing` → assert `code-only` (will fail until Step 2). (b) a finding with `evidence_code_ref: ".gitignore"` (symptom file) exists, no `test_passed` → assert `code-only` + recommendation `investigate` (not `resolve`). (c) a finding with both files existing AND `codeContext.test_passed: true` → assert `mechanism-shipped` + `resolve`. (d) `code-only` → recommendation `investigate` (Probe 2 lock). Run `node --test` on the file → confirm Red on the new assertions.
2. **Fix `checkExists`** — import `stripEvidenceAnchor` from `./gate-logic.js`, strip the ref before `resolveSafePath`. (Reuses the exact helper `check-grounding.js:154` uses — DRY.) This closes mode (b).
3. **Fix `computeKind`** — thread `test_passed` into the signature and the decision (Option B per Probe 1). Update the call site at line 70. Replace the existing call exactly (Red-Team Finding 4 — argument position spelled out to avoid parameter-binding bugs):

```diff
- const kind = computeKind(codeRefExists, testFileExists, codeRef, testPath);
+ const kind = computeKind(codeRefExists, testFileExists, codeContext.test_passed ?? null, codeRef, testPath);
```

`test_passed` goes at position 3 (between `testFileExists` and `codeRef`), per the pseudo signature. This closes mode (a): bare existence no longer yields `mechanism-shipped`.
4. **Fix `computeRecommendation`** — add `if (kind === "code-only") return "investigate";` before the final `return "no_action"` (Probe 2 lock). 1-line. **Consumer audit (Red-Team Finding 13):** before this edit, run the literal grep:

```bash
rg -n 'recommendation.*no_action' tools/learning-loop-mastra --type js -g '!**/__tests__/**'
```

Pass criterion: zero matches branching on `kind: code-only` specifically. If any match exists, flag it as a follow-up before merging.
5. Run the derive-status test file → Green. Then flip the test surfaces enumerated in Phase 1 Probe 1 (Red-Team Finding 1):
   - `sp1-derive-status-acceptance.test.js:42-51` — 4 assertions flip (`mechanism-shipped`→`code-only`, `resolve`→`investigate`, `drift:true`→`drift:false`, `signals.test_passed` stays `null`).
   - `__tests__/legacy-mcp/derive-status.test.js` lines ~36-48, ~87-97, ~122-141, ~158-169, ~171-180 — flip to `code-only`/`investigate`/`drift:false`.
   - `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` lines ~63-113, ~92-95 — flip to `code-only`/`investigate`.
   - `__tests__/legacy-mcp/meta-state-stale-flag.test.js:109-126` (T5) — flip `re_verify` to `investigate`.
   - Add new tests for: symptom-file case (`evidence_code_ref: ".gitignore"` exists, no `test_passed` → `code-only`/`investigate`); suffixed-ref resolution (`evidence_code_ref: "src.js:102-113"` where `src.js` exists → `code-only`); explicit `test_passed:true` → `mechanism-shipped`.

   Update test titles from "**RED**" framing to "**ACCEPTS**" (corrected contract) per PR #47's terminal-state pattern. **Reframe (Red-Team Finding 8):** these flips are a deliberate **contract change** ("computeKind semantics now require `test_passed === true` for `mechanism-shipped`"), NOT "fixing broken behavior." The change-log entry must reflect this language to keep Option A in scope for any future re-debate.

5.5 **Blast-radius re-derive (Red-Team Finding 3 sub-step):** run `meta_state_derive_status` on all `entry_kind: finding + evidence_code_ref != null + status ∈ {open, active, reported, stale}` entries (≈38 entries per `meta-state.jsonl`). Capture pre-PR `kind` values. After Step 5's flips, re-run; the diff is the contract-change blast radius. Append the diff to the change-log as `applies_to.findings: [count]`. Do NOT auto-resolve flipped entries.

6. **Re-ground check.** Re-derive the two escalate silent-persistence-fail findings (`meta-260619T2233Z` `meta-state-log-change-tool.js:102-113`, `meta-260626T1419Z` `meta-state-supersede-tool.js:52-73`) via `meta_state_derive_status`. Confirm they no longer report `code-missing`/`investigate-as-missing` from the `:line-range` bug → now correctly `code-only`/`investigate` (file exists, mechanism not shipped). This is the live re-ground Phase 2 was chosen to deliver.

## Success Criteria

- [ ] Suffix-stripping reuse: `checkExists` calls `stripEvidenceAnchor`; no second regex written.
- [ ] `test_passed === true` is required for `mechanism-shipped` (Option B); bare existence yields `code-only` for ALL findings (deliberate broader contract change per Red-Team Finding 3).
- [ ] All enumerated tests flipped (per Phase 1 Probe 1 / Red-Team Finding 1):
   - `sp1-derive-status-acceptance.test.js:42-51` (4 assertions)
   - `__tests__/legacy-mcp/derive-status.test.js` lines ~36-48, ~87-97, ~122-141, ~158-169, ~171-180 (5 test cases)
   - `__tests__/legacy-mcp/meta-state-derive-status-tool.test.js` lines ~63-113, ~92-95
   - `__tests__/legacy-mcp/meta-state-stale-flag.test.js:109-126` (T5)
   - Plus new symptom-file + suffixed-ref + `test_passed:true` cases
   All flip to `code-only`/`investigate`/`drift:false`; titles updated "**ACCEPTS**" not "**RED**".
- [ ] `code-only` recommendation is `investigate` (after Step 4 consumer-audit grep returns zero matches).
- [ ] The two `:line-range` escalate findings re-derive to `code-only`/`investigate` (not `code-missing`).
- [ ] Blast-radius diff captured (~38 registry entries; Phase 2 Step 5.5); appended to change-log as `applies_to.findings`.
- [ ] `pnpm test` green; flipped tests reflect the corrected contract.

## Risk Assessment

- **Contract-tightening (Option B, locked in validation):** Option B was chosen over Option A in Validation Session 1 — both fix all currently-affected findings; B preferred for SP1/SP2 symmetry + stronger fidelity. Option A (evidence_test *exists*) stays a documented alternative, not the shipped path. **Reframe (Red-Team Finding 8):** the test flips are a deliberate contract change ("`mechanism-shipped` now requires `test_passed === true`"), NOT "fixing broken behavior à la PR #47." PR #47's flipped test (`meta-state-patch-derived-schema.test.js`) was a documented bug-passthrough being undone; `derive-status.test.js` tests lock a positive semantic contract that Option B explicitly changes. Change-log language must reflect this.
- **`stripEvidenceAnchor` import cycle:** `core/derive-status.js` importing from `core/gate-logic.js` — verify no circular import (gate-logic does not import derive-status). **Red-Team Finding 7 — `node --test` does NOT detect ESM circular imports** (cycles resolve at first static-access time; tests can pass while cycles stay latent until a deeper call path hits them). Replace the cycle-detection probe with:
   ```bash
   node -e "import('./core/derive-status.js').then(m => import('./core/gate-logic.js')).then(g => console.log('cycle check:', typeof g.stripEvidenceAnchor))"
   ```
   If the cycle is latent, this surfaces it (sentinel access forces evaluation). Alternatively, add `madge --circular tools/learning-loop-mastra/core/` to CI as a structural check.
- **`stripEvidenceAnchor` malformed-anchor edge case (Red-Team Finding 14 — partial accept, follow-up):** the helper strips only `:digits` / `:dotted.path` / `#anchor.spaces`. A ref like `src.js:foo` (non-canonical anchor) passes through unchanged → `checkExists` returns false → same bug pattern WS1 claims to close for `:line-range` refs is reintroduced for non-canonical anchors. This is a **pre-existing** limitation, not introduced by this plan; tightening `stripEvidenceAnchor` (or adding a fallback `if (stripped doesn't exist, try original)` in `checkExists`) is a follow-up plan. Documented here so Phase 1 Probe 1 does not claim completeness.
- **Blast-radius enumeration (Red-Team Finding 3):** the contract flip affects ~38 registry entries with `evidence_code_ref` but no `evidence_test`. Phase 2 Step 5.5 captures the pre/post-PR `kind` diff via `meta_state_derive_status` and appends to the change-log.
- **Test-flip honesty:** only flip tests that lock the OLD contract (`mechanism-shipped` from `baseContext()` with no `test_passed`). Do NOT flip tests asserting genuinely-shipped mechanisms with explicit `test_passed: true` — those stay Green unchanged. PR #47's accept-and-unwrap pattern would be incorrect framing here; this is a contract change, not a bug passthrough.

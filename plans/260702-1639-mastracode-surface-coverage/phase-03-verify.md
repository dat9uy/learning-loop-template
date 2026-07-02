---
phase: 3
title: "Tests & Gate"
status: pending
effort: P2
dependencies: [1, 2]
---

# Phase 3: Tests & Gate

## Overview

Update the two test invariants that hard-code the 2-surface list, add a
regression test that would have caught a silent `SHIM_DIRS` drop, run the full
suite + Fallow PR gate, and do the site-by-site review the Plan 5-Lite journal
named as its load-bearing lesson.

## Requirements

- Functional: test coverage asserts all 3 surfaces for shim-name-set equality and
  for `shims-in-sync` over the real repo. A missing `.mastracode` shim fails a
  test.
- Non-functional: `pnpm test` green, `pnpm fallow:gate` green, no `--no-verify`.
  Docs updated to close the Out-of-Scope entry.

## Architecture

`runtime-agnostic.test.js` currently hard-codes `SHIM_CLAUDE` and `SHIM_FACTORY`
(line 11-12) and compares only those two (line 120-128). Extend it to derive the
shim-dir set from `SURFACES` so a 4th runtime is picked up automatically — same
"single source of truth" principle the source migration enforces.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`
- Modify: `docs/security/plan-5-hardening.md` (§ Out-of-Scope → mark closed)
- Read: all 5 migrated source files (site-by-site review)

## Implementation Steps

1. In `runtime-agnostic.test.js`, replace the hard-coded `SHIM_CLAUDE` /
   `SHIM_FACTORY` constants (line 11-12) with a `SURFACES`-derived map:
   ```js
   import { SURFACES } from "../../core/surfaces.js";
   const SHIM_DIRS = SURFACES.map((s) => join(MCP_ROOT, s, "coordination/hooks"));
   ```
2. Rewrite the "both shim directories have the same set of .cjs shim names" test
   (line 120) to assert **all** `SHIM_DIRS` share one sorted `.cjs` name set:
   iterate, compute each dir's sorted `.cjs` list, assert every list equals the
   first. Rename the test to "all shim directories have the same set of .cjs
   shim names".
3. Add a regression test: "shims-in-sync flags a missing .mastracode shim". Use
   a temp root with `SHIM_DIRS`-equivalent dirs where `.mastracode` is missing
   the shim → assert `result.ok === false` and `result.found` mentions the
   mastracode path. This pins the 2.4 step-2 fix against the silent-drop
   failure mode.
4. Add a regression test for `inbound-gate.js` marker write: assert
   `.last-operator-message` is written under `.mastracode/coordination/` (and
   the other two) when `GATE_MARKER_PATH` is unset. Use the existing test
   harness pattern for `inbound-gate.js` tests; if none exists, add a minimal
   one that invokes `writeOperatorMessageMarker` via a small driver or asserts
   on the produced files after running the hook against a temp root.
5. Add a test for `mark-preflight-complete-tool.js` asserting the preflight
   marker appears under all 3 `coordination/` dirs when `GATE_COORD_DIR` is
   unset (extend the existing tool test if present; otherwise add one using
   `GATE_COORD_DIR` unset + temp root).
6. Add a test for `evaluate-bash-gate.js` asserting a bash redirect to
   `.mastracode/coordination/.loop-preflight-product` is detected as a
   path-write (blocked). Extend the existing `PATH_WRITE_PATTERNS` test with
   the mastracode literal case.
7. Run the narrow suite first:
   ```bash
   node --test tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js
   ```
   then broaden to the touched areas, then full:
   ```bash
   pnpm test
   pnpm fallow:gate
   ```
   No `--no-verify`.
8. **Site-by-site review (mandatory):** re-read each of the 5 migrated files in
   full. For each, confirm: (a) the `SURFACES` import resolves, (b) the test
   override env hook is intact, (c) no 2-element destructure or literal array
   survived, (d) behavior for `.claude`/`.factory` is unchanged. Do not rely on
   the green suite — the journal's lesson is that green proves coverage, not
   correctness.
9. Update `docs/security/plan-5-hardening.md` § Out-of-Scope: rewrite the
   "Surface-divergence follow-up (source files)" bullet to state the 5 files
   were closed by this plan (reference the plan dir), and remove the per-file
   tracked-for-follow-up list. Keep the other Out-of-Scope bullets (read-then-
   write composition, subprocess re-pin, Windows UNC, stdout credential leak,
  LIM-3 resolved_by spoofing) unchanged.
10. Conventional commit: `feat(hooks): cover .mastracode surface in legacy gates and shim check` (or `fix` if you prefer; scope is hardening closure). No AI references, no plan IDs in the commit message per project rules.

## Success Criteria

- [x] `runtime-agnostic.test.js` derives shim dirs from `SURFACES`; the
  name-set test covers all 3 surfaces.
- [x] Regression test for missing `.mastracode` shim passes (and would fail
  against a 2-element-destructure `shims-in-sync`).
- [x] Regression tests for the 3 behavior-changing source files
  (`inbound-gate`, `mark-preflight`, `evaluate-bash-gate`) assert `.mastracode`
  coverage.
- [x] `pnpm test` green; `pnpm fallow:gate` green; pre-commit ran clean without
  `--no-verify`.
- [x] Site-by-site review of all 5 files complete; review notes recorded in the
  plan's `reports/` dir or journal.
- [x] `docs/security/plan-5-hardening.md` Out-of-Scope updated; the 5-file list
  removed from "tracked for follow-up".
- [ ] Branch `hardening/plan-5-lite-r2-lim4` was already pushed/PR'd by Plan
  5-Lite; this follow-up ships on a new branch (e.g.
  `hardening/mastracode-surface-coverage`) — confirm with user before
  pushing/opening PR.

## Risk Assessment

- **Test over-coupling to `SURFACES` ordering:** deriving `SHIM_DIRS` from
  `SURFACES` means a future reorder of `SURFACES` could mask a name-set
  comparison if the test asserts against a fixed expected list. Mitigation:
  assert "all dirs equal each other", not "equal to a hard-coded list" —
  order-independent.
- **`inbound-gate.js` testability:** `writeOperatorMessageMarker` is a
  file-local function not exported. If step 4 cannot exercise it without an
  export, prefer running the hook end-to-end against a temp root (stdin mock via
  `parseInput`) over adding an export — do not widen the public surface for
  testability. If end-to-end is impractical, document the gap and rely on the
  `writeToAllSurfaces` unit coverage + the grep invariant; do not skip silently.
- **Fallow gate noise:** new test files may trip the Fallow `unused-export` /
  coverage rules that Plan 5-Lite just greened. Mitigation: run
  `pnpm fallow:gate` locally before committing; if a new finding appears, fix
  the real cause (do not `--no-verify`).
- **Docs staleness:** the Out-of-Scope list has specific line references. After
  editing, re-read the section to confirm no dangling reference to the removed
  per-file list remains elsewhere in the doc.
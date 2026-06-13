---
phase: 5
title: "B2-3 Revert 9 reader-patch sites (registry helper stays)"
status: completed
priority: P1
effort: "1h"
dependencies: ["phase-04-b2-2-wire-patch-tool-to-derived-schema"]
---

# Phase 5: B2-3 Revert 9 reader-patch sites (registry helper stays)

## Overview

Now that the structural blocker is gone AND the 1 live wrap site has been flattened (Phase 4 Part 2), the workaround code in the reader layer is no longer needed. This phase reverts **9 ad-hoc reader patches** that tolerated both shapes (flat array, `{item: [...]}`), collapsed to **2-3 commits** (one revert per logical group).

**Critical reversal from the original plan:** the registry `unwrapItemWrap` helper in `tool-registry.js:58-75` is **KEPT**. The original plan called for deleting it; the red-team found that this helper is **tool-side** coercion (used by 14+ tools with typed top-level array/object fields whose stdio wire-format still arrives as `{item: [...]}`), not reader-side tolerance. Removing it would break every typed top-level array tool, not just `meta_state_patch`. The only `unwrapItemWrap` deletion in this phase is the **local copy** in `meta-state-list-tool.js:57-62` (a different helper, scoped to the list tool's `proposed_design_for` scan).

**Site count reversal:** the brainstorm said 6; the actual count is **9** (verified via `grep`). The 9 sites are:
1. `core/loop-introspect.js:351-355` (1 site, the buildRegistrySummary ternary)
2. `scripts/fix-loop-design-refs.mjs:35-39` (1 site, the script's unwrap)
3. `__tests__/fix-loop-design-refs.test.js:18-19` (1 site, the `countBrokenRefs` helper)
4. `__tests__/fix-loop-design-refs.test.js:42-44` (1 site, the instructionLayer ternary)
5. `__tests__/fix-loop-design-refs.test.js:52-54` (1 site, the crossRefFields ternary)
6. `__tests__/fix-loop-design-refs.test.js:100-102` (1 site, the CAS consistency ternary)
7. `__tests__/cold-tier-regression.test.js:27-29` (1 site, the brokenRefs flatMap)
8. `__tests__/meta-state-list-ref-by-filter.test.js:86-94` (1 site, the wire-format wrap test)
9. `tools/meta-state-list-tool.js:57-62` (1 site, the local `unwrapItemWrap` copy)

## Requirements

- Functional: 3 commits land in this phase (1 per logical group)
- Functional: after each commit, `pnpm test` stays green
- Functional: the source data is flat-only; the both-shapes tolerance is gone
- Non-functional: each commit message references the brainstorm's Phase 3 plan
- Non-functional: revert comments explaining the wire-format tolerance are deleted

## Architecture

The 3 commits are grouped by logical locality, not by site:

| # | Group | Files | Rationale |
|---|-------|-------|-----------|
| 1 | Script + its test | `scripts/fix-loop-design-refs.mjs` (site 2) + `__tests__/fix-loop-design-refs.test.js` (sites 3-6) | The test runs the script via `execSync` (`__tests__/fix-loop-design-refs.test.js:28`); coupled — must land together. Single `pnpm test` between commits would either fail (script reading live wrap data after migration is fine — but the assertions reference the old both-shapes pattern) or pass silently with stale assertions. |
| 2 | Core/cold-tier reader | `core/loop-introspect.js:351-355` (site 1) + `__tests__/cold-tier-regression.test.js:27-29` (site 7) | Both read `proposed_design_for` for `buildRegistrySummary` / cold-tier regression. The cold-tier test asserts the projection from the strict reader; coupled. |
| 3 | List-tool local helper + wire-format test flip | `tools/meta-state-list-tool.js:57-62` (site 9, the local `unwrapItemWrap` copy) + `__tests__/meta-state-list-ref-by-filter.test.js:86-94` (site 8, flip the wrap-tolerance test to assert flat) + `__tests__/wire-format-top-level-coercion.test.js` + `__tests__/wire-format-patch-recursion.test.js` (assertion updates from `{item: [...]}` to flat — these tests still use the wrap INPUTS, but the OUTPUTS are flat) | The list-tool local helper is the only `unwrapItemWrap` deletion in this phase. The wire-format test flips are coupled: the same wire-format stack now produces flat OUTPUTS for flat-or-wrap INPUTS, so all `{item: [...]}` output assertions become flat assertions. |

**Why grouped, not per-site (7 commits as in the original plan):** the 862-test suite catches all regressions across the 9 sites; per-site isolation provides no bisect signal the suite doesn't already provide. The precedent plan `260610-...-wire-format-recursion` shipped `unwrapItemWrap` in 1 commit; the precedent plan `260608-1015-meta-state-patch-tool-and-wire-format-fix` shipped the TDD closeout in 1 commit. Per Scope Critic Finding 4.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (~7 lines: delete the local `unwrapItemWrap` helper at lines 57-62 + update the call site at line 147)
- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.js` (~5 lines: revert the both-shapes tolerance at line 351-355)
- **Modify:** `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (~5 lines: revert the both-shapes tolerance at lines 35-39; **path verified: the script lives at `tools/learning-loop-mcp/scripts/`, not `scripts/`**)
- **Modify:** `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` (~12 lines: revert 4 both-shapes tolerance sites at lines 18-19, 42-44, 52-54, 100-102)
- **Modify:** `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (~3 lines: revert at lines 27-29)
- **Modify:** `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js` (~5 lines: change wire-format wrap test at lines 86-94 to assert flat)
- **Modify:** `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (~10 lines: change `{item: [...]}` output assertions to flat; the input payloads still use `{item: [...]}` to verify the outer `coerceParamsToSchema` unwrap)
- **Modify:** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (~12 lines: same — `{item: [...]}` input payloads stay; output assertions flip to flat)
- **Unchanged (explicit):** `tools/learning-loop-mcp/tool-registry.js#unwrapItemWrap` (KEEP — tool-side coercion used by 14+ tools; deleting it breaks the entire stdio wire-format stack per Assumption Destroyer Finding 3 / red-team reversal)
- **Unchanged (explicit):** `tools/learning-loop-mcp/core/meta-state.js:246#metaStateEntryPatchSchema` (KEEP as passthrough for B1-B2; script callers use `_expected_version`)

## Implementation Steps

1. **Pre-state check** (run before any commit). **IMPORTANT:** Phase 5 MUST only be run after Phase 4 Part 2 completes (the reverted scripts read `proposed_design_for` directly; if the live data is still wrapped, the script treats `{item: [...]}` as object keys and corrupts data).
   ```sh
   node -e "const lines = require('fs').readFileSync('meta-state.jsonl', 'utf8').split('\n').filter(l => l.trim()); let wrap = 0; for (const l of lines) { const e = JSON.parse(l); for (const k of ['proposed_design_for', 'addresses']) { const v = e[k]; if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.item)) wrap++; } } console.log('wrap sites:', wrap);"
   ```
   - Expected output: `wrap sites: 0` (Phase 4 Part 2 migration already flattened the 1 live wrap site)
   - If different, STOP and re-run the Phase 4 migration.
   - Note: do NOT use `grep -c '"item"' meta-state.jsonl` — it matches ANY JSON containing the string `"item"` (e.g., in descriptions), producing false positives.

2. **Commit 1: Revert script + its test (4 sites)**
   - File: `tools/learning-loop-mcp/scripts/fix-loop-design-refs.mjs` (site 2, lines 35-39)
     - Change the unwrap comment + ternary to:
       ```js
       // proposed_design_for is a flat string array (wire-format wrap fix in Phase B)
       const refs = entry.proposed_design_for;
       if (!refs || refs.length === 0) continue;
       ```
   - File: `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` (sites 3-6, lines 18-19, 42-44, 52-54, 100-102)
     - Site 3 (countBrokenRefs helper at line 18-19): change the `flatMap` to read `e.proposed_design_for` directly
     - Site 4 (instructionLayer ternary at line 42-44): change to `instructionLayer.proposed_design_for ?? []`
     - Site 5 (crossRefFields ternary at line 52-54): change to `crossRefFields.proposed_design_for ?? []`
     - Site 6 (CAS consistency ternary at line 100-102): change the `refs` extraction to direct array access
   - Run `pnpm test` — must stay green
   - Commit: `refactor(fix-loop-design-refs): drop wire-format tolerance (data is now flat); coupled script+test revert per plans/260613-1853-phase-b-bridge-5-core-fix`

3. **Commit 2: Revert core/cold-tier reader (2 sites)**
   - File: `tools/learning-loop-mcp/core/loop-introspect.js` (site 1, lines 351-355)
     - Change:
       ```js
       const refs = Array.isArray(design.proposed_design_for)
         ? design.proposed_design_for
         : (design.proposed_design_for.item ?? []);
       ```
       to:
       ```js
       const refs = design.proposed_design_for ?? [];
       ```
   - File: `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (site 7, lines 27-29)
     - Change the `flatMap`'s ternary to direct `Array.isArray` guard
   - Run `pnpm test` — must stay green
   - Commit: `refactor(loop-introspect): drop wire-format tolerance on proposed_design_for (data is now flat); coupled core+test revert per plans/260613-1853-phase-b-bridge-5-core-fix`

4. **Commit 3: Revert list-tool local helper + flip wire-format tests (3 sites)**
   - File: `tools/learning-loop-mcp/tools/meta-state-list-tool.js` (site 9, lines 55-62 + line 147)
     - Delete the local `unwrapItemWrap` helper at lines 55-62 (the JSDoc + function)
     - At line 147, change `const refs = unwrapItemWrap(e.proposed_design_for);` to `const refs = e.proposed_design_for;` (the `Array.isArray` guard is already at line 148)
   - File: `tools/learning-loop-mcp/__tests__/meta-state-list-ref-by-filter.test.js` (site 8, lines 86-94)
     - The test currently creates a `wrappedDesign` with `proposed_design_for: { item: ["target-finding"] }` to assert the list tool tolerates the wrap
     - Change the test to use `proposed_design_for: ["target-finding"]` (flat) — the test still asserts the design is found via `ref_by` filter, but the data is now flat
     - Update the test name from "proposed_design_for scan tolerates wire-format wrap {item: [...]}" to "proposed_design_for scan finds loop-designs by ref_by (flat)"
   - File: `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js`
     - Tests 1 and 2 (lines 125-172): the input payloads use `{item: [...]}` (correct — they verify the outer `coerceParamsToSchema` unwraps); the output assertions at lines 144-145 and 169-170 already expect flat (correct — they verify the post-coercion state). **No change needed**; verify the tests pass.
   - File: `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`
     - Test 1 (line 127-169): the test calls `meta_state_patch` with `patch: { item: { addresses: [...], description: "..." } }` (the BUG symptom — the patch object itself is wrapped). Change to `patch: { addresses: [...], description: "..." }` (flat). Update the test name from "meta_state_patch unwraps {item: {...}} wrapped patch object via stdio" to "meta_state_patch accepts flat patch object via stdio". **Note:** this is the SOLE owner of this test's modification — Phase 2 does NOT touch `wire-format-patch-recursion.test.js`.
     - Test 3 (line 188-202): currently calls `propose_design` with `{item: ["rule-A"]}` and asserts flat. **No change needed** — this is exactly the wire-format coercion contract; the outer `coerceParamsToSchema` unwraps `{item: [...]}` and the test asserts flat. Keep the `{item: [...]}` input to exercise the outer coercion.
     - Test 1.5 (line 206-221): same as Test 3 — keep `{item: [...]}` input.
   - Run `pnpm test` — must stay green
   - Commit: `refactor(meta-state-list): drop local unwrapItemWrap copy; flip wire-format test contract to assert flat outputs`

5. Final `pnpm test` — all 866 expected tests pass (862 baseline + 4 from Phase 2 = 866; no new unit tests because the per-key parity test in `schema-to-zod-patch.test.js` was eliminated per Scope Critic Finding 3)

## Success Criteria

- [x] 3 commits land in order; each one passes `pnpm test` independently
- [x] Registry `unwrapItemWrap` helper **preserved** in `tool-registry.js:58-75`
- [x] Local `unwrapItemWrap` copy **deleted** from `meta-state-list-tool.js:57-62`
- [x] 9 ad-hoc reader-patch sites reverted (count: 1 + 1 + 4 + 1 + 1 + 1 = 9)
- [x] Wire-format tests assert flat outputs (input payloads can still use `{item: [...]}` to verify the outer coercion)
- [x] All test counts match expected (862 baseline + 3 new + deny-list fix, 0 fail)
- [x] No commit references the plan's phase numbers in code or commit message body (only the `see plans/...` trailer)

## Risk Assessment

- **Risk: Coupled script+test commit (commit 1)** — if the script reverts but the test doesn't (or vice versa), the test runs the script which now reads `entry.proposed_design_for` directly; with the data already flat (Phase 4 migration), the test passes either way. **Mitigation:** the commit lands both files in one `git commit`; the test runs against the live registry which is flat post-migration.
- **Risk: `meta_state_list` `proposed_design_for` scan regresses on old wrap data** — if any live registry entry still has `proposed_design_for: {item: [...]}`, the new code reads `e.proposed_design_for` directly and `Array.isArray` returns false, the scan skips. **Mitigation:** Phase 4 Part 2 migration already flattened the 1 live wrap site; pre-state check at step 1 confirms `grep -c '"item"' meta-state.jsonl` is 0.
- **Risk: A reader downstream of `buildRegistrySummary` depends on the both-shapes tolerance** — the 9 ad-hoc patches all have the same root cause. **Mitigation:** the 862-test suite catches regressions; the 3-commit grouping gives a coarser bisect signal than 7 commits, but the suite covers it.
- **Risk: Phase 5 commits out of order** — if commit 2 (loop-introspect) lands before commit 1 (script+test), the read-side is strict before the script-side is reverted. **Mitigation:** commits land in numerical order; each commit's `pnpm test` runs before the next commit starts.

## TDD Discipline

This phase is REFACTOR. The 2 RED tests from Phase 2 (B2-0, Tests 1-2: wrapped input rejection) are GREEN (turned green in Phase 4 Part 1). Test 3 (regression guard) stays GREEN. They stay green throughout Phase 5. The wire-format test updates in commit 3 also stay green (the input payloads still use `{item: [...]}` to exercise the outer coercion; the output assertions are flat).

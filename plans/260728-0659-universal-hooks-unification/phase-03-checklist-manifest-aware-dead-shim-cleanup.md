---
phase: 3
title: "Checklist manifest-aware + dead shim cleanup"
status: pending
priority: P2
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Checklist manifest-aware + dead shim cleanup

## Overview
Make the existing `shims-in-sync` runtime-agnostic checklist item manifest-aware so it stops false-greening on dead shims, then delete the 4 dead `.mastracode` shims. This fixes the MCP audit surface (`check_runtime_agnostic`) — today it reports shim byte-identity as healthy while 4 of those shims are unreferenced. No new checklist item is added (Q7); the vitest parity test (Phase 2) covers wiring, and `shims-in-sync` covers shim byte-identity.

## Requirements
- Functional: `shims-in-sync` reads `hooks-lock.json` and asserts shim byte-identity only across surfaces where the manifest declares `kind:"shim"` for that hook. Surfaces declaring `kind:"direct"` (`.mastracode` for the 4 gate hooks) drop out of the shim-parity set for those hooks.
- Functional: the 4 `.mastracode/coordination/hooks/*.cjs` shims are deleted; `.mastracode/coordination/hooks/` is empty or removed.
- Non-functional: `legacy-mcp/runtime-agnostic.test.js` stays green (4 existing shim tests rewritten — red-team F1); the CHECKLIST item count stays 6 (no new item); `check_runtime_agnostic` MCP output for `shims-in-sync` reflects the manifest-aware scope. `.mastracode` runtime behavior (`.mastracode/hooks.json` wiring universal directly) is unchanged.

## Architecture
`core/runtime-agnostic-checklist.js` — the `shims-in-sync` item currently:
1. Builds per-surface shim maps via `buildShimMaps(root)` across `SHIM_DIRS = SURFACES.map(s => `${s}/coordination/hooks`)`.
2. For each shim name present on any surface, asserts it is present on ALL surfaces and byte-identical.

Change: after `buildShimMaps`, load `hooks-lock.json` and build a per-hook set of surfaces that should carry a shim (manifest `kind:"shim"`). Map shim filenames → hook keys (the shim→hook mapping is fixed: `bash-coordination-gate.cjs`→`bash-gate`, `write-coordination-gate.cjs`→`write-gate`, `inbound-state-gate.cjs`→`inbound-gate`, `recurrence-check-on-start.cjs`→`recurrence-check-on-start`). Only assert parity across the manifest-declared shim surfaces for that hook. If a shim file exists on a surface the manifest does not declare as `kind:"shim"`, that is no longer a failure (it is dead code, cleaned in step 2) — but optionally report it as a warning.

`SHIM_DIRS` stays derived from `SURFACES` (do not hard-code `.mastracode` out). The manifest is the filter, not the dir list.

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` (`shims-in-sync` verify fn; reuse `buildShimMaps`; add a `loadHooksManifest(root)` helper + `shimNameToHookKey` map)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` (update 4 existing tests — see Implementation Steps; this is the critical red-team F1 fix; the file lives under `legacy-mcp/`, NOT directly under `__tests__/` — red-team F4)
- Delete: `.mastracode/coordination/hooks/bash-coordination-gate.cjs`, `.mastracode/coordination/hooks/inbound-state-gate.cjs`, `.mastracode/coordination/hooks/recurrence-check-on-start.cjs`, `.mastracode/coordination/hooks/write-coordination-gate.cjs`
- Read: `hooks-lock.json` (Phase 1), `tools/learning-loop-mastra/core/surfaces.js` (SURFACES), `tools/learning-loop-mastra/core/change-log-bound-paths.js`

## Implementation Steps (TDD)
1. **Red — extend the checklist regression test AND rewrite 4 existing tests.** In `legacy-mcp/runtime-agnostic.test.js`:
   - Add: (a) `shims-in-sync` PASSES when `.mastracode` has NO shims but a manifest fixture declares `.mastracode` `kind:"direct"` for the gate hooks; (b) `shims-in-sync` FAILS when a `kind:"shim"` surface is missing its shim (manifest fixture present).
   - **Rewrite (red-team F1 — these exist today and assert the OLD invariant; they MUST land in the same step as the CHECKLIST change or `pnpm test` goes red on deletion):**
     - `:124` "all shim directories have the same set of .cjs shim names" — currently `deepStrictEqual`s name sets across all 3 `SHIM_DIRS` directly (does NOT call the CHECKLIST). Make it manifest-aware: assert name-set parity only across surfaces where the manifest declares `kind:"shim"` (drop `.mastracode`), OR delete it as redundant with the manifest-aware `shims-in-sync`. Use a manifest fixture.
     - `:154` "shims-in-sync fails when shim contents differ across surfaces" — uses `test-hook.cjs` + a temp dir with NO `hooks-lock.json`. Add a manifest fixture declaring `test-hook` `kind:"shim"` on all 3 surfaces so the divergence is still detected (see F2 no-manifest rule).
     - `:171` "shims-in-sync flags a missing .mastracode shim" — currently asserts `result.ok === false` for a missing `.mastracode` shim. INVERT: with a manifest fixture declaring `.mastracode` `kind:"direct"` (or `none`), a missing `.mastracode` shim must now PASS; rename/repurpose the test to assert a missing `.claude` (`kind:"shim"`) shim FAILS instead.
     - `:188` "shims-in-sync passes against the real repo (all 3 surfaces, byte-identical)" — rename to reflect the manifest-aware invariant ("…manifest-declared shim surfaces, byte-identical") and confirm it still passes via `item.verify("tools/learning-loop-mastra/hooks/universal", MCP_ROOT)`.
   Run → red (current `shims-in-sync` implementation still requires all surfaces to carry all shims; `.mastracode` currently has them).
2. **Green — make `shims-in-sync` manifest-aware.** Implement `loadHooksManifest(root)` + `shimNameToHookKey`; filter the parity set per hook by manifest `kind:"shim"` surfaces. **No-manifest / unknown-name semantics (red-team F2 — define explicitly):** `loadHooksManifest` returning null/missing → fall back to the LEGACY all-surfaces parity (so the existing fixture tests that don't supply a manifest keep their semantics); an unknown shim name (not in `shimNameToHookKey`) → still asserted across all surfaces that contain it (treat as a shim not declared in the manifest — parity-everywhere). This fail-open-to-legacy default keeps the `:154` content-diff fixture meaningful when given a manifest, and harmless when not. Re-run → case (a) now passes without `.mastracode` shims; case (b) passes; the 4 rewritten tests pass.
3. **Delete dead shims.** Remove the 4 `.mastracode/coordination/hooks/*.cjs` files. Remove the dir if empty. Confirm `shims-in-sync` (now manifest-aware) still passes — `.mastracode` is no longer required to carry shims. Confirm the `:124`/`:188` tests still pass (they no longer expect `.mastracode` shims).
4. **Verify the full suite.** `pnpm test` green (the F1 test rewrites are why); `check_runtime_agnostic` reports `shims-in-sync` ok. Phase 2 `hooks-wiring-parity.test.js` still green (it does not reference the deleted shims — `.mastracode` wiring is `kind:"direct"`).

## Success Criteria
- [ ] `shims-in-sync` is manifest-aware: asserts shim byte-identity only across `kind:"shim"` surfaces per hook; no-manifest falls back to legacy all-surfaces parity; unknown shim names asserted across all containing surfaces.
- [ ] The 4 existing `legacy-mcp/runtime-agnostic.test.js` shim tests (`:124`, `:154`, `:171`, `:188`) are rewritten (red-team F1) and pass.
- [ ] The 4 `.mastracode/coordination/hooks/*.cjs` shims are deleted; `.mastracode/hooks.json` unchanged; `.mastracode` behavior unchanged.
- [ ] `legacy-mcp/runtime-agnostic.test.js` green; CHECKLIST item count stays 6.
- [ ] `pnpm test` green; `hooks-wiring-parity.test.js` still green.

## Risk Assessment
**Medium.** Three coupled changes (mutate the `shims-in-sync` CHECKLIST item + rewrite 4 existing tests + delete 4 files) must land in order or `pnpm test` breaks: rewrite the tests (step 1) and implement manifest-awareness (step 2) BEFORE deleting shims (step 3), running the regression test between each. The `:124` test reads `SHIM_DIRS` directly (not via the CHECKLIST), so manifest-awareness alone does not fix it — it must be rewritten explicitly (red-team F1). Second risk: the `shimNameToHookKey` map could drift if a shim is renamed — document the mapping next to `buildShimMaps` and keep it authoritative. Third risk (red-team F9 — corrected rationale): the `protocol-adapter-i-o` checklist item is NOT affected by deletion because its `verify` walks only the single `featurePath` file passed to `check_runtime_agnostic` (`walkFiles(root, featurePath)` at `runtime-agnostic-checklist.js:248`; the MCP tool rejects directory `feature_path`), so surface shim dirs are never scanned by it regardless of shim content. The real regression neighbors are the 4 tests in step 1, not `protocol-adapter-i-o`.
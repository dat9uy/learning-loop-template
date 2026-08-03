---
phase: 2
title: "Split vitest into unit and e2e projects"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Split vitest into unit and e2e projects

## Overview

Define two vitest `projects` in `vitest.config.mjs`: `unit` (fast, no subprocess) and `e2e` (MCP-server-spawning + CLI-subprocess). The split is mechanical — e2e membership is derived from imports/calls (`with-mcp-server` / `connectMcpServer` / `spawnSync` of `loop.mjs` or `server.js`), not hand-tagged per file. `pnpm test` (no `--project` filter) still runs both — CI behavior is unchanged.

## Requirements

- Functional: `vitest run --project unit` runs only non-e2e tests; `vitest run --project e2e` runs only the ~25 e2e tests.
- Functional: `vitest run` (no filter) runs the union — byte-identical test set to today's flat `include`.
- Functional: a guard test asserts the e2e project's file set matches the grep-derived e2e set, so a new e2e file can't silently land in `unit`.
- Non-functional: no per-file annotation burden (no `describe.skipIf` flags) — the boundary is config + a guard test.
- Compatibility: `pnpm test`, `pnpm test:cold-session`, `pnpm check:freshness`, `pnpm test:debug` continue to work (they pass explicit paths or no filter).

## Architecture

vitest's `projects` (a.k.a. workspaces) array — each entry is a `{ name, test: { include, exclude, ... } }` config. The flat `include`/`exclude` move to the `unit` project; the `e2e` project's `include` is the grep-derived e2e glob set (or a single `e2e` directory if the files are co-located — they are NOT, they're spread across `__tests__/` and `legacy-mcp/`, so use an explicit path list or a generated glob).

Classification strategy (confirmed in validation): **A. Explicit e2e list** in config — maintain the ~25 paths. Simple, but drifts when a new e2e file is added (caught by the guard test, not silently). The guard test greps the same markers (`connectMcpServer` / `with-mcp-server` / `spawnSync` of `loop.mjs` or `server.js`) and asserts the e2e project's `include` set equals the grep result, so drift is loud. (Strategy B — a config-time grep script emitting the include dynamically — was rejected as KISS-preferred-A.)

Coverage: `unit` runs with `coverage.enabled: false` (pre-commit doesn't need coverage — fallow moves to pre-push). `e2e` + the unfiltered run keep coverage on (CI + pre-push need it for fallow). This reclaims the ~18s transform tax for pre-commit.

## Related Code Files

- Modify: `vitest.config.mjs` (add `projects`; move flat include into `unit`; add `e2e` project; coverage toggle per project)
- Create: `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js` (guard test: grep-derived e2e set == e2e project include set)
- Modify: `package.json` — add `test:unit` script (`vitest run --project unit`) and `test:e2e` script (`vitest run --project e2e`) for convenience + the pre-commit/pre-push wiring in Phase 3
- Read: `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (the e2e marker), Phase 1's measurement report
- Delete: none

## Implementation Steps

1. From Phase 1's grep output, freeze the e2e file list (repo-relative paths).
2. Refactor `vitest.config.mjs`: export `defineConfig` with a `projects` array — `unit` (the current flat `include` minus e2e files, `coverage.enabled:false`) and `e2e` (the explicit e2e path list, coverage on). Preserve `testTimeout`/`hookTimeout`/`reporters`/`globals` at the shared level or per-project as needed.
3. Add `test:unit` and `test:e2e` scripts to `package.json`.
4. Write the guard test `test-tier-e2e-membership.test.js`: grep the e2e markers, assert the set equals the `e2e` project's configured `include`. Fail loud on drift.
5. Run `vitest run --project unit` — confirm it excludes every e2e file and passes.
6. Run `vitest run --project e2e` — confirm it includes only e2e files and passes.
7. Run `vitest run` (no filter) — confirm the union equals today's full set (same pass count as the flat config) and CI parity tests still pass.
8. Confirm `pnpm test:cold-session`, `pnpm check:freshness`, `pnpm test:debug` still resolve (they pass explicit paths; verify they land in the right project or run unfiltered).

## Success Criteria

- [ ] `vitest run --project unit` passes and contains zero `connectMcpServer`/CLI-spawn tests.
- [ ] `vitest run --project e2e` passes and contains exactly the grep-derived e2e set.
- [ ] `vitest run` (no filter) passes with the same test count as the pre-split flat config.
- [ ] Guard test fails when a new e2e file is added without updating the e2e project list (verified by a temporary misclassification).
- [ ] `test:unit` / `test:e2e` scripts exist and work.
- [ ] No existing test or CI path regresses.

## Risk Assessment

- **Risk:** a test file mixes unit + e2e in one file (some `describe` blocks spawn a server, others don't) → file-level classification puts the whole file in `e2e`, slowing `unit` less but moving pure-unit describes into `e2e`. **Mitigation:** file-level is the KISS choice; accept it. If a mixed file is common, split the file instead of complicating classification.
- **Risk:** vitest `projects` + istanbul coverage interaction is subtle (coverage may only cover the project that ran). **Mitigation:** coverage stays on for `e2e` + unfiltered; `unit` is coverage-off. The fallow coverage input comes from the unfiltered `pnpm test` (pre-push/CI), not `unit`. Verify coverage-final.json is still produced by `pnpm test`.
- **Risk:** the guard test's grep markers miss a new e2e pattern (e.g. a new server-spawn helper). **Mitigation:** markers are derived from the actual spawn primitives (`connectMcpServer`, `with-mcp-server`, `spawnSync` of `loop.mjs`/`server.js`); review the marker list in Phase 1. A missed marker → an e2e file lands in `unit` → `unit` gets slower (visible in Phase 4 timings), not silently wrong.
- **Risk:** the `cli-context-savings-script` snapshot or other config-sensitive tests break when the config shape changes. **Mitigation:** run the full suite unfiltered in step 7; update snapshots only if the measured bytes genuinely change (they should not — the test set is unchanged).
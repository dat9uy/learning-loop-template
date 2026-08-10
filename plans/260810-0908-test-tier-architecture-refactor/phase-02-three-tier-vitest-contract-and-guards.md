---
phase: 2
title: "Three-tier Vitest contract and guards"
status: completed
priority: P1
effort: "1-2d"
dependencies: [1]
---

# Phase 2: Three-tier Vitest contract and guards

## Overview

Add the explicit integration project and mechanical guards before moving tests. The configuration must make the three-tier union complete and disjoint while preserving the existing e2e marker protection, unit fast path, full-suite coverage, and fixture exclusions.

## Requirements

- Add `unit`, `integration`, and `e2e` Vitest projects.
- Add `pnpm test:integration`; preserve `pnpm test` as the unfiltered full suite.
- Keep project-local `globals`, timeouts, hook timeouts, and scout-fixture exclusions because Vitest 4 does not reliably inherit them.
- Preserve root Istanbul coverage for the full run and the unit CLI coverage-off override.
- Add guards for disjointness, completeness, e2e markers, integration forbidden markers, and fixture exclusion.

## Design decisions (resolved from Phase 1 evidence)

### D1: e2e membership widens from the configured marker set to real process/transport call-sites

The current `E2E_FILES` (29 entries) uses a narrow marker grep that:
- **misses** real subprocess call-sites that don't use the specific marker variable names (`LOOP_BIN`/`cliPath`) — e.g. `spawnSync(process.execPath, [HOOK])`, `spawnSync("node", [SCRIPT])`, `execFileSync("node", [PROBE_PATH])`. These currently run in the fast `unit` project.
- **correctly excludes** inert string/comment usage (e.g. `gate-logic-*` tests feed command strings to the gate; `session-start-inject-degraded-sources` mentions `spawn` only in a comment).

The plan's Phase 2 mandate: "Integration guards must inspect executable/imported process or transport usage and include inert fixture/comment regression cases; raw grep alone is prohibited."

**Decision:** the e2e guard derives membership from **call-site detection** with three independent detectors:
1. **Transport markers** (any position): `StdioClientTransport`, `connectMcpServer`, `withMcpServer`, `@modelcontextprotocol/sdk/client`.
2. **Real subprocess call-sites with executable/variable first arg**: `spawnSync|execFileSync|execSync|spawn` where the first arg is `process.execPath` or a bare identifier (variable), detected after masking string literal contents.
3. **Real binary-name subprocess call-sites**: `spawnSync("node"|"bash"|"git"|"jq"|...)` where the call is a real statement (preceded by `const x =` / `return` / `await` / line start) — a guarded heuristic that accepts real calls while rejecting inert string data.

The configured `E2E_FILES` must equal this derived set exactly (strict equality, not subset). This catches the 20+ currently-misclassified process tests and promotes them to e2e.

### D2: Integration project is seeded from existing integration homes

Vitest 4 exits 1 with "No test files found" when a project matches nothing. The integration project must therefore include:
- `tools/learning-loop-mastra/__tests__/integration/**` (Phase 3 destination; empty at Phase 2 but the project must not be alone),
- the existing composition homes: `__tests__/core/`, `__tests__/interface/`, `__tests__/r2/`, `__tests__/freshness/`, `__tests__/phase-e-foundation/`, `__tests__/lib/`,
- the integration-tier top-level `__tests__/*.test.js` files.

### D3: unit project keeps the fast path

`unit` = everything under the mastra test tree NOT e2e and NOT integration + the pure colocated core/handler tests + `.claude`/`.factory`/`tools/scripts` tests that are not e2e.

### D4: Completeness guard uses the filesystem tree

The completeness guard walks the actual test tree, computes each file's tier with the same call-site detector, and asserts:
- no file appears in two projects,
- the union of project includes covers every discovered test file,
- stale configured e2e entries fail (strict equality).

## Implementation steps

1. Add the integration project with the seeded include list.
2. Repeat `globals`, `testTimeout`, `hookTimeout`, scout-fixture exclusions per project.
3. Add `test:integration` script with the seed-file-index preamble.
4. Rewrite `test-tier-e2e-membership.test.js` to use the call-site detector and strict equality.
5. Add `test-tier-completeness.test.js` (disjoint + union + no dropped file).
6. Add integration forbidden-marker assertions in the completeness guard.
7. Run the config + guards before any migration.

## Implementation record (completed 2026-08-10)

Delivered:

1. **`tools/learning-loop-mastra/__tests__/tier-detector.mjs`** — shared call-site classifier. Three detectors: transport markers, execPath/variable subprocess call-sites (string-masked), and real binary-name call-sites. Verified against known cases (inert `execSync` data in gate-logic tests → unit; comment-only `spawn` in degraded-sources → unit; real `spawnSync("node",…)`/`process.execPath` → e2e). Fixed a masker bug where `[^"\\]*` crossed newlines and swallowed whole files — now line-by-line masking.
2. **`vitest.config.mjs`** — three projects (`unit`, `integration`, `e2e`). E2E = explicit 73-file list (derived). Integration = `INTEGRATION_HOME_GLOBS` (existing composition homes `__tests__/{core,interface,r2,freshness,phase-e-foundation,lib}` + `__tests__/integration/**`) + `INTEGRATION_FILES` (141 explicit). Unit = `BASE_INCLUDE` minus e2e + integration + home globs (disjointness).
3. **`package.json`** — added `test:integration` with the seed-file-index preamble.
4. **`test-tier-e2e-membership.test.js`** — rewritten to strict equality via the shared detector; stale configured entries now FAIL (previously warn-only).
5. **`test-tier-completeness.test.js`** — new guard: disjoint + complete + integration-forbidden-marker + no-duplicate assertions.
6. **`r2/precommit-hook.test.js`** — asserts all three tier scripts exist.

Verified results:

| Project | Files | Tests | Exit |
|---|---|---|---|
| unit | 88 | 1276 | 0 |
| integration | 164 | 1507 | 0 |
| e2e | 73 | 590 | 0 |
| **union** | **325** | — | disjoint, no orphans |

- Disjointness proven: unit∩integration = 0, unit∩e2e = 0, integration∩e2e = 0.
- Union = 325 = baseline unit (296) + old configured e2e (29). Every discovered test file belongs to exactly one tier.
- Negative tests: injected an e2e file into INTEGRATION_FILES → completeness guard failed loudly with "belongs to MORE THAN ONE project".
- `pnpm test:integration` runs end-to-end (seed preamble + integration project + exit 0).
- 44 previously-misclassified process/transport tests (in the unit fast path) were correctly promoted to e2e. This is the plan's Phase 2 mandate (widen e2e detection to real call-sites), not a behavioral change.

## Success Criteria

- [x] `vitest run --project unit|integration|e2e` resolve successfully.
- [x] `pnpm test:integration` exists with the standard seed preamble.
- [x] Project sets disjoint; union = Phase 1 inventory (325 = 296 + 29).
- [x] Marker-derived MCP/CLI tests all in e2e; stale configured entries fail.
- [x] Integration contains no real process/transport usage; inert fixture/comment cases covered (negative-tested).
- [x] Scout fixtures excluded from every project.
- [x] Existing pre-commit/CI intent unchanged except the approved integration script.

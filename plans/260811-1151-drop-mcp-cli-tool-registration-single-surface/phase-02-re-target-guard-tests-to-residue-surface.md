---
phase: 2
title: "Guard-test re-target"
status: pending
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: Guard-test re-target

## Overview

Re-target the wire-budget guard to the residue surface (ceiling 6,000 all-tools),
re-anchor the guard tests that assert the old flag-based contract, delete
`cli-mcp-subset-registration.test.js` (salvaging its flag-independent tests), update
`vitest.config.mjs` tier membership, update `mcp-config.test.js`, co-rewrite
`cli-sessionstart-banner.test.js` with the Phase 1 hook change, and strengthen the existing
`cli-write-tool-set-drift.test.js` residue guard instead of duplicating it. Commit the
residue-measurement script as a reusable helper.

## Requirements

- Functional: wire-budget test measures the exact 8-tool live residue and asserts `<= 6_000`
  all-tools bytes. `cli-optout-wiring.test.js` asserts the residue-only contract (no flag).
  The session-start banner test asserts unconditional Claude behavior plus degraded config
  behavior. `mcp-config.test.js` drops the flag assertion (keeps `LOOP_SURFACE`). The drift
  test asserts both the 5-entry classified manifest residue and the exact 8-entry live MCP
  residue with server prefixes.
- Non-functional: no active test/script references either flag as an opt-out knob after this
  phase. Tier membership in `vitest.config.mjs` stays disjoint. The measurement script is
  committed (not `/tmp`) so the ceiling is re-checkable. MCP schema/transport coverage is
  retained in its existing bounded tests.

## Architecture

`with-mcp-server.js` spreads `process.env` and sets no flag — after Phase 1 a plain
`withMcpServer` call boots the 8-tool residue, so no helper env change is needed (but every
test that called a `CLI_TOOLS` member over MCP now breaks — those are Phase 3, not here;
this phase covers only the guard/contract tests).

**Ceiling:** switch `mcp-wire-budget.test.js` from manifest-only `<= 55_000` to all-tools
`<= 6_000` (measured 4,563; 1,437 B headroom; covers `ask_`/`run_` residue too). [Finding 10]
Commit `__tests__/helpers/measure-residue.mjs` (the script that produced the 4,563 figure)
so the ceiling anchor is reproducible.

**Drift guard:** `cli-write-tool-set-drift.test.js` already defines the five bare-name
`MCP_RESIDUE` classification entries (2 storage workflows, `update_r2_allowlist`,
`check_runtime_agnostic`, `workflow_generate_prompt`) and asserts
`CLI_TOOLS ∩ MCP_RESIDUE = ∅` + completeness. Strengthen it with two exact assertions:
(1) 44 handler-manifest entries partition into 42 `CLI_TOOLS` plus the two manifest-only
residue handlers; (2) a `withMcpServer` boot exposes the exact eight live names:
`mastra_check_runtime_agnostic`, `mastra_update_r2_allowlist`,
`mastra_workflow_generate_prompt`, `run_workflow_storage_read`,
`run_workflow_storage_round_trip`, and the three `ask_*` agent names. Keep bare
classification and prefixed live names as separate constants. [Red-team corrections 5, 10]

The drift test must not replace the existing MCP schema/transport tests: those continue to
cover `createLoopTool` conversion, registration, and representative protocol behavior.

## Related Code Files

- Modify: `__tests__/mcp-wire-budget.test.js`
- Modify: `__tests__/cli-optout-wiring.test.js`
- Modify: `__tests__/mcp-config.test.js`
- Modify: `__tests__/cli-sessionstart-banner.test.js`
- Modify: `__tests__/cli-write-tool-set-drift.test.js`
- Modify: `vitest.config.mjs`
- Delete: `__tests__/cli-mcp-subset-registration.test.js`
- Create: `__tests__/helpers/measure-residue.mjs`
- Modify: `__tests__/helpers/manifest-constants.cjs` (explicit 42/44/5/8/50 counts and expected sets)
- Modify: `__tests__/manifest-arithmetic.test.cjs` (computed CLI/manifest/agent crosswalk)

## Implementation Steps

1. Create `__tests__/helpers/measure-residue.mjs` (from the `/tmp` script): boots the server
   via `connectMcpServer` with no flag, prints `listTools` count + all-tools bytes. Used to
   anchor the ceiling.
2. `mcp-wire-budget.test.js`: change `bytes <= 55_000` to `bytes <= 6_000` measured on
   `JSON.stringify(tools)` (all tools, not just manifest-only — drop the `isManifestTool`
   filter or keep it but assert all-tools). Rewrite the comment to anchor: production
   residue, measured 4,563, ceiling 6,000 with ~1.4 KB headroom; further residue growth pays
   down debt rather than raising this silently.
3. `cli-optout-wiring.test.js`: drop the `LOOP_RECORDS_VIA_CLI === "1"` assertions from all
   three runtimes; keep `LOOP_SURFACE === ".claude"` for `.mcp.json`. Add a residue-contract
   test: boot `withMcpServer`, assert `listTools` names equal the 8 residue names exactly.
   Move the two flag-independent tests salvaged from `cli-mcp-subset-registration.test.js`
   here: "CLI read allowlist is the exact expected read contract" (`EXPECTED_READ_TOOLS`
   deep-equal — carry the constant with it) and "CLI list surfaces the full CLI_TOOLS set"
   (`loop.mjs list` equals `CLI_TOOLS`). [Findings 1-salvage, 5]
4. `mcp-config.test.js`: drop `LOOP_RECORDS_VIA_CLI` from `EXPECTED_ENV` for all three
   configs; keep `LOOP_SURFACE`. [Finding 4]
5. `cli-sessionstart-banner.test.js`: co-rewrite with the Phase 1 hook change — assert the
   banner fires unconditionally (no flag), and that the write-tool sketches + `--args-file`
   form + `LOOP_SURFACE` value render. Remove the `readsViaCli`/`recordsViaCli` param-driven
   assertions at lines 40, 48, 65, 68, 162, 175, 219. [Findings 3, 6]
6. `cli-write-tool-set-drift.test.js`: add a `withMcpServer` boot asserting `listTools`
   manifest residue equals the `MCP_RESIDUE` manifest members. Document the 5-vs-8 model (5
   manifest+workflow residue; +3 `ask_*` agents outside the manifest loop = 8 live). [Finding 9]
7. `vitest.config.mjs`: remove `cli-mcp-subset-registration.test.js` from `E2E_FILES` (line
   43). If `cli-optout-wiring.test.js` now boots `withMcpServer`/`spawnSync`, add it to
   `E2E_FILES` (it currently falls through to the unit project). Verify the tier-membership
   guard (`test-tier-e2e-membership.test.js`) still passes. [Finding 5]
8. Delete `__tests__/cli-mcp-subset-registration.test.js` (its two flag-dependent tests —
   `LOOP_READS_VIA_CLI=1 excludes only 12 reads`, `LOOP_RECORDS_VIA_CLI=1 ...` — are gone;
   the flag-independent two were salvaged in step 3).
9. Add the computed arithmetic guard: 44 handler-manifest entries = 42 CLI + 2 manifest-only; live MCP = 2 manifest-only + 1 allowlist + 2 storage workflows + 3 agents = 8; keep the 50 agent-manifest declaration separate.
10. Run `pnpm vitest run` on the touched guard files, manifest arithmetic, and tier-membership test; confirm green.

## Success Criteria

- [x] `mcp-wire-budget.test.js` asserts `<= 6_000` all-tools on the residue; comment anchors it.
- [x] `cli-optout-wiring.test.js` asserts the 8-tool residue + the two salvaged CLI-contract tests; no flag assertions.
- [x] `mcp-config.test.js` drops the flag from `EXPECTED_ENV`; keeps `LOOP_SURFACE`.
- [x] `cli-sessionstart-banner.test.js` asserts the unconditional banner + sketch rendering; no flag-param assertions.
- [x] `cli-write-tool-set-drift.test.js` boots `withMcpServer` and asserts the manifest residue; 5-vs-8 model documented.
- [x] `vitest.config.mjs` `E2E_FILES` no longer lists the deleted file; `cli-optout-wiring` tier-correct.
- [x] `__tests__/helpers/measure-residue.mjs` committed.
- [x] `cli-mcp-subset-registration.test.js` deleted.
- [x] `grep -rn "LOOP_RECORDS_VIA_CLI\|LOOP_READS_VIA_CLI" tools/learning-loop-mastra/__tests__` returns no opt-out assertions.

## Risk Assessment

- **Tier-membership guard failure:** adding an MCP-boot to `cli-optout-wiring.test.js`
  without moving it to `E2E_FILES` trips `test-tier-e2e-membership.test.js`. Signal: that
  test fails. Pre-decided response: add the file to `E2E_FILES` in the same step (step 7).
- **Salvaged-test import breakage:** moving `EXPECTED_READ_TOOLS` + `loop.mjs list` tests
  between files can break relative imports. Signal: vitest import error. Response: keep them
  in `cli-optout-wiring.test.js` (same `__tests__` dir, same relative paths); carry the
  `EXPECTED_READ_TOOLS` constant and `CLI_TOOLS` import into that file.
- **Drift-guard 5-vs-8 confusion:** the live surface is 8 but `MCP_RESIDUE` has 5 (agents
  register outside the manifest loop). Signal: a future maintainer adds an `ask_*` agent and
  doesn't know which guard to update. Response: document the model inline in the drift test;
  the 3 agents are covered by the agents-manifest, not the tool-manifest drift guard.
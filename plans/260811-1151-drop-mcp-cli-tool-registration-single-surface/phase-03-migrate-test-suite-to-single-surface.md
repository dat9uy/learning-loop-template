---
phase: 3
title: "Migrate test suite to single surface"
status: pending
priority: P1
effort: "1d"
dependencies: [1]
---

# Phase 3: Migrate test suite to single surface

## Overview

Migrate the ~12 e2e/integration tests that boot the full MCP surface via `withMcpServer`
(no flag) and call/assert `CLI_TOOLS` members over MCP. After Phase 1 those tools are
unregistered, so each test must be re-routed: assert against the CLI (`loop.mjs`), re-base
the oracle on a direct handler import, or delete if redundant. Re-base the
`cli-read-parity` / `cli-write-parity` parity oracle from MCP (flag=0) to direct-handler
imports. Re-anchor the cold-session discoverability contract (`agent-manifest.json` +
`manifest-constants.cjs` + `cold-session-enumerate-mastra.test.cjs`) from MCP `listTools` to
the CLI surface.

This is the largest phase — do it file-by-file with an explicit per-file decision, not a
bulk "rewrite the hits".

## Requirements

- Functional: every test that currently calls `callTool("mastra_<CLI_TOOL>", …)` or asserts
  a CLI tool is in `listTools` either (a) calls the CLI (`loop.mjs`) instead, (b) imports the
  handler module directly as the oracle, or (c) is deleted as redundant. The parity tests
  compare CLI stdout against direct-handler return values (no MCP oracle). The cold-session
  test asserts `loop.mjs list` / `loop_describe` output, not MCP `listTools`.
- Non-functional: behavior-equivalent coverage — the invariants these tests encode
  (manifest-declared tools are registered; per-tool schema parity; CLI-vs-oracle behavioral
  equality; cold-session discovery) survive in the new surface. No silent coverage drop.

## Architecture

The affected tests fall into three groups:

**Group A — full-surface count/registration assertions** (assert MCP registers N tools /
every manifest tool): `cold-session-enumerate-mastra.test.cjs` (asserts 50),
`workflow-parity.test.cjs` (asserts 45/50), `mcp-protocol-e2e.test.cjs` (asserts ≥44),
`mcp-tools-list-parity.test.js` (asserts specific CLI tools present in `listTools`).
Re-anchor: the manifest now describes the CLI surface, so these assertions move to
`loop.mjs list` / `loop_describe` output. `agent-manifest.json` + `manifest-constants.cjs`
(`AGENT_MANIFEST_TOTAL_TOOLS=50`) stay at 50 but now describe the CLI surface; the tests
compare CLI output to that constant. [Findings 1, 12]

**Group B — callTool on CLI_TOOLS members over MCP**: `meta-state-patch-jit-payload.test.js`
(asserts `mastra_meta_state_patch` in listTools), `e2e/meta-state-patch-derived-schema`,
`e2e/meta-state-list-id-stdio`, `e2e/meta-state-patch-entry-kind-invariant`,
`e2e/change-log-operation-envelope`, `e2e/loop-get-instruction`, `e2e/zod-coerce-top-level`,
`mcp-protocol-e2e` (callTool `mastra_loop_describe` / `mastra_meta_state_list`). Re-route:
call the CLI (`spawnSync node loop.mjs <tool> <args>`) instead of `mcp.callTool`, OR import
the handler module directly when the test cares about behavior not transport. [Finding 1]

**Group C — parity oracle**: `cli-read-parity.test.js` + `cli-write-parity.test.js` use
`LOOP_READS_VIA_CLI:"0"` / `LOOP_RECORDS_VIA_CLI:"0"` to boot full MCP as the oracle for
~40 tools. Re-base: the oracle is now a direct handler import (`runDirectSeq` already exists
in `cli-write-parity`). Wire direct-handler oracles first, then delete the MCP leg
(`runMcpSeq`) in the same commit so there is no parity-coverage window. [Finding 2,
user decision: CLI vs direct-handler]

## Related Code Files

- Modify: `__tests__/cold-session-enumerate-mastra.test.cjs`
- Modify: `__tests__/workflow-parity.test.cjs`
- Modify: `__tests__/mcp-protocol-e2e.test.cjs`
- Modify: `__tests__/mcp-tools-list-parity.test.js`
- Modify: `__tests__/meta-state-patch-jit-payload.test.js`
- Modify: `__tests__/cli-read-parity.test.js`, `__tests__/cli-write-parity.test.js`
- Modify: `__tests__/e2e/meta-state-patch-derived-schema.test.js`,
  `__tests__/e2e/meta-state-list-id-stdio.test.js`,
  `__tests__/e2e/meta-state-patch-entry-kind-invariant.test.js`,
  `__tests__/e2e/change-log-operation-envelope.test.js`,
  `__tests__/e2e/loop-get-instruction.test.js`,
  `__tests__/e2e/zod-coerce-top-level.test.js`
- Modify: `__tests__/helpers/manifest-constants.cjs` (comment: 50 now describes CLI surface)
- Read-only check: `agent-manifest.json` (confirm it declares the full surface; no trim)

## Implementation Steps

1. Enumerate every test calling `listTools`/`callTool` on a non-residue tool (grep
   `mcp.callTool\|listTools` across `__tests__/`). Build the per-file decision list
   (route-to-CLI / direct-handler / delete) before editing.
2. **Group C first (parity oracle):** in `cli-write-parity.test.js` wire the direct-handler
   oracle (`runDirectSeq`) as the primary comparison for all `TOOL_CASES`; delete `runMcpSeq`
   and the `LOOP_RECORDS_VIA_CLI:"0"` env. Same for `cli-read-parity.test.js` (`runMcpSeq` →
   direct-handler; drop `LOOP_READS_VIA_CLI:"0"`). Same commit — no parity window.
3. **Group A (count/registration):** re-anchor `cold-session-enumerate-mastra.test.cjs` to
   assert `loop.mjs list` output equals the manifest-declared CLI surface
   (`AGENT_MANIFEST_TOTAL_TOOLS=50`); drop the MCP `listTools`-length assertion. Same for
   `workflow-parity.test.cjs` and `mcp-tools-list-parity.test.js` (assert CLI tools in
   `loop.mjs list`, not MCP `listTools`). `mcp-protocol-e2e.test.cjs`: drop the ≥44 MCP count
   assertion; keep protocol-shape checks that apply to the residue.
4. **Group B (callTool):** for each `e2e/*` test and `meta-state-patch-jit-payload`, replace
   `mcp.callTool("mastra_<tool>", args)` with a CLI invocation
   (`spawnSync("node", [LOOP_BIN, "<tool>", JSON.stringify(args)])`) OR a direct handler
   import, whichever the test's intent demands. Preserve the behavioral assertion.
5. `manifest-constants.cjs`: update the header comment so `AGENT_MANIFEST_TOTAL_TOOLS=50`
   is documented as the CLI-surface count, not the MCP-surface count. Do NOT change the
   value (the surface is still 50 tools — now via CLI).
6. Run the full `__tests__` suite; expect green. Any remaining `callTool` on a non-residue
   tool is a missed migration — route it.

## Success Criteria

- [ ] `grep -rn "mcp.callTool.*mastra_" __tests__/` only hits residue tool names
      (`workflow_generate_prompt`, `check_runtime_agnostic`) or is gone.
- [ ] No test asserts a `CLI_TOOLS` member is in MCP `listTools`.
- [ ] `cli-read-parity` + `cli-write-parity` compare CLI stdout vs direct-handler imports; no MCP oracle, no flag=0 env.
- [ ] `cold-session-enumerate-mastra.test.cjs` asserts `loop.mjs list` / `loop_describe`, not MCP `listTools`.
- [ ] `AGENT_MANIFEST_TOTAL_TOOLS=50` documented as the CLI-surface count.
- [ ] `pnpm vitest run __tests__` green (full suite, post-Phase 1+2).

## Risk Assessment

- **Coverage silently drops:** re-routing a test to the CLI could lose the MCP-protocol-shape
  assertion (e.g. JSON envelope, exit codes) that was the test's real purpose. Signal: a
  behavior the MCP path checked is no longer asserted anywhere. Pre-decided response: for
  protocol-shape concerns, keep a residue-only MCP test (`mastra_check_runtime_agnostic`)
  that exercises the envelope; for CLI-behavior concerns, the CLI invocation carries the
  assertion. Tag any deliberate coverage drop in the commit body.
- **Cold-session constant drift:** `AGENT_MANIFEST_TOTAL_TOOLS=50` must match
   `loop.mjs list` count after migration. Signal: the re-anchored
   `cold-session-enumerate-mastra.test.cjs` count assertion fails. Response: reconcile — if
   `loop.mjs list` prints 42 (CLI_TOOLS) not 50, the constant describes the full manifest
   surface (42 CLI + 8 residue) and the test must compare against the right subset; do not
   silently change the constant.
- **Parity window:** deleting `runMcpSeq` before `runDirectSeq` is wired leaves no oracle.
  Signal: a commit where `runDirectSeq` is absent but `runMcpSeq` is deleted. Response: wire
  direct-handler first in the same commit (step 2 ordering is binding).
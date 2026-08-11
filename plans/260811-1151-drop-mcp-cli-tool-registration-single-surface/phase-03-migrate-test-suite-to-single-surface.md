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
imports. Re-anchor discoverability without conflating surfaces: CLI `loop.mjs list` covers the
42-tool `CLI_TOOLS` allowlist; `loop_describe`/handler introspection covers 44 manifest
handlers; `agent-manifest.json` remains the 50-entry full declaration; live MCP `listTools`
remains the exact 8-tool residue.

This is the largest phase — do it file-by-file with an explicit per-file decision, not a
bulk "rewrite the hits".

## Requirements

- Functional: every test that currently calls `callTool("mastra_<CLI_TOOL>", …)` or asserts
  a CLI tool is in `listTools` either (a) calls the CLI (`loop.mjs`) instead, (b) imports the
  handler module directly as the state oracle, or (c) is deleted as redundant. Both parity
  suites use the same normalized direct-handler contract (schema normalization + R2 gate)
  and compare against CLI stdout. The existing bounded MCP schema/transport tests remain;
  they are not replaced by direct imports. Cold-session tests assert separate 42/44/50/8
  contracts.
- Non-functional: behavior-equivalent coverage — CLI state parity, MCP registration/schema
  conversion, protocol envelope, manifest declaration, and cold-session discovery all survive.
  No silent coverage drop.

**Direct oracle contract:** define one shared helper or identical local helper with
`runDirectSeq(steps, tmpRoot)`. It must parse each handler through `normalizeInputSchema`,
apply the same `withR2Gate` wrapper as `createLoopTool`, execute against the supplied
`GATE_ROOT`, and normalize the result exactly once. The read suite must not use a raw
`adaptLegacyHandler` shortcut.

## Architecture

The affected tests fall into three groups:

**Group A — count/registration assertions:** keep separate contracts. `cold-session-enumerate-mastra.test.cjs`
and `integration/cold-session-discoverability.test.cjs` continue to validate the 50-entry
`agent-manifest.json` declaration against its own declared names; they must not claim the CLI
emits 50. Add/retain a CLI test asserting `loop.mjs list` emits exactly the 42 `CLI_TOOLS`.
`loop_describe`/manifest arithmetic asserts 44 handler entries. `workflow-parity.test.cjs`
asserts the workflow/agent crosswalk, while `mcp-protocol-e2e.test.cjs` retains protocol
checks for the 8-tool residue. `mcp-tools-list-parity.test.js` retains MCP schema conversion
checks, including `meta_state_patch` parity hints. [Red-team corrections 1, 3, 4, 22]

The 42/44/50 values are distinct: CLI allowlist, handler manifest, and full agent declaration.
The live MCP residue is separately asserted as 8 exact names.

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
- Modify: `__tests__/integration/cold-session-discoverability.test.cjs`
- Modify: `__tests__/manifest-arithmetic.test.cjs`
- Modify: `__tests__/workflow-parity.test.cjs`
- Modify: `__tests__/mcp-protocol-e2e.test.cjs`, `__tests__/e2e/mcp-protocol-e2e.test.cjs`
- Modify: `__tests__/mcp-tools-list-parity.test.js`
- Modify: `__tests__/meta-state-patch-jit-payload.test.js`
- Modify: `__tests__/cli-read-parity.test.js`, `__tests__/cli-write-parity.test.js`
- Modify: `__tests__/e2e/meta-state-patch-derived-schema.test.js`,
  `__tests__/e2e/meta-state-list-id-stdio.test.js`,
  `__tests__/e2e/meta-state-patch-entry-kind-invariant.test.js`,
  `__tests__/e2e/change-log-operation-envelope.test.js`,
  `__tests__/e2e/loop-get-instruction.test.js`,
  `__tests__/e2e/zod-coerce-top-level.test.js`,
  `__tests__/agent-parity.test.cjs`
- Modify: `__tests__/helpers/manifest-constants.cjs` (separate 42/44/5/8/50 constants)
- Read-only check: `agent-manifest.json` (retain full declaration; do not relabel as CLI)
- Preserve bounded MCP schema/transport coverage in `mcp-tools-list-parity.test.js`,
  residue protocol tests, and representative malformed-input tests.

## Implementation Steps

1. Enumerate every test calling `listTools`, `mcp.callTool`, `client.callTool`, or the
   shared `handles.callTool` helper across all `__tests__/**/*.js` and `__tests__/**/*.cjs`.
   Include both protocol-test paths, `agent-parity.test.cjs`, and all e2e callers. Build the
   per-file decision list (route-to-CLI / direct-handler / retain MCP transport / delete)
   before editing.
2. **Group C first (parity oracle):** make both suites use the explicit
   `runDirectSeq(steps, tmpRoot)` contract: normalize each schema, apply `withR2Gate`, and
   execute against an isolated root. Drop the MCP state oracle and flag=0 env only after the
   direct oracle passes. Retain the bounded MCP schema/transport tests; this is not a deletion
   of all MCP coverage. Add a shared CLI spawn helper that always passes
   `{ ...process.env, LOOP_SURFACE: ".claude", GATE_ROOT: tmpRoot, MASTRA_STORAGE_DRIVER: "memory" }`.
3. **Group A (count/registration):** assert `loop.mjs list` equals the 42-tool `CLI_TOOLS`
   set; keep `loop_describe`/manifest assertions at 44; keep the 50-entry agent-manifest
   declaration tests as a separate contract; assert the live MCP residue as exactly 8 names.
   `mcp-tools-list-parity.test.js` retains the `meta_state_patch` `minProperties` schema check.
   `mcp-protocol-e2e` files retain protocol-shape checks for residue tools, and remove only
   non-residue registration/count assertions.
4. **Group B (callTool):** for each e2e caller, including both protocol-test paths and
   `agent-parity.test.cjs`, replace non-residue calls with the shared CLI spawn helper or a
   direct normalized handler, based on intent. Preserve per-test temp roots and behavioral
   assertions; retain residue transport calls.
5. `manifest-constants.cjs` and `manifest-arithmetic.test.cjs`: keep separate constants and
   computed assertions for 42 CLI, 44 handler manifest, 5 classified residue, 8 live MCP,
   and 50 agent declarations. Do not relabel `agent-manifest.json`.
6. Run focused migration/crosswalk/schema tests, then the full `__tests__` suite. Any
   remaining `*.callTool`/`*.listTools` on a non-residue tool is a missed migration.

## Success Criteria

- [ ] `grep -rn "mcp.callTool.*mastra_" __tests__/` only hits residue tool names
      (`workflow_generate_prompt`, `check_runtime_agnostic`) or is gone.
- [ ] No test asserts a `CLI_TOOLS` member is in MCP `listTools`.
- [ ] `cli-read-parity` + `cli-write-parity` compare CLI stdout vs normalized direct-handler imports with isolated roots; no flag=0 env.
- [ ] Bounded MCP schema/transport tests remain green, including the `meta_state_patch` schema-hint assertion.
- [ ] CLI list asserts 42; handler introspection asserts 44; agent-manifest tests assert 50; live MCP list asserts exactly 8.
- [ ] `integration/cold-session-discoverability` and `manifest-arithmetic` are updated alongside `cold-session-enumerate-mastra`.
- [ ] All CLI subprocess migrations pass `LOOP_SURFACE`, isolated `GATE_ROOT`, and `MASTRA_STORAGE_DRIVER`.
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
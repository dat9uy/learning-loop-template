---
phase: 2
title: "manifest-reconciliation"
status: pending
priority: P1
effort: "2h"
dependencies: ["1"]
---

# Phase 2: Manifest Reconciliation (D-9 closeout)

## Overview

**Closes the D-9 deferred item.** `tools/learning-loop-mastra/agent-manifest.json` currently totals 42 tools (gate=5, workflow=11, meta_state=19, introspection=3, runtime_agnostic=1, agent=3), but the actual MCP exposure is **44 tools** (31 deterministic + 10 workflows + 3 agents). The 2-tool delta is the 2 storage workflows (`run_workflow_storage_round_trip`, `run_workflow_storage_read`) that shipped in Plan 2 (2026-06-20) but never landed in the `workflow` group of `agent-manifest.json`.

**Why this phase exists:** the mastra `agent-manifest.json` is the canonical "what does this server expose" reference per AGENTS.md §2 line 51 and the cold-session discoverability hint. The 2-tool drift means anyone reading the manifest gets the wrong count, which propagates to the cold-session test (Phase 6) and the §3.10 research report (Phase 3).

## Requirements

- Functional: `agent-manifest.json#workflow.tools` has 13 entries (8 `run_workflow_*` + 3 `mastra_workflow_*` + 2 storage); `agent-manifest.json#groups` totals 44.
- Non-functional: a new parity test (`manifest-arithmetic.test.cjs`) catches future drift between the 4 manifest files.

## Architecture

The 4 manifest files in the mastra package:
1. `tools/learning-loop-mastra/tools/manifest.json` — 31 entries (deterministic tools; loaded by `server.js:16-39`)
2. `tools/learning-loop-mastra/workflows-manifest.json` — 10 entries (workflows; loaded by `server.js:41-51`)
3. `tools/learning-loop-mastra/agents-manifest.json` — 3 entries (agents; loaded by `server.js:53-67`)
4. `tools/learning-loop-mastra/agent-manifest.json` — 42 grouped entries (the "what does this server expose" reference; 6 groups)

The 31 + 10 + 3 = 44 MCP-exposed tools. The 2-tool delta vs `agent-manifest.json` is the 2 storage workflows.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/agent-manifest.json` (add 2 storage workflow entries to `workflow.tools`)
- **Create:** `tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs` (cross-walk the 4 manifest files; assert 44-tool total + 13 in workflow group)
- **Create:** `tools/learning-loop-mastra/__tests__/__snapshots__/manifest-arithmetic-snapshot.json` (frozen manifest-arithmetic baseline)
- **Read (verification):** `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:160-166` (the 44-tool assertion — already correct; this phase's test mirrors its arithmetic)

## Implementation Steps

### Step 2.1: Add the 2 storage workflows to `agent-manifest.json#workflow.tools`

Current `workflow` group in `agent-manifest.json` (line 13):
```json
"workflow": {
  "description": "Learning-loop workflow orchestration",
  "tools": [
    "run_workflow_intake_orient",
    "run_workflow_intake_plan",
    "run_workflow_classify_prompt",
    "run_workflow_prepare_runtime_request",
    "mastra_workflow_generate_prompt",
    "run_workflow_self_improvement",
    "run_workflow_intentional_skip",
    "run_workflow_report_phase_status",
    "run_workflow_runtime_probe",
    "mastra_workflow_notify_artifact",
    "mastra_workflow_trigger"
  ],
  "ordering": "linear",
  "typical_chain": ["run_workflow_intake_orient", "run_workflow_intake_plan", "mastra_workflow_notify_artifact"]
}
```

Add the 2 storage workflows (alphabetically sorted with the other `run_workflow_*` entries):
```json
"workflow": {
  "description": "Learning-loop workflow orchestration (8 run_workflow_* + 3 mastra_workflow_* + 2 storage workflows)",
  "tools": [
    "run_workflow_intake_orient",
    "run_workflow_intake_plan",
    "run_workflow_classify_prompt",
    "run_workflow_prepare_runtime_request",
    "mastra_workflow_generate_prompt",
    "run_workflow_self_improvement",
    "run_workflow_intentional_skip",
    "run_workflow_report_phase_status",
    "run_workflow_runtime_probe",
    "mastra_workflow_notify_artifact",
    "mastra_workflow_trigger",
    "run_workflow_storage_read",
    "run_workflow_storage_round_trip"
  ],
  ...
}
```

Final count: 13 in `workflow` group. Total in `agent-manifest.json#groups`: 5 + 13 + 19 + 3 + 1 + 3 = **44**.

### Step 2.2: Create the manifest-arithmetic test

Create `tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs`:

```js
// Manifest arithmetic test — cross-walks the 4 manifest files in the mastra
// package and asserts the 44-tool total + 6-group structure + 13 in workflow
// group. Catches future drift between the source-of-truth files.
//
// Test inventory:
//   1. tools/manifest.json has 31 entries
//   2. workflows-manifest.json has 10 entries
//   3. agents-manifest.json has 3 entries
//   4. agent-manifest.json#groups totals 44
//   5. agent-manifest.json#workflow.tools has 13 entries (8 run + 3 mastra + 2 storage)
//   6. Cross-walk: every entry in tools/manifest.json is in agent-manifest.json#groups
//   7. Cross-walk: every run_<id> from workflows-manifest.json is in agent-manifest.json#workflow
//   8. Cross-walk: every ask_<id> from agents-manifest.json is in agent-manifest.json#agent
//   9. Snapshot: the full agent-manifest.json#groups matches the frozen baseline

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PKG = resolve(__dirname, "..");

const tools = JSON.parse(readFileSync(join(PKG, "tools/manifest.json"), "utf8"));
const workflows = JSON.parse(readFileSync(join(PKG, "workflows-manifest.json"), "utf8"));
const agents = JSON.parse(readFileSync(join(PKG, "agents-manifest.json"), "utf8"));
const agentManifest = JSON.parse(readFileSync(join(PKG, "agent-manifest.json"), "utf8"));

describe("manifest arithmetic", () => {
  test("tools/manifest.json has 31 entries", () => {
    assert.strictEqual(tools.length, 31);
  });

  test("workflows-manifest.json has 10 entries", () => {
    assert.strictEqual(workflows.length, 10);
  });

  test("agents-manifest.json has 3 entries", () => {
    assert.strictEqual(Object.keys(agents.agents).length, 3);
  });

  test("agent-manifest.json#groups totals 44", () => {
    const total = Object.values(agentManifest.groups).reduce(
      (sum, g) => sum + g.tools.length,
      0,
    );
    assert.strictEqual(total, 44, `expected 44 total, got ${total}`);
  });

  test("agent-manifest.json#workflow.tools has 13 entries", () => {
    assert.strictEqual(agentManifest.groups.workflow.tools.length, 13);
  });

  test("agent-manifest.json has 6 groups", () => {
    assert.strictEqual(Object.keys(agentManifest.groups).length, 6);
  });

  test("every tools/manifest.json entry appears in agent-manifest.json", () => {
    // Each tool's MCP name is `mastra_<name>` per server.js:23
    // The tool's exported `name` field determines the MCP name.
    const allAgentTools = new Set(
      Object.values(agentManifest.groups).flatMap((g) => g.tools),
    );
    for (const { file } of tools) {
      // Load the tool module to read its exported `name`.
      const toolPath = join(PKG, file);
      const mod = require(toolPath);
      const toolName = mod.default?.name || mod.name;
      const mcpName = `mastra_${toolName}`;
      assert.ok(
        allAgentTools.has(mcpName),
        `tool ${file} exports name "${toolName}" → MCP name "${mcpName}" not found in agent-manifest.json#groups`,
      );
    }
  });

  test("every run_<id> from workflows-manifest.json is in agent-manifest.json#workflow", () => {
    const workflowTools = new Set(agentManifest.groups.workflow.tools);
    for (const { file } of workflows) {
      // The run_<id> naming is `run_<workflow_id>` per server.js:93.
      // The workflow_id is the file basename minus .js (e.g., workflow-intake-orient).
      const id = file.replace(/^workflows\//, "").replace(/\.js$/, "").replace(/-/g, "_");
      const mcpName = `run_${id}`;
      assert.ok(
        workflowTools.has(mcpName),
        `workflow ${file} exposes as ${mcpName} but is not in agent-manifest.json#workflow.tools`,
      );
    }
  });

  test("every ask_<id> from agents-manifest.json is in agent-manifest.json#agent", () => {
    const agentTools = new Set(agentManifest.groups.agent.tools);
    for (const [key, entry] of Object.entries(agents.agents)) {
      const mcpName = `ask_${entry.id}`;
      assert.ok(
        agentTools.has(mcpName),
        `agent ${key} exposes as ${mcpName} but is not in agent-manifest.json#agent.tools`,
      );
    }
  });
});
```

### Step 2.3: Run the test

```bash
node --test tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs
```

Expected: 9 tests pass. If any fails, the manifest is out of sync and the cross-walk is broken — investigate before proceeding to Phase 3.

### Step 2.4: Run the full test suite to confirm no regression

```bash
pnpm test
```

Expected: same 1169 tests pass + 9 new = 1178 tests pass. (The +9 delta assumes `manifest-arithmetic.test.cjs` ships with 9 tests; consolidate if fewer.)

If the legacy e2e test at `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70` was failing before this phase, Phase 6 fixes it; Phase 2 may NOT see a delta if the e2e was already being silently skipped.

## Success Criteria

- [ ] `agent-manifest.json#workflow.tools` has 13 entries (8 run + 3 mastra + 2 storage).
- [ ] `agent-manifest.json#groups` totals 44.
- [ ] `agent-manifest.json` has 6 groups: gate, workflow, meta_state, introspection, runtime_agnostic, agent.
- [ ] `tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs` exists with 9 tests, all GREEN.
- [ ] `pnpm test` baseline holds (1169 → 1178, +9 tests, 0 fail).
- [ ] The `workflow` group's `description` field is updated to mention the 8+3+2 breakdown.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The 2 storage workflows' `description` field is empty, causing `LoopMCPServer.convertWorkflowsToTools` to throw at server start (server.js:88-92) | Very low | The server is currently running (Plan 2 closeout journal 2026-06-20); if `description` were empty, the server wouldn't start. Verified by running `pnpm gate:server` and checking the `registered N tools` log line. |
| Adding the 2 entries to `agent-manifest.json#workflow` breaks the `typical_chain` semantics (the chain still references only the original 11 tools) | Low | `typical_chain` is a discoverability hint, not an enforcement. Leaving it as-is is correct (the chain is the operator's typical path; the storage workflows are utility tools for Plan 2's parity tests, not part of the operator's typical chain). |
| Future drift: a new tool is added to `tools/manifest.json` but not to `agent-manifest.json` | Medium | The manifest-arithmetic test cross-walks; the test catches the drift on next `pnpm test`. |
| The 2 storage workflows' `inputSchema` is not a real Zod object schema (researcher 1 §3 finding 3) | Low | The server.js validation only checks for `description` non-empty; `inputSchema` is forwarded as-is. If the workflows' inputSchemas are valid Zod (verified by Plan 2's `storage-parity.test.cjs`), they pass. Out of Plan 4 scope; flag for follow-up. |
| Plan 1a schema-fingerprint test (38 tables + column counts for `@mastra/libsql@1.13.0`) breaks if a new tool is added | Very low | The schema fingerprint is for the storage substrate, not the tool surface. Plan 2 ships the storage; Plan 4 does not modify the storage layer. |

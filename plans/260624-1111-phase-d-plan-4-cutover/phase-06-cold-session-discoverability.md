---
phase: 6
title: "cold-session-discoverability"
status: pending
priority: P1
effort: "1.5h"
dependencies: ["2"]
---

# Phase 6: Cold-Session Discoverability + Legacy E2E Test Fix

## Overview

**Fixes two latent test correctness issues in the cold-session discoverability surface:**

1. **`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68`** loads the **legacy** `tools/learning-loop-mcp/tools/manifest.json` (31 entries) but the test's `serverEntry` (line 35) is the **mastra** server. The test is currently asserting the wrong manifest. Per scout report §9.4, this is the cold-session discovery gap.

2. **`tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70`** asserts `=== 31` (from `MANIFEST_PATH = tools/learning-loop-mastra/tools/manifest.json`), but the mastra server now returns 44 tools (31 + 10 workflows + 3 agents). The test must be relaxed to `>= 31` to match the mastra-side e2e pattern at `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:78`.

**Why this phase exists:** Plan 3 hardened the agent parity tests but did not catch these two latent test issues. The tests are currently passing only because either (a) the legacy e2e is being silently skipped, or (b) the legacy test was deleted post-C6 and the journal's count is stale. Per the post-Plan-3 hardening journal line 71, the count is "1169 tests, 1168 pass, 1 skip, 0 fail" — the 1 skip is likely one of these tests.

## Requirements

- Functional: `cold-session-discoverability.test.cjs` enumerates the mastra manifest (44 tools across 6 groups), not the legacy 31-entry manifest. The legacy e2e test is relaxed from `=== 31` to `>= 31`. A new mastra-side test (`cold-session-enumerate-mastra.test.cjs`) explicitly asserts all 44 tools register with valid `name`/`description`/`inputSchema`.
- Non-functional: `pnpm test:cold-session` GREEN (11/11 or scope-unchanged).

## Architecture

Per the brainstorm §"Plan 4 (Cutover)" item 4.2 (lines 380-382) and scout report §3.5, the cold-session test was originally written when the legacy `tools/learning-loop-mcp/` was the canonical server. Post-Plan-3, the test's `serverEntry` is the mastra server but its manifest path is the legacy one. This is a mis-wiring.

The fix:
- Update the test to load the mastra `agent-manifest.json` (the canonical 44-tool reference).
- Cross-walk: verify each tool in `agent-manifest.json#groups` exists as a registered MCP tool on the mastra server.
- Relax the legacy e2e test (it was a v1 spec; the mastra-side e2e is the v2 spec).

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (line 68: change manifest path; add a new "MCP tools register from mastra manifest" test)
- **Modify:** `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70` (relax `=== 31` to `>= 31`)
- **Create:** `tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs` (new test; asserts all 44 tools register with valid shape)
- **Read (verification):** `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:78` (the `>= TOOL_COUNT` pattern to mirror)

## Implementation Steps

### Step 6.1: Update `cold-session-discoverability.test.cjs` line 68

**Current (around line 68):**

```js
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
// ... iterates manifest, asserts each entry's export is importable
```

The `manifestPath` (set earlier in the file) points at `tools/learning-loop-mcp/tools/manifest.json` (the legacy 31-entry manifest).

**Replace the manifest path source:**

Find the line that defines `manifestPath` (likely at the top of the test file or in a `before` hook). The path should be:

```js
const manifestPath = join(__dirname, "..", "..", "learning-loop-mastra", "agent-manifest.json");
```

Or use the absolute path pattern from the legacy e2e test:

```js
const MANIFEST_PATH = join(PROJECT_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
```

The test then iterates `manifest.groups.{gate,workflow,meta_state,introspection,runtime_agnostic,agent}.tools` (44 entries total) and asserts each one is a registered MCP tool on the mastra server.

**Concrete code change (insert at the start of the "MCP tools register from manifest" test, around line 67):**

```js
test("MCP tools register from mastra agent-manifest", { timeout: 10000 }, async () => {
  const manifestPath = join(PROJECT_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const allToolNames = new Set();
  for (const group of Object.values(manifest.groups)) {
    for (const name of group.tools) {
      allToolNames.add(name);
    }
  }
  assert.strictEqual(allToolNames.size, 44, `expected 44 tool names in agent-manifest, got ${allToolNames.size}`);

  const tools = await server.client.listTools();
  const registeredNames = new Set(tools.map((t) => t.name));
  for (const name of allToolNames) {
    assert.ok(registeredNames.has(name), `MCP server does not register ${name} (declared in agent-manifest.json)`);
  }
});
```

The existing test ("MCP tools register from manifest") at line 67-104 may be left in place if it provides additional value, OR deleted since it's now superseded. Recommendation: **delete the legacy test** (it was testing the wrong manifest); replace with the new test above.

### Step 6.2: Relax the legacy e2e test

**Current (`tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70-71`):**

```js
assert.strictEqual(result.tools.length, TOOL_COUNT,
  `expected ${TOOL_COUNT} tools, got ${result.tools.length}`);
```

**Replace with:**

```js
assert.ok(result.tools.length >= TOOL_COUNT,
  `expected >= ${TOOL_COUNT} tools, got ${result.tools.length} (workflow + agent additions OK)`);
```

This matches the mastra-side e2e pattern at `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs:78`. The comment in the legacy test says "verify count matches manifest.json" — the relaxation is necessary because the server now exposes 44 tools, not 31.

### Step 6.3: Create the mastra-side enumeration test

Create `tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs`:

```js
// Cold-session enumeration test — verifies that every tool declared in
// tools/learning-loop-mastra/agent-manifest.json is registered by the
// mastra MCP server, with valid name/description/inputSchema.
//
// This is the canonical cold-session discoverability test post-Phase-D.
// The legacy equivalent in tools/learning-loop-mcp/__tests__/cold-session-
// discoverability.test.cjs tests the same property but reads the wrong
// manifest; Phase 6 fixes it to read agent-manifest.json.

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const AGENT_MANIFEST_PATH = join(PROJECT_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/server.js");

/** Spawn the MCP server and return a connected Client + cleanup handle. */
async function spawnServer() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
  });

  const client = new Client({ name: "cold-session-enumerate-mastra", version: "1.0.0" });
  await client.connect(transport);

  return {
    client,
    async cleanup() {
      try { await client.close(); } catch (e) {
        if (!e?.message?.includes("closed")) console.error("cleanup error:", e);
      }
    },
  };
}

describe("cold-session enumerate mastra manifest", () => {
  let server;
  let tools;
  let byName;

  before(async () => {
    server = await spawnServer();
    tools = await server.client.listTools();
    byName = new Map(tools.map((t) => [t.name, t]));
  }, { timeout: 15000 });

  after(async () => {
    if (server) await server.cleanup();
  });

  const agentManifest = JSON.parse(readFileSync(AGENT_MANIFEST_PATH, "utf8"));
  const declaredTools = [];
  for (const [groupName, group] of Object.entries(agentManifest.groups)) {
    for (const name of group.tools) {
      declaredTools.push({ name, group: groupName });
    }
  }

  test("agent-manifest.json declares 44 tools across 6 groups", () => {
    assert.strictEqual(declaredTools.length, 44,
      `expected 44 tools in agent-manifest.json, got ${declaredTools.length}`);
    assert.strictEqual(Object.keys(agentManifest.groups).length, 6,
      `expected 6 groups in agent-manifest.json, got ${Object.keys(agentManifest.groups).length}`);
  });

  test("server registers all 44 declared tools", () => {
    assert.strictEqual(tools.length, 44,
      `server should expose 44 tools, got ${tools.length}`);
  });

  test("every declared tool is registered", () => {
    for (const { name } of declaredTools) {
      assert.ok(byName.has(name),
        `MCP server does not register ${name} (declared in agent-manifest.json)`);
    }
  });

  test("no extra tools beyond declared", () => {
    const declared = new Set(declaredTools.map((t) => t.name));
    for (const t of tools) {
      assert.ok(declared.has(t.name),
        `MCP server exposes ${t.name} but it is not in agent-manifest.json`);
    }
  });

  test("every tool has valid name + description + inputSchema", () => {
    for (const t of tools) {
      assert.strictEqual(typeof t.name, "string", `${t.name}: name must be string`);
      assert.ok(t.name.length > 0, `tool name must be non-empty`);
      assert.strictEqual(typeof t.description, "string", `${t.name}: description must be string`);
      assert.ok(t.description.length > 0, `${t.name}: description must be non-empty`);
      assert.ok(typeof t.inputSchema === "object" && t.inputSchema !== null,
        `${t.name}: inputSchema must be object`);
    }
  });
});
```

### Step 6.4: Run the tests

```bash
# Cold-session test (legacy)
pnpm test:cold-session

# New mastra-side enumeration test
node --test tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs

# Legacy e2e test (should now pass with the relaxation)
node --test tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs

# Full test suite
pnpm test
```

Expected: all tests pass. The cold-session test is now GREEN with the corrected manifest path. The legacy e2e test is GREEN with the relaxation. The new mastra-side test is GREEN. The full test suite adds ~5 new tests (44-tool count, 6-group count, "every declared tool is registered", "no extra tools", "valid shape").

### Step 6.5: Verify the journal's test count claim

Per the post-Plan-3 hardening journal line 71, the test count is "1169 tests, 1168 pass, 1 skip, 0 fail". After Phase 6, the count should be:
- 1169 (baseline) + 5 (new cold-session-enumerate-mastra tests) + 1 (manifest-arithmetic test from Phase 2 if it has 1 test, not 9) = 1175 tests
- Or: 1169 + 9 (manifest-arithmetic) + 5 (cold-session-enumerate-mastra) = 1183 tests
- The exact delta depends on test count in Phase 2's `manifest-arithmetic.test.cjs` (9 tests per the Phase 2 spec).

The test count claim in Phase 9's journal will be re-verified.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68` manifest path now points at `tools/learning-loop-mastra/agent-manifest.json`.
- [ ] The cold-session test asserts all 44 tools register with valid shape.
- [ ] `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs:70` is relaxed from `=== 31` to `>= 31` (with comment explaining the workflow + agent additions).
- [ ] `tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs` exists with 5 tests, all GREEN.
- [ ] `pnpm test:cold-session` GREEN.
- [ ] `pnpm test` baseline holds (count delta +5 to +14 depending on Phase 2's test count, 0 fail).

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The cold-session test was actually passing because it's testing a property that's still true (the legacy manifest tools DO register) | Medium | Per scout report §9.4, the test loads the legacy manifest but the server is the mastra server. The 31 legacy tools DO register (they're loaded via `#mcp/${file}` in `server.js:25`), so the test technically passes. But it's testing the wrong property — it should test the mastra manifest, not the legacy one. Phase 6 fixes this. |
| The relaxation to `>= 31` masks a real bug (e.g., a tool was dropped) | Low | The new `cold-session-enumerate-mastra.test.cjs` enforces the 44-tool exact count + the 6-group structure + cross-walk. If a tool is dropped, that test fails. The legacy e2e relaxation is for the e2e wiring, not the tool surface correctness. |
| The cold-session test still references `tools/learning-loop-mcp/tools/manifest.json` in some other line (e.g., a comment or a deep import) | Low | Grep the file after the edit for any remaining references to the legacy manifest. If found, update them. |
| The new `cold-session-enumerate-mastra.test.cjs` fails because the server start takes longer than 15s in CI | Low | The `before` hook has a 15s timeout. Increase to 30s if needed. |
| The legacy e2e test was silently being SKIPPED (not deleted); the relaxation now makes it RUN, and it actually fails for a different reason | Low | The test was running (per the journal's pass count); the relaxation just changes the assertion, not the test execution. Verify the test runs and passes. |
| The new test file's path (`tools/learning-loop-mastra/__tests__/cold-session-enumerate-mastra.test.cjs`) conflicts with the existing `mcp-protocol-e2e.test.cjs` (which spawns the same server) | Low | The two tests are independent (different `before`/`after` blocks; different `Client` instances). They can run in the same `pnpm test` run. Verify by running both. |
| The new test file is picked up by `pnpm test:cold-session` (the cold-session command runs only the legacy cold-session test, not the new one) | Low | The cold-session script (`pnpm test:cold-session`) is `node --test tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs`. The new test is in `tools/learning-loop-mastra/__tests__/`, so it's run by the full `pnpm test` glob, not by `test:cold-session`. The cold-session check is per the operator's existing protocol. |

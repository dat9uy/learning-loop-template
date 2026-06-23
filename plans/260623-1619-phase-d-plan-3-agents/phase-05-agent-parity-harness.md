---
phase: 5
title: "agent-parity harness"
status: pending
priority: P1
effort: "~1-2h"
dependencies: [4]
---

# Phase 5: agent-parity harness

## Overview

Ship `agent-parity.test.cjs` — the parity harness for the 3 `ask_*` MCP tools. Empirical probe first (Phase 5.1): spawn the mastra server with 1 test agent (mocked LLM), call `ask_<test>`, inspect the raw MCP response, lock the format. Then 7-9 tests in 1 file: 1 probe + 3 per-agent invocation + 1 model-override + 1 schema-parity + 1 tools/list enumeration + (optional) 1 input-validation rejection. Mirrors Plan 1's `workflow-parity.test.cjs` shape (mixed mode: substrate-direct + MCP integration + direct unit).

## Requirements

- **Functional:**
  - Empirical probe test (Phase 5.1): spawn server, call `ask_intake_agent` with a fixed message, assert the response shape (`result.text` is the pre-parsed string returned by `with-mcp-server.js`; contains the expected `text` field from the mock).
  - 3 per-agent invocation tests (Phase 5.2-5.4): one per agent, each with a distinct `mockText` and a distinct `spyGenerate` assertion.
  - 1 per-agent-manifest-field override test (Phase 5.5): patch the test-only manifest fixture to set one agent's `model` field to a distinct value (e.g., `anthropic/claude-sonnet-4-6`); assert the agent uses the patched model via `spyGenerate` recording the model id. **Note:** the `MASTRA_AGENT_MODEL` env-var override is already covered at the unit-test level by Phase 2's invariant Test 2 (`resolveAgentModel` env var wins when no per-agent field). The MCP-integration version of the env-var override test would require a real API key for the overridden model and is NOT in scope; the unit-test version is sufficient.
  - 1 schema-parity test (Phase 5.6): assert each `ask_*` tool's input schema is `{ message: string }` (the locked MCP shape per researcher-A Q2).
  - 1 tools/list enumeration test (Phase 5.7): assert exactly 3 `ask_*` tools in `tools/list` with the expected keys.
  - 1 input-validation rejection test (Phase 5.8): call `ask_*` with no `message` field; assert the MCP call rejects with a clear error.
- **Non-functional:**
  - All 3 agents use a mocked LLM via `createMockModelWithSpy` (the helper from Phase 2).
  - The harness uses `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (existing spawn helper) — same pattern as `workflow-parity.test.cjs`.
  - No vendor API calls (the mock is local; the Kimi router is not invoked).
  - The harness is deterministic: same input → same output.

## Architecture

**File: `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs`**

```js
// Test structure mirrors workflow-parity.test.cjs
// Shared `before` block spawns the mastra server with 3 agents (mocked LLM)
// Per-test mocks inject distinct mockText + spyGenerate for assertion

const { test, before, after, describe } = require("node:test");
const assert = require("node:assert/strict");
const { connectMcpServer, cleanup } = require("./with-mcp-server.js");
const { createMockModelWithSpy } = require("./helpers/create-mock-model.cjs");

let handles;
let agentSpy;

before(async () => {
  // Spawn the server with mocked LLM (via process.env.MASTRA_AGENT_MODEL or per-agent manifest override)
  // OR: use a per-test setup that injects the mock via the agents-manifest.json patch
  // The cleanest path: read agents-manifest.json, patch model to use createMockModelWithSpy,
  // spawn server, restore manifest in `after`
  // (Alternatively: ship a test-only manifest at tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json
  //  and have the server load it via env var MASTRA_AGENTS_MANIFEST)
});
```

**Mock injection design (red-team Finding 2 fix):**

The `with-mcp-server.js` helper spawns a child process. JavaScript objects (`createMockModel` returns a model instance) cannot cross process boundaries via JSON files or env vars. The mock injection must happen within the spawned server process, not from the test process.

**Solution: per-test server spawn + `resolveAgentModel` marker recognition.**

1. The test fixture (`agents-manifest.test.json`) sets `model: "__MOCK_LLM__"` — a string marker in the JSON file.
2. `resolveAgentModel()` in `create-loop-agent.js` recognizes the `"__MOCK_LLM__"` marker. When detected, it checks a module-level registry (`__testMockModels__`) for a pre-registered mock. If found, returns the mock instance. If not found, throws with a clear error.
3. The test registers its `createMockModelWithSpy()` result into the registry BEFORE spawning the server. Since `create-loop-agent.js` is a module imported by the agent wrappers, and the agent wrappers are imported by `server.js`, the registry is shared within the same process.
4. Each test spawns a fresh server via `connectMcpServer()` (same pattern as `workflow-parity.test.cjs` which spawns per-test or per-describe). The `MASTRA_AGENTS_MANIFEST` env var points to the test fixture.

```js
// tools/learning-loop-mastra/create-loop-agent.js — add test-only mock registry
export const __testMockModels__ = new Map(); // agentId -> mock model instance

export function resolveAgentModel(agentId, agentsManifest) {
  // Layer 0 (test-only): check mock registry
  if (__testMockModels__.has(agentId)) return __testMockModels__.get(agentId);
  // Layer 1: per-agent manifest field
  const perAgent = agentsManifest?.[agentId]?.model;
  if (perAgent && perAgent !== "__MOCK_LLM__") return perAgent;
  // Layer 2: env var
  if (process.env.MASTRA_AGENT_MODEL) return process.env.MASTRA_AGENT_MODEL;
  // Layer 3: code default
  return DEFAULT_AGENT_MODEL;
}
```

> **Why this is safe:** `__testMockModels__` is a `Map` that is empty in production (no code writes to it except tests). The `"__MOCK_LLM__"` string is never a valid `ModelRouterModelId` (Mastra router rejects it). The registry check is O(1) and has no side effects. This is the same pattern as test-only global stubs in other Node.js test harnesses.

**`MASTRA_AGENTS_MANIFEST` env var** (added in Phase 4 step 5 if not already present):

```js
// server.js
const AGENTS_MANIFEST_PATH = process.env.MASTRA_AGENTS_MANIFEST ?? join(__dirname, "agents-manifest.json");
const AGENTS_MANIFEST = JSON.parse(readFileSync(AGENTS_MANIFEST_PATH, "utf8"));
```

This env var is test-only. The plan does NOT document it in the operator-facing `.claude/coordination/MASTRA_AGENT_MODEL.md` (the env var is internal to the test harness).

**Per-agent test mock injection (red-team Finding 5 fix — correct `callTool` API):**

```js
// agent-parity.test.cjs — Phase 5.2 (intakeAgent invocation)
// Note: callTool(name, args) — positional args, NOT ({name, arguments}).
// with-mcp-server.js already parses content[0].text, returning the parsed object.
test("ask_intake_agent produces expected output with mocked LLM", { timeout: 15000 }, async () => {
  const { model, calls } = createMockModelWithSpy({
    mockText: "intake-agent-response",
    spyGenerate: (props) => {
      assert.match(JSON.stringify(props), /Bound surface: the meta-surface/);
    },
  });
  // Register mock BEFORE spawning server
  const { __testMockModels__ } = await import("../create-loop-agent.js");
  __testMockModels__.set("intakeAgent", model);
  const handles = await connectMcpServer(/* env: MASTRA_AGENTS_MANIFEST points to test fixture */);
  try {
    const result = await handles.callTool("ask_intake_agent", { message: "What rules are in force?" });
    // result is already parsed by with-mcp-server.js — no JSON.parse needed
    assert.equal(result.text, "intake-agent-response");
    assert.equal(calls.length, 1);
  } finally {
    __testMockModels__.delete("intakeAgent");
    await handles.cleanup();
  }
});
```

**Empirical probe (Phase 5.1) — truly exploratory (red-team Finding 2/8 fix):**

```js
test("Phase 5.1: empirical probe of ask_intake_agent MCP response shape", { timeout: 15000 }, async () => {
  const { model } = createMockModelWithSpy({ mockText: "probe-response" });
  const { __testMockModels__ } = await import("../create-loop-agent.js");
  __testMockModels__.set("intakeAgent", model);
  const handles = await connectMcpServer();
  try {
    const result = await handles.callTool("ask_intake_agent", { message: "probe" });
    console.log("EMPIRICAL PROBE result:", JSON.stringify(result, null, 2));
    // Truly exploratory: assert only that we got a non-null result
    assert.ok(result != null, "expected non-null result from ask_intake_agent");
    // Document the observed shape in a comment after this test runs
    // Expected (from researcher-A Q4): result has a `text` field
  } finally {
    __testMockModels__.delete("intakeAgent");
    await handles.cleanup();
  }
});
```

The empirical probe is the first test in the file. It logs the full response shape WITHOUT asserting specific fields. After observing, the implementer adds a comment documenting the locked format, then writes the remaining 7 tests against the observed shape.

## Related Code Files

- **Create:**
  - `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` (parity harness; ~200 LOC)
  - `tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json` (test-only manifest with mocked model field; ~30 lines)
- **Modify:**
  - `tools/learning-loop-mastra/server.js` (add `MASTRA_AGENTS_MANIFEST` env var support — if not already present from Phase 4)
- **Delete:** none
- **Read (verification):**
  - `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (existing spawn helper)
  - `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (parity harness shape to mirror)
  - `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (mixed-mode precedent)
  - `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` (the helper from Phase 2)
  - `tools/learning-loop-mastra/agents-manifest.json` (the 3-entry manifest)
  - `node_modules/@mastra/mcp/dist/index.js` (the `ask_<key>` conversion logic)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` | Create | ~200 LOC | +7-9 parity tests |
| `tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json` | Create | ~30 lines | test fixture |
| `tools/learning-loop-mastra/server.js` | Modify (optional) | +3 LOC | adds `MASTRA_AGENTS_MANIFEST` env var support |

## Implementation Steps

1. **Read `workflow-parity.test.cjs` and `storage-parity.test.cjs` to confirm the test file shape.** The pattern: shared `before` block spawns the server, per-test mocks inject behavior, `after` cleans up.
2. **Create the test-only manifest fixture.** `tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json` is a copy of the production `agents-manifest.json` with the `model` field set to `"__MOCK_LLM__"` (a marker the server recognizes via the `MASTRA_AGENTS_MANIFEST` env var). Alternatively, the test fixture is a copy with `model` set to a `ModelRouterModelId` that resolves to a local stub; the cleanest path is the env var + marker. **Add a header comment to the test fixture that references the production manifest as the source of truth:** `// SOURCE OF TRUTH: ../../../agents-manifest.json (production). The test fixture is a copy with the model field replaced by the __MOCK_LLM__ marker. If the production manifest gains new fields, the test fixture must be updated in lockstep. The Phase 5.7 tools/list enumeration test asserts the agent count is 3 — the regression guard that catches manifest drift.`
3. **Add `MASTRA_AGENTS_MANIFEST` env var support to `server.js`** (if not already present from Phase 4). The env var overrides the default manifest path. Used only in tests.
4. **Write the empirical probe test (Phase 5.1).** The first test in the file. Spawns the server with the test-only manifest, calls `ask_intake_agent` with a fixed message, logs the raw response, asserts the basic shape (`result.text` is the pre-parsed string per `with-mcp-server.js`, containing a `text` field). The locked format is documented in a comment header in the test file.
5. **Write the 3 per-agent invocation tests (Phase 5.2-5.4).** Each test:
   - Constructs a `createMockModelWithSpy` instance with a distinct `mockText` (one per agent).
   - Patches the test-only manifest to point at the mock model.
   - Reloads the server (or uses a per-test server spawn if Option A is chosen).
   - Calls `ask_<agent>` with a fixed message.
   - Asserts: response shape matches the empirical probe, `mockText` round-trips, `calls.length === 1`, prompt includes the agent's instructions marker.
6. **Write the per-agent-manifest-field override test (Phase 5.5).** Patch the test-only manifest fixture to set `intake_agent.model = "anthropic/claude-sonnet-4-6"`. Reload the server. Call `ask_intake_agent`. Assert the `spyGenerate` records the model id `"anthropic/claude-sonnet-4-6"` (the patched manifest value wins). This tests the per-agent-field layer of the 3-layer lookup. The env-var layer is already covered at the unit-test level by Phase 2's Test 2.
7. **Write the schema-parity test (Phase 5.6).** Call `listTools()`. Filter to `ask_*` tools. Assert each has `inputSchema.type === "object"`, `inputSchema.properties.message.type === "string"`, `inputSchema.required.includes("message")`, and `inputSchema.additionalProperties === false`.
8. **Write the tools/list enumeration test (Phase 5.7).** Assert exactly 3 `ask_*` tools in `tools/list` with the expected keys (`ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`).
9. **Write the input-validation rejection test (Phase 5.8).** Call `ask_intake_agent` with no `message` field. Assert the MCP call returns an error (or a validation rejection) — the locked behavior depends on the empirical probe's observation.
10. **Write the conditional e2e integration test (Phase 5.9 — Post Plan 3 step, ships in this phase).** New file: `tools/learning-loop-mastra/__tests__/agent-e2e-integration.test.cjs`. This is the **Post Plan 3 functional verification** step (per `brainstorm-260618-1538-phase-d-plan-split-report.md` §"Post Plan 3"). The test uses `node:test`'s conditional `describe({ skip: !HAS_KEY })` pattern:
   - If `KIMI_API_KEY` is unset: the entire `describe` block is skipped (3 tests counted as 3 skipped in the test summary).
   - If `KIMI_API_KEY` is set: spawns the mastra server WITHOUT the `MASTRA_AGENTS_MANIFEST` env var (so the production `agents-manifest.json` is used), calls each `ask_*` with a real prompt, and asserts the response includes expected loop concepts.
   - **Test 5.9.1 (intakeAgent):** Call `ask_intake_agent({ message: "What rules are in force? List active findings." })`. Assert: `result.text` is non-empty, length > 50 chars; matches `/active|rule|surface|meta-state/i`.
   - **Test 5.9.2 (scoutAgent):** Call `ask_scout_agent({ message: "Run the scout pipeline at the project root and report the bucket distribution." })`. Assert: response includes at least 1 of the 5 scout sections ("Test Inventory", "MCP-First Bucket Distribution", "Dangling Matches", "Gap Table", "Prompt Budget Audit").
   - **Test 5.9.3 (selfImprovementAgent):** Call `ask_self_improvement_agent({ message: "Given the scout output, propose 1 experiment candidate." })`. Assert: response includes `/finding|experiment|hypothesis|gap|surface/i`.
   - **Why this is the Post Plan 3 step in Plan 3:** It's small (~150 LOC) and ships with the agent wrappers. The operator runs it manually after Plan 3 merges (per Phase 6's Post Plan 3 prerequisites section). The test is gated so the regular `pnpm test` baseline is unchanged for operators without `KIMI_API_KEY`.
   - **Test count math update:** Plan 1b baseline 1140 + Phase 2's 4 + Phase 3's 3 + Phase 5's 8 (mocked) = 1155 pass / 0 fail / 1 skipped (default, no `KIMI_API_KEY`). With `KIMI_API_KEY`: 1158 pass / 0 fail / 1 skipped (3 additional pass; 1 original skip retained). The 3 conditional tests are the Post Plan 3 verification surface.
11. **Run `pnpm test` to confirm the new tests pass.** Plan 1b baseline 1140 + Phase 2's 4 + Phase 3's 3 + Phase 5's 8 (mocked) + Phase 5.9's 3 (conditional, skipped by default) = 1158 tests in total / 1155 pass / 0 fail / 1 skipped (default) OR 1158 pass / 0 fail / 1 skipped (with `KIMI_API_KEY`).

## Function/Interface Checklist (deep mode)

- [ ] `MASTRA_AGENTS_MANIFEST` env var overrides the default manifest path (test-only)
- [ ] Test fixture `agents-manifest.test.json` exists with the mock model marker
- [ ] Empirical probe test logs the response shape + asserts `result.text` (pre-parsed by `with-mcp-server.js`) is the locked format
- [ ] 3 per-agent tests assert: response shape, `mockText` round-trip, `calls.length === 1`, instructions marker in prompt
- [ ] Per-agent-manifest-field override test asserts the manifest's `model` field wins
- [ ] Schema-parity test asserts the locked `{ message: string }` input schema
- [ ] Tools/list enumeration test asserts exactly 3 `ask_*` tools with the expected keys
- [ ] Input-validation rejection test asserts the locked rejection behavior
- [ ] Conditional e2e integration test (`agent-e2e-integration.test.cjs`) exists with 3 tests, gated on `KIMI_API_KEY`
- [ ] When `KIMI_API_KEY` is unset, the 3 e2e tests are reported as `skipped` (not failed)
- [ ] When `KIMI_API_KEY` is set, the 3 e2e tests assert response includes expected loop concepts (active/rule for intake; bucket section for scout; finding/experiment for selfImprovement)

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| Phase 5.1: empirical probe locks the response format | ✓ | | | the format lock |
| Phase 5.2: intakeAgent invocation round-trip | ✓ | | | per-agent contract |
| Phase 5.3: scoutAgent invocation round-trip | ✓ | | | per-agent contract |
| Phase 5.4: selfImprovementAgent invocation round-trip | ✓ | | | per-agent contract |
| Phase 5.5: per-agent manifest field wins (per-agent layer of 3-layer lookup) | ✓ | | | the per-agent lookup |
| Phase 5.6: input schema parity (locked `{ message: string }`) | ✓ | | | the schema-parity contract |
| Phase 5.7: tools/list enumeration = 3 `ask_*` tools | ✓ | | | the count-math guard |
| Phase 5.8: input validation rejection | | ✓ | | the input contract enforcement |
| Phase 5.9.1: intakeAgent real-LLM invocation (gated on KIMI_API_KEY) | ✓ | | | Post Plan 3 verification — proves agent actually follows the loop |
| Phase 5.9.2: scoutAgent real-LLM invocation (gated on KIMI_API_KEY) | ✓ | | | Post Plan 3 verification — proves scout produces expected sections |
| Phase 5.9.3: selfImprovementAgent real-LLM invocation (gated on KIMI_API_KEY) | ✓ | | | Post Plan 3 verification — proves selfImprovement follows the loop |
| All tests: `calls.length === 1` per invocation | | ✓ | | the single-call contract |
| All tests: prompt includes the agent's instructions marker | | ✓ | | the instructions are honored |

## Dependency Map (deep mode)

- **Reads from:**
  - `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (spawn helper)
  - `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` (mock helper from Phase 2)
  - `tools/learning-loop-mastra/agents-manifest.json` (the 3-entry manifest)
  - `tools/learning-loop-mastra/agents/instructions/<name>.js` (the 3 instruction strings, for marker assertions)
  - `node_modules/@mastra/mcp/dist/index.js` (the `ask_<key>` conversion logic; expected response shape)
- **Writes to:**
  - `tools/learning-loop-mastra/__tests__/agent-parity.test.cjs` (parity harness)
  - `tools/learning-loop-mastra/__tests__/fixtures/agents-manifest.test.json` (test fixture)
- **Blocks:** Phase 6 (the closeout runs `pnpm test` and reports the count)
- **Blocked by:** Phase 4 (the `server.js` wiring + agent registration)

## Success Criteria

- [ ] 8 tests pass in `agent-parity.test.cjs`
- [ ] Empirical probe logs the response shape and locks the format
- [ ] 3 per-agent invocation tests pass
- [ ] Per-agent-manifest-field override test passes (Phase 5.5)
- [ ] Schema-parity test passes (each `ask_*` has `{ message: string }` input schema)
- [ ] Tools/list enumeration test passes (3 `ask_*` tools)
- [ ] `pnpm test` shows the expected count delta (+7-9 from Phase 4's 1147 baseline → 1154-1156)
- [ ] No vendor API calls (mock is local; Kimi router not invoked)
- [ ] No `MASTRA_API_KEY` or other secrets in test logs

## Risk Assessment

- **The empirical probe reveals the response shape is NOT `result.text` as expected.** Risk: medium. **Mitigation:** The probe runs first; the test file's assertions are updated based on the observation. If the shape is different, the remaining 6-8 tests are re-targeted at the actual shape. The shape is documented in a comment header in the test file. Researcher A Q4 flagged this as a known unknown; Phase 5.1 is the explicit resolution.
- **The mock LLM does not produce the expected `text` field on `doGenerate`.** Risk: low. **Mitigation:** `createMockModelWithSpy` is a thin wrapper around `createMockModel`, which returns a fixed `text` field per the helper's implementation (verified at `node_modules/@mastra/core/dist/test-utils/llm-mock.js`). The spy records the call; the test asserts the spy was called exactly once with the expected input shape.
- **`MASTRA_AGENTS_MANIFEST` env var is read at import time, not at server start time.** Risk: low. **Mitigation:** Phase 4's `server.js` change reads the env var at the top of the module (line 1-5). Each test that needs a different manifest sets the env var BEFORE importing `server.js`. The test uses `child_process.spawn` (via `with-mcp-server.js`) to start a fresh server per test, so the env var is read on each spawn.
- **The test fixture is committed and accidentally used in production.** Risk: very low. **Mitigation:** The fixture is in `__tests__/fixtures/`, a subdirectory of the test folder. The `server.js` only loads it when `MASTRA_AGENTS_MANIFEST` env var is set. The default `agents-manifest.json` is in the package root, not the test folder.
- **The model-override test is flaky due to env var leakage between tests.** Risk: low. **Mitigation:** `before`/`after` hooks set/restore the env var. The test file uses a fresh `connectMcpServer` per test (no shared state).

## Security Considerations

- **The mock LLM is local; no vendor API is invoked.** Risk: very low. **Mitigation:** `createMockModel` returns a stub that does not transmit prompts to any external service. The Kimi router is never invoked in the test harness.
- **The `MASTRA_AGENTS_MANIFEST` env var is not documented in the operator-facing reference.** Risk: very low. **Mitigation:** The env var is internal to the test harness. Production deployments use the default `agents-manifest.json`. If a future plan needs to make the env var operator-facing, it gets added to `.claude/coordination/MASTRA_AGENT_MODEL.md`.
- **The test fixture is not committed with secrets.** Risk: very low. **Mitigation:** The fixture contains only the `__MOCK_LLM__` marker string. No API keys, no per-deployment config. The fixture is a copy of the production manifest with the `model` field replaced.

## Next Steps

After Phase 5 ships, Phase 6 runs the full `pnpm test`, files the closeout log-change, drafts the journal entry, and updates the master tracker to flip D4 + D7 `[x]`.

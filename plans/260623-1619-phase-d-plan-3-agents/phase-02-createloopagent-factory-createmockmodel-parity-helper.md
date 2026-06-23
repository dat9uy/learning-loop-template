---
phase: 2
title: "createLoopAgent factory + createMockModel parity helper"
status: pending
priority: P1
effort: "~1-2h"
dependencies: [1]
---

# Phase 2: createLoopAgent factory + createMockModel parity helper

## Overview

Ship `createLoopAgent` factory + `resolveAgentModel` helper. Mirrors `createLoopTool` + `createLoopWorkflow` patterns (parity-shim + `attachParityJSONSchema`). The factory accepts `{ id, name, description, instructions, modelOverride?, tools }` and returns a `new Agent({...})` instance with the 3-layer model lookup applied. TDD: 4 invariant tests RED first, then GREEN.

## Requirements

- **Functional:**
  - `resolveAgentModel(agentId, agentsManifest)` implements the 3-layer lookup: (1) per-agent `agentsManifest[agentId].model` if set, (2) `process.env.MASTRA_AGENT_MODEL` if set, (3) code default `"kimi-for-coding/k2p6"`.
  - `createLoopAgent({ id, name, description, instructions, modelOverride?, tools })` constructs `new Agent({...})` with the resolved model. Default `memory: undefined` (no `memory` field passed).
  - 4 invariant tests prove the contract: lookup layers, fallback, factory shape, `memory` undefined.
- **Non-functional:**
  - No new vendor deps.
  - ESM (`tools/learning-loop-mastra/` is ESM; `.js` extensions on imports per existing pattern).
  - The factory does NOT import `@mastra/core/test-utils` (the test helper is test-only; production code never imports it).
  - The factory applies the parity-shim to any tool `inputSchema` passed via `tools` (same pattern as `createLoopTool`).

## Architecture

**`createLoopAgent` factory shape** (mirrors `createLoopTool`):

```js
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { buildParitySchema } from "./schema-parity.js";

const DEFAULT_AGENT_MODEL = "kimi-for-coding/k2p6";

export function resolveAgentModel(agentId, agentsManifest) {
  // Layer 1: per-agent manifest field
  const perAgent = agentsManifest?.[agentId]?.model;
  if (perAgent) return perAgent;
  // Layer 2: env var
  if (process.env.MASTRA_AGENT_MODEL) return process.env.MASTRA_AGENT_MODEL;
  // Layer 3: code default
  return DEFAULT_AGENT_MODEL;
}

export function createLoopAgent({ id, name, description, instructions, modelOverride, tools }) {
  if (!id) throw new Error(`createLoopAgent: id is required.`);
  if (!name) throw new Error(`createLoopAgent: name is required for "${id}".`);
  if (!instructions) throw new Error(`createLoopAgent: instructions are required for "${id}".`);
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    throw new Error(`createLoopAgent: id "${id}" must match /^[a-z][a-z0-9_]*$/.`);
  }
  // modelOverride is for tests only; production agents use agentsManifest lookup
  const model = modelOverride ?? resolveAgentModel(id, /* agentsManifest passed by caller */ undefined);
  return new Agent({
    id,
    name,
    description,
    instructions,
    model,
    tools,
    // memory: omitted — agent is memory-less (OM off; Phase 5 consumer)
  });
}
```

**`createMockModel` parity helper** — separate file at `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs`. The helper is test-only (lives under `__tests__/helpers/` per the existing `with-mcp-server.js` pattern). Re-exports `createMockModel` from `@mastra/core/test-utils` with a default config that includes `spyGenerate` recording the agent's prompt for assertion.

```js
// tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs
const { createMockModel: mastraCreateMockModel } = require("@mastra/core/test-utils");

function createMockModelWithSpy({ mockText, spyGenerate } = {}) {
  const calls = [];
  const model = mastraCreateMockModel({
    mockText: typeof mockText === "string" ? mockText : JSON.stringify(mockText),
    spyGenerate: (props) => {
      calls.push(props);
      if (spyGenerate) spyGenerate(props);
    },
  });
  return { model, calls };
}

module.exports = { createMockModelWithSpy };
```

The test helper records `calls` so the parity test can assert "the agent's prompt was passed to the LLM with the expected instructions prefix."

## Related Code Files

- **Create:**
  - `tools/learning-loop-mastra/create-loop-agent.js` (factory + `resolveAgentModel` helper; ~50 LOC)
  - `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` (4 invariant tests; ~80 LOC; Node test runner with `node --test`)
  - `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` (parity test helper; ~30 LOC)
- **Modify:** none
- **Delete:** none
- **Read (verification):**
  - `tools/learning-loop-mastra/create-loop-tool.js` (factory pattern to mirror)
  - `tools/learning-loop-mastra/create-loop-workflow.js` (factory pattern 2 of 2 to mirror)
  - `tools/learning-loop-mastra/schema-parity.js` (parity-shim reused)
  - `node_modules/@mastra/core/dist/agent/agent.d.ts:51` (Agent class declaration)
  - `node_modules/@mastra/core/dist/agent/types.d.ts#AgentConfigBase` (constructor fields)
  - `node_modules/@mastra/core/dist/test-utils/llm-mock.js` (the `createMockModel` export)
  - `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (test pattern; 5 invariant tests Phase 1 + 2 plan)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/create-loop-agent.js` | Create | ~50 LOC | production factory |
| `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` | Create | ~80 LOC | +4 invariant tests |
| `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` | Create | ~30 LOC | test helper (not a test file) |

## Implementation Steps

1. **Read `createLoopTool` + `createLoopWorkflow` to confirm the pattern to mirror.** The factory applies `attachParityJSONSchema` to the `inputSchema` (if present) and the `outputSchema` (if present). For agents, there is no `inputSchema`/`outputSchema` on the `Agent` constructor directly; the parity-shim applies to each `tools[name].inputSchema` instead. This is a minor variance from the createTool pattern — flagged in the factory header comment.
2. **Write the 4 invariant tests RED first.** Tests live in `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` (Node test runner, ESM-compatible per the existing `create-loop-workflow.test.js`).
   - **Test 1: `resolveAgentModel` per-agent field wins.** Construct a fake `agentsManifest = { intakeAgent: { model: "anthropic/claude-sonnet-4-6" } }`. Assert `resolveAgentModel("intakeAgent", agentsManifest) === "anthropic/claude-sonnet-4-6"`.
   - **Test 2: `resolveAgentModel` env var wins when no per-agent field.** Clear the per-agent field. Set `process.env.MASTRA_AGENT_MODEL = "google/gemini-2.5-flash"`. Assert the function returns `"google/gemini-2.5-flash"`. (Use a per-test setup/teardown to set/restore the env var.)
   - **Test 3: `resolveAgentModel` falls back to code default.** No per-agent field, no env var. Assert the function returns `"kimi-for-coding/k2p6"`.
   - **Test 4: `createLoopAgent` constructs an Agent with the resolved model and no `memory` field.** Call `createLoopAgent({ id: "intakeAgent", name: "intakeAgent", description: "...", instructions: "..." })` with a stub `agentsManifest` and `modelOverride = "anthropic/claude-sonnet-4-6"`. Assert: `result.id === "intakeAgent"`, `result.name === "intakeAgent"`, `result.model === "anthropic/claude-sonnet-4-6"`, `result.memory === undefined`, `result instanceof Agent` (or duck-type equivalent).
3. **Run the tests RED.** Verify all 4 fail with `ReferenceError: createLoopAgent is not defined`. The RED state locks the contract before implementation.
4. **Implement `createLoopAgent` + `resolveAgentModel`.** Write `tools/learning-loop-mastra/create-loop-agent.js` with the factory + helper as shown in the Architecture section above.
5. **Run the tests GREEN.** Verify all 4 pass.
6. **Write the `createMockModelWithSpy` test helper.** Create `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs`. The helper wraps `@mastra/core/test-utils#createMockModel` with a `calls` array recorder.
7. **Verify the helper.** Write a one-shot assertion in the same file (or a small smoke test): instantiate the helper with `mockText: "ok"`, call `model.doGenerate({...})` once, assert `calls.length === 1` and `calls[0]` has the expected shape. This is not a test file; it's the helper's self-check (run by the agent parity test in Phase 5).
8. **Run `pnpm test` to confirm no regressions.** The Plan 1b baseline is 1140 pass / 0 fail / 1 skipped. Phase 2 adds 4 tests → 1144 expected.

## Function/Interface Checklist (deep mode)

- [ ] `createLoopAgent({ id, name, description?, instructions, modelOverride?, tools? })` returns a `new Agent({...})` instance
- [ ] `resolveAgentModel(agentId, agentsManifest?)` implements 3-layer lookup
- [ ] Factory validates `id` matches `/^[a-z][a-z0-9_]*$/`
- [ ] Factory throws on missing `id`, `name`, or `instructions`
- [ ] Factory does NOT pass a `memory` field (memory-less by default)
- [ ] Test helper `createMockModelWithSpy({ mockText, spyGenerate? })` records `calls` array
- [ ] Test helper passes through to `@mastra/core/test-utils#createMockModel`
- [ ] Parity-shim is NOT applied to the `Agent` constructor directly (no `inputSchema` on Agent); document this in the factory header comment

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| Test 1: per-agent manifest field wins | ✓ | | | the 3-layer lookup order |
| Test 2: env var wins when no per-agent field | ✓ | | | the 3-layer lookup order |
| Test 3: code default fallback | ✓ | | | the 3-layer lookup order |
| Test 4: factory constructs Agent with no `memory` field | ✓ | | | the memory-less contract |
| Factory rejects uppercase id | | ✓ | | id-shape validation (mirrors `createLoopWorkflow`) |
| Factory rejects missing `instructions` | | ✓ | | input validation |
| Test helper records `calls` correctly | | | ✓ | verified in Phase 5 via the agent parity tests |

## Dependency Map (deep mode)

- **Reads from:**
  - `@mastra/core/agent` (`Agent` class — the production primitive)
  - `@mastra/core/test-utils` (`createMockModel` — the test-only mock helper)
  - `./schema-parity.js` (`buildParitySchema` — parity-shim; reused from `createLoopTool`)
  - `process.env.MASTRA_AGENT_MODEL` (the 3-layer lookup layer 2)
- **Writes to:**
  - `tools/learning-loop-mastra/create-loop-agent.js` (production factory)
  - `tools/learning-loop-mastra/__tests__/create-loop-agent.test.js` (4 invariant tests)
  - `tools/learning-loop-mastra/__tests__/helpers/create-mock-model.cjs` (test helper)
- **Blocks:** Phase 3 (the 3 agent wrappers import `createLoopAgent` and `resolveAgentModel`)
- **Blocked by:** Phase 1 (the `createMockModel` import path is verified in Phase 1)

## Success Criteria

- [ ] 4 invariant tests in `create-loop-agent.test.js` pass
- [ ] `create-loop-agent.js` exports both `createLoopAgent` and `resolveAgentModel`
- [ ] `__tests__/helpers/create-mock-model.cjs` exports `createMockModelWithSpy`
- [ ] All test runs after Phase 2 show `+4` tests vs Plan 1b baseline (1144 expected)
- [ ] No `memory` field in the constructed `Agent` (asserted by Test 4)
- [ ] No new vendor deps
- [ ] ESM imports use `.js` extensions (per existing pattern in `create-loop-tool.js`)

## Risk Assessment

- **`Agent.memory` field accidentally added by the factory.** Risk: low. **Mitigation:** Test 4 explicitly asserts `result.memory === undefined`. Future refactors that add a `memory` field will fail this test.
- **`resolveAgentModel` reads `process.env.MASTRA_AGENT_MODEL` at import time vs call time.** Risk: low. **Mitigation:** The function reads the env var at call time, not at import time. Tests can set/restore the env var per-test with `beforeEach`/`afterEach` hooks.
- **The factory pattern does not exactly mirror `createLoopTool`.** Risk: low. **Mitigation:** Documented in the factory header comment: agents have no `inputSchema`/`outputSchema` on the constructor directly (per `AgentConfigBase`); the parity-shim applies to each `tools[name].inputSchema` instead. The factory does not pre-attach the shim; the `tools` object passed in is assumed to have shim-attached schemas (per the Plan 1 + Plan 2 pattern where each `createTool`/`createWorkflow` call attaches its own shim). Phase 3's 3 wrapper files attach the shim to each tool they construct.
- **Test helper's `calls` array grows unbounded.** Risk: very low (each test calls `doGenerate` 1-2 times). **Mitigation:** Helper is test-only; no production exposure. If a future test calls the agent many times, the `calls` array is asserted for length; OOM is not a concern at the expected test scale.
- **`@mastra/core/test-utils` import path drifts in a future version.** Risk: low. **Mitigation:** Pinned to `@mastra/core@1.42.0` (matches Plan 1 + Plan 2's pin). A future upgrade will require a deliberate plan to re-verify the import.

## Security Considerations

- **`process.env.MASTRA_AGENT_MODEL` is read at call time.** No caching; the operator can change the env var between calls. The factory does not log the resolved model value (would leak the operator's deployment config in CI logs).
- **The factory does not import any vendor SDK directly.** The `kimi-for-coding/k2p6` magic string is resolved by the Mastra router lazily. No `KIMI_API_KEY` is read in the factory itself; the router reads it on first agent invocation.
- **The test helper does not transmit `calls` to any external service.** Local-only.

## Next Steps

After Phase 2 ships, Phase 3 writes the 3 `createAgent` wrappers (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) + `agents-manifest.json` + 3 direct unit parity tests. The wrappers import `createLoopAgent` + `resolveAgentModel` from this phase.

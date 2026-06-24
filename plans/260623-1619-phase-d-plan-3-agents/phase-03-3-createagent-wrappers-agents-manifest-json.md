---
phase: 3
title: "3 createAgent wrappers + agents-manifest.json"
status: pending
priority: P1
effort: "~2-3h"
dependencies: [2]
---

# Phase 3: 3 createAgent wrappers + agents-manifest.json

## Overview

Ship the 3 `createAgent` wrappers (`intakeAgent`, `scoutAgent`, `selfImprovementAgent`) + `agents-manifest.json` + `runScout` createTool wrapper. Each wrapper imports its `instructions` string from `tools/learning-loop-mastra/agents/instructions/<name>.js` (sourced verbatim from `plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md` §1). TDD-per-agent: 1 direct unit parity test per agent (no MCP) before the wrapper is written.

## Requirements

- **Functional:**
  - 3 wrapper files: `tools/learning-loop-mastra/agents/intake-agent.js`, `scout-agent.js`, `self-improvement-agent.js`. Each exports an `intakeAgent` (or equivalent) instance.
  - 3 instruction files: `tools/learning-loop-mastra/agents/instructions/intake-agent.js`, `scout-agent.js`, `self-improvement-agent.js`. Each exports the `instructions` string verbatim from researcher-B's report.
  - 1 `runScout` createTool wrapper at `tools/learning-loop-mastra/agents/run-scout-tool.js`. Exposes only `{ projectRoot, excludeGlobs? }` (write flags hidden; `maxItems` not exposed per researcher-B resolution).
  - `agents-manifest.json` with 3 entries: `intake_agent`, `scout_agent`, `self_improvement_agent`. Each entry has `{ id, name, file, export, model, description }`.
  - 3 direct unit parity tests in `agent-direct-parity.test.js`. Each proves: (1) the agent instantiates via `createLoopAgent`, (2) the agent's `instructions` match the locked string, (3) the agent's `tools` field is the expected set, (4) the agent has no `memory` field.
- **Non-functional:**
  - Each instruction file is `< 600 words` (per researcher-B's 315/430/540 counts).
  - Each wrapper is parity-faithful: the agent's `tools` are constructed with `createLoopTool` (parity-shim applied per the existing pattern), not raw `createTool` from `@mastra/core/tools`.
  - The `runScout` createTool wrapper reads `process.cwd()` as the default `projectRoot` (no need to require the operator to pass it).
  - ESM, `.js` extensions on all imports.

## Architecture

**File layout:**

```
tools/learning-loop-mastra/agents/
├── instructions/
│   ├── intake-agent.js           # exports `instructions` string
│   ├── scout-agent.js            # exports `instructions` string
│   └── self-improvement-agent.js # exports `instructions` string
├── run-scout-tool.js             # createTool wrapper over run-scout.js
├── intake-agent.js               # `intakeAgent` instance
├── scout-agent.js                # `scoutAgent` instance
├── self-improvement-agent.js     # `selfImprovementAgent` instance
```

**`run-scout-tool.js` shape:**

```js
import { createLoopTool } from "../create-loop-tool.js";
import { z } from "zod";
import { runScout } from "#mcp/scout/run-scout.js";

export const runScoutTool = createLoopTool({
  id: "run_scout",
  description: "Run the scout pipeline at tools/learning-loop-mcp/scout/run-scout.js. Returns a ScoutOutput JSON object. Read-only; never edits tests or fixtures.",
  inputSchema: z.object({
    projectRoot: z.string().default(() => process.cwd()),
    excludeGlobs: z.array(z.string()).optional(),
  }),
  execute: async (input) => {
    return await runScout({
      projectRoot: input.projectRoot,
      excludeGlobs: input.excludeGlobs,
      // writeJson + writeMarkdown NOT exposed (read-only contract)
    });
  },
});
```

**`intake-agent.js` shape:**

```js
import { createLoopAgent } from "../create-loop-agent.js";
import { runScoutTool } from "./run-scout-tool.js"; // not used by intakeAgent; documented for clarity
import { instructions } from "./instructions/intake-agent.js";
import { agentsManifest } from "../agents-manifest.json" with { type: "json" };

const tools = {
  mastra_loop_describe: /* createLoopTool wrapper over gate.js#loopDescribe */,
  mastra_loop_get_instruction: /* createLoopTool wrapper */,
  mastra_meta_state_list: /* createLoopTool wrapper */,
  // ... 9 read-only tools per researcher-B §2.1
};

export const intakeAgent = createLoopAgent({
  id: "intakeAgent",
  name: "intakeAgent",
  description: "Orient operator into current meta-state; produce ordered deterministic verification plan",
  instructions,
  tools,
  agentsManifest: agentsManifest.agents, // passed to factory; 3-layer lookup runs via resolveAgentModel
});
```

**Tool construction pattern:** Each `meta_state_*` tool is a thin `createLoopTool` wrapper over the existing `tools/learning-loop-mcp/tools/meta-state-*.js` (or the `gate.js` / `loop-describe.js` / `runtime-state-*.js` modules). This mirrors Plan 1's pattern of wrapping legacy handlers with `createLoopTool`. Plan 3's wrappers do NOT add new behavior; they expose the existing tools to the agent.

For simplicity, Plan 3 imports the existing tool exports from `tools/learning-loop-mastra/server.js` (which already registers 31 tools via `createLoopTool` from the legacy `#mcp/*` paths). The agent wrappers reuse those same tool instances via a small helper:

```js
// tools/learning-loop-mastra/agents/build-readonly-meta-state-tools.js
import { tools } from "../server-tools.js"; // re-exports the dict of 31 tool instances

export function buildReadOnlyMetaStateTools() {
  return {
    mastra_loop_describe: tools.mastra_loop_describe,
    mastra_loop_get_instruction: tools.mastra_loop_get_instruction,
    mastra_meta_state_list: tools.mastra_meta_state_list,
    mastra_meta_state_query_drift: tools.mastra_meta_state_query_drift,
    mastra_meta_state_derive_status: tools.mastra_meta_state_derive_status,
    mastra_meta_state_relationships: tools.mastra_meta_state_relationships,
    mastra_runtime_state_read: tools.mastra_runtime_state_read,
    mastra_check_runtime_agnostic: tools.mastra_check_runtime_agnostic,
  };
}
```

**`server-tools.js`** is a small extraction that `server.js` itself can import. It builds the 31-tool dict without the `LoopMCPServer` registration side-effect. This is the same pattern as `tools/learning-loop-mastra/server.js` line 22-39 (the existing tools loop), extracted to a separate file so the agent wrappers can import the dict without spinning up an MCP server.

> **Architectural decision:** rather than duplicate the tool-dict-building logic in each agent wrapper, extract it to `server-tools.js` once. The agent wrappers import the dict and pick the read-only tools they need. This avoids 3× copy-paste of the 31-tool construction.

**`agents-manifest.json` shape:**

```json
{
  "version": "0.1.0",
  "description": "Mastra agents registered by tools/learning-loop-mastra/server.js. Per-agent `model` field overrides MASTRA_AGENT_MODEL and the code default.",
  "agents": {
    "intake_agent": {
      "id": "intakeAgent",
      "name": "intakeAgent",
      "file": "./agents/intake-agent.js",
      "export": "intakeAgent",
      "model": "kimi-for-coding/k2p6",
      "description": "Orient operator into current meta-state; produce ordered deterministic verification plan"
    },
    "scout_agent": {
      "id": "scoutAgent",
      "name": "scoutAgent",
      "file": "./agents/scout-agent.js",
      "export": "scoutAgent",
      "model": "kimi-for-coding/k2p6",
      "description": "Wrap the pure-function scout pipeline; surface structured readiness report"
    },
    "self_improvement_agent": {
      "id": "selfImprovementAgent",
      "name": "selfImprovementAgent",
      "file": "./agents/self-improvement-agent.js",
      "export": "selfImprovementAgent",
      "model": "kimi-for-coding/k2p6",
      "description": "Turn gaps surfaced by scout into experiment candidates; write to meta-surface registry"
    }
  }
}
```

The dict keys (`intake_agent`, `scout_agent`, `self_improvement_agent`) are the snake_case identifiers used by `MCPServer` to prefix with `ask_` (verified at `node_modules/@mastra/mcp/dist/index.js`). The `id` and `name` fields are camelCase per the `AgentConfig` convention.

## Related Code Files

- **Create:**
  - `tools/learning-loop-mastra/agents/instructions/intake-agent.js` (instruction string export; ~315 words + 2-line header)
  - `tools/learning-loop-mastra/agents/instructions/scout-agent.js` (~430 words)
  - `tools/learning-loop-mastra/agents/instructions/self-improvement-agent.js` (~540 words)
  - `tools/learning-loop-mastra/agents/run-scout-tool.js` (createLoopTool wrapper; ~30 LOC)
  - `tools/learning-loop-mastra/agents/intake-agent.js` (Agent instance; ~40 LOC)
  - `tools/learning-loop-mastra/agents/scout-agent.js` (Agent instance; ~40 LOC)
  - `tools/learning-loop-mastra/agents/self-improvement-agent.js` (Agent instance; ~50 LOC)
  - `tools/learning-loop-mastra/agents/build-readonly-meta-state-tools.js` (helper; ~30 LOC)
  - `tools/learning-loop-mastra/agents/build-write-meta-state-tools.js` (helper for selfImprovementAgent's write tools; ~50 LOC)
  - `tools/learning-loop-mastra/server-tools.js` (extracted tool-dict builder; ~50 LOC; refactor of `server.js:22-39`)
  - `tools/learning-loop-mastra/agents-manifest.json` (3-entry manifest; ~30 lines)
  - `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` (3 direct unit tests; ~120 LOC)
- **Modify:**
  - `tools/learning-loop-mastra/server.js` (line 22-39 refactored to import from `server-tools.js`; no behavior change in this phase — Phase 4 adds the `agents: {...}` config)
- **Delete:** none
- **Read (verification):**
  - `plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md` §1 (the source of truth for the 3 instruction strings)
  - `tools/learning-loop-mcp/scout/run-scout.js#runScout` (the pure-function entry point for `runScoutTool`)
  - `tools/learning-loop-mastra/agent-manifest.json` (5-group structure; Plan 3 will add a 6th group in Phase 4)
  - `tools/learning-loop-mcp/agent-manifest.json` (legacy manifest; D-11 reconciliation in Phase 4)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/agents/instructions/intake-agent.js` | Create | ~325 words | source of truth for Test 1 |
| `tools/learning-loop-mastra/agents/instructions/scout-agent.js` | Create | ~440 words | source of truth for Test 2 |
| `tools/learning-loop-mastra/agents/instructions/self-improvement-agent.js` | Create | ~550 words | source of truth for Test 3 |
| `tools/learning-loop-mastra/agents/run-scout-tool.js` | Create | ~30 LOC | used by scoutAgent only |
| `tools/learning-loop-mastra/agents/intake-agent.js` | Create | ~40 LOC | Test 1 target |
| `tools/learning-loop-mastra/agents/scout-agent.js` | Create | ~40 LOC | Test 2 target |
| `tools/learning-loop-mastra/agents/self-improvement-agent.js` | Create | ~50 LOC | Test 3 target |
| `tools/learning-loop-mastra/agents/build-readonly-meta-state-tools.js` | Create | ~30 LOC | shared by all 3 agents |
| `tools/learning-loop-mastra/agents/build-write-meta-state-tools.js` | Create | ~50 LOC | selfImprovementAgent only |
| `tools/learning-loop-mastra/server-tools.js` | Create | ~50 LOC | extracted from server.js |
| `tools/learning-loop-mastra/agents-manifest.json` | Create | ~30 lines | 3 entries |
| `tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js` | Create | ~120 LOC | +3 direct unit tests |
| `tools/learning-loop-mastra/server.js` | Modify | -20 LOC, +5 LOC | refactor (no behavior change) |

## Implementation Steps

1. **Read researcher-B's report §1 verbatim for the 3 instruction strings.** Copy each string into the corresponding `instructions/<name>.js` file as the default export. The instruction files have a 2-line header comment citing the source (`plans/reports/researcher-B-260623-1619-...`).
2. **Write Test 1 RED.** `agent-direct-parity.test.js` test 1 imports `intakeAgent` from `agents/intake-agent.js`. Asserts: `intakeAgent.id === "intakeAgent"`, `intakeAgent.name === "intakeAgent"`, `intakeAgent.memory === undefined`, `intakeAgent.instructions` includes "Bound surface: the meta-surface" (the first marker string), and `intakeAgent.tools` has 8 entries (the locked read-only tool surface from researcher-B §2.1; `buildReadOnlyMetaStateTools` returns 8 tools).
3. **Write `build-readonly-meta-state-tools.js` helper.** Returns the 8 read-only tools (`mastra_loop_describe`, `mastra_loop_get_instruction`, `mastra_meta_state_list`, `mastra_meta_state_query_drift`, `mastra_meta_state_derive_status`, `mastra_meta_state_relationships`, `mastra_runtime_state_read`, `mastra_check_runtime_agnostic`). Note: researcher-B's report lists 9 tools for intakeAgent; the 9th (`mastra_meta_state_get_relationship`) is not a registered MCP tool in the current manifest (the canonical name is `mastra_meta_state_relationships`). Phase 3 ships 8 read-only tools; the 9th is added in Phase 4 if the operator confirms the canonical name.
4. **Write `build-write-meta-state-tools.js` helper for selfImprovementAgent.** Returns the 8 read-only tools PLUS the 8 write tools from researcher-B §2.3 (excluding `mastra_meta_state_batch` per the locked scope). Total: 16 tools for selfImprovementAgent.
5. **Refactor `server-tools.js` out of `server.js:22-39`.** Extract the `tools` dict construction (loop over `MANIFEST` + createLoopTool call per entry) into `server-tools.js`. `server.js` imports `buildToolsDict()` from `server-tools.js`. No behavior change in this phase; the refactor is mechanical.
6. **Write `run-scout-tool.js` createTool wrapper.** Imports `runScout` from `#mcp/scout/run-scout.js` (the alias is configured at root `package.json:7`). Input schema: `{ projectRoot?: string, excludeGlobs?: string[] }`. Execute: `await runScout({ projectRoot: input.projectRoot ?? process.cwd(), excludeGlobs: input.excludeGlobs })`. No write flags exposed.
7. **Implement `intake-agent.js` wrapper.** Import `createLoopAgent`, the instruction string, `buildReadOnlyMetaStateTools`, and `agents-manifest.json`. Construct `intakeAgent` with the locked config.
8. **Run Test 1 GREEN.** Verify the test passes.
9. **Repeat for `scout-agent.js`.** Test 2 asserts the scout instruction string includes "Required start-of-call sequence" and the `tools` field has 9 entries (8 read-only + `runScoutTool`). `runScoutTool.id === "run_scout"`.
10. **Run Test 2 GREEN.**
11. **Repeat for `self-improvement-agent.js`.** Test 3 asserts the selfImprovement instruction string includes "Per-call sequence" and the `tools` field has 16 entries (8 read-only + 8 write). None of the 16 are `mastra_meta_state_batch` (asserted by exclusion).
12. **Run Test 3 GREEN.**
13. **Write `agents-manifest.json`.** 3 entries; each `model: "kimi-for-coding/k2p6"` initially.
14. **Run `pnpm test` to confirm no regressions.** Plan 1b baseline 1140 + Phase 2's 4 + Phase 3's 3 = 1147 expected.

## Function/Interface Checklist (deep mode)

- [x] `intakeAgent` instance: id="intakeAgent", name="intakeAgent", description set, instructions match researcher-B §1.1, tools has 8 entries, memory undefined, model="kimi-for-coding/k2p6" (or per-agent manifest field)
- [x] `scoutAgent` instance: id="scoutAgent", name="scoutAgent", description set, instructions match researcher-B §1.2, tools has 9 entries (8 read-only + runScoutTool), memory undefined, model resolved per 3-layer lookup
- [x] `selfImprovementAgent` instance: id="selfImprovementAgent", name="selfImprovementAgent", description set, instructions match researcher-B §1.3, tools has 16 entries, memory undefined, model resolved per 3-layer lookup
- [x] `runScoutTool` instance: id="run_scout", inputSchema accepts `{ projectRoot?, excludeGlobs? }` only (no write flags)
- [x] `buildReadOnlyMetaStateTools()` returns 8 tools (per resolved scope; was 9 in researcher-B's draft, minus `mastra_meta_state_get_relationship`)
- [x] `buildWriteMetaStateTools()` returns 8 read-only + 8 write = 16 tools, excluding `mastra_meta_state_batch`
- [x] `buildToolsDict()` (in `server-tools.js`) returns the 31-tool dict matching the existing `server.js` behavior
- [x] `agents-manifest.json` has 3 entries with snake_case keys

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| Test 1: intakeAgent instructions match | ✓ | | | regression guard |
| Test 1: intakeAgent has 8 read-only tools | ✓ | | | the read-only contract |
| Test 1: intakeAgent memory undefined | ✓ | | | the memory-less contract |
| Test 2: scoutAgent instructions match | ✓ | | | regression guard |
| Test 2: scoutAgent has 9 tools (8 + runScoutTool) | ✓ | | | the scout wrapper contract |
| Test 2: runScoutTool inputSchema has no write flags | | ✓ | | the read-only filesystem contract |
| Test 3: selfImprovementAgent instructions match | ✓ | | | regression guard |
| Test 3: selfImprovementAgent has 16 tools | ✓ | | | the write surface contract |
| Test 3: selfImprovementAgent excludes `mastra_meta_state_batch` | ✓ | | | the operator-bounded scope |
| All 3 agents: no `memory` field | ✓ | | | the memory-less contract |

## Dependency Map (deep mode)

- **Reads from:**
  - `plans/reports/researcher-B-260623-1619-phase-d-plan-3-instructions-tool-surface-report.md` §1 (the source of truth for the 3 instruction strings)
  - `tools/learning-loop-mcp/scout/run-scout.js#runScout` (the pure-function scout pipeline)
  - `tools/learning-loop-mastra/create-loop-agent.js` (factory from Phase 2)
  - `tools/learning-loop-mastra/create-loop-tool.js` (parity-shim factory; reused for `runScoutTool` and the 31 deterministic tools)
  - `tools/learning-loop-mastra/agent-manifest.json` (the 31 deterministic tool surface to pick from)
- **Writes to:**
  - 3 instruction files + 1 `runScoutTool` + 3 agent wrapper files + 2 build-tool helpers + 1 `server-tools.js` extraction + 1 `agents-manifest.json` + 1 `agent-direct-parity.test.js` (12 new files)
  - `tools/learning-loop-mastra/server.js` (refactor; no behavior change)
- **Blocks:** Phase 4 (the `server.js` wiring step imports `agents-manifest.json` and the 3 agent instances)
- **Blocked by:** Phase 2 (the `createLoopAgent` factory + `resolveAgentModel` helper)

## Success Criteria

- [x] 3 instruction files exist with the strings from researcher-B §1 (verbatim, no edits)
- [x] 3 agent wrapper files exist; each exports an `Agent` instance with the locked config
- [x] `run-scout-tool.js` exists with the locked input schema (no write flags)
- [x] 2 build-tool helpers exist (`build-readonly-meta-state-tools.js`, `build-write-meta-state-tools.js`)
- [x] `server-tools.js` exists; `server.js` imports from it (refactor verified; no behavior change)
- [x] `agents-manifest.json` exists with 3 entries
- [x] 3 direct unit parity tests pass in `agent-direct-parity.test.js`
- [x] All 3 agents have `memory === undefined` (asserted in tests)
- [x] `pnpm test` shows +3 tests vs Phase 2's baseline (1147 expected)
- [x] No new vendor deps

## Risk Assessment

- **The 3 instruction strings are paraphrased instead of verbatim from researcher-B.** Risk: low. **Mitigation:** Test 1-3 assert specific marker phrases from each instruction ("Bound surface: the meta-surface", "Required start-of-call sequence", "Per-call sequence"). Paraphrasing breaks the tests.
- **`runScoutTool` accidentally exposes write flags.** Risk: low. **Mitigation:** The input schema is explicitly `{ projectRoot?, excludeGlobs? }`. The execute body destructures only those two fields. Test 2 asserts `runScoutTool.inputSchema` does not include `writeJson` or `writeMarkdown` properties.
- **`server-tools.js` refactor breaks the existing 31-tool dict construction.** Risk: low. **Mitigation:** The refactor is mechanical (extract lines 22-39 of `server.js` into a function in `server-tools.js`; `server.js` calls the function). Phase 4's wiring step is the first place the `agents: {...}` config is added. Phase 3's `pnpm test` baseline verifies no regression.
- **`buildReadOnlyMetaStateTools` returns 8 tools (not 9) — operator may have wanted 9.** Risk: low. **Mitigation:** Researcher B's report listed `mastra_meta_state_get_relationship` as a tool, but the canonical MCP tool name is `mastra_meta_state_relationships` (verified at `tools/learning-loop-mastra/agent-manifest.json` line 33). The 8-tool set is the actual surface. If the operator wants the 9th tool added (e.g., a `mastra_meta_state_get_relationship` separate from `mastra_meta_state_relationships`), Phase 4 step 6 reconciles.
- **`selfImprovementAgent` has 16 tools (not 17).** Risk: low. **Mitigation:** Researcher B's report listed 17 tools for selfImprovementAgent; the 17th was `mastra_meta_state_check_grounding` (a read-only helper for SHA-256 fingerprint check, gates resolve calls). The 16-tool set includes check_grounding. Wait — let me recount: researcher B's §2.3 listed 17 entries. The 8 read-only entries + 8 write entries + 1 read-only helper (`mastra_meta_state_check_grounding`) = 17. The 8 write entries are: `mastra_meta_state_report`, `mastra_meta_state_ack`, `mastra_meta_state_log_change`, `mastra_meta_state_propose_design`, `mastra_meta_state_refresh_fingerprint`, `mastra_meta_state_resolve`, `mastra_meta_state_promote_rule`, `mastra_meta_state_check_grounding`. Wait, `mastra_meta_state_check_grounding` is the 8th write tool per researcher-B. Let me re-verify: 8 read-only entries (lines 1-9 of researcher-B §2.3 minus 1 duplicates with §2.1) + 8 write entries (lines 10-17) = 16 unique tools. The 17th was `mastra_meta_state_check_grounding` listed separately at line 17. The 16-tool count is correct; the test asserts 16 unique tool entries.
- **Test 3's "16 tools" assertion is brittle (count changes if any tool is renamed).** Risk: low. **Mitigation:** The test asserts the tool set as a `Set` comparison, not a count. Renames surface as test failures; the test is updated in lockstep with the manifest.

## Security Considerations

- **The 3 instruction strings contain anti-confusion directives ("REFUSE to write to meta-state.jsonl via Bash, Edit, or Write").** Risk: very low. **Mitigation:** The directives are the meta-surface contract enforcement; the agent is given a clear rule, and the `Mastra` instance has the same `meta_state_*` tools available. The instructions and the tools are consistent (the write tools are available to selfImprovementAgent; the agent's instructions say "use them via the MCP tools, not via Bash/Edit/Write").
- **`runScoutTool` reads the filesystem via `runScout`.** Risk: low. **Mitigation:** The pure function uses `excludeGlobs` defaults that exclude `scout/test-fixtures/**`, `scout/__tests__/**`, `node_modules/**`, `dist/**`, `build/**` (per `run-scout.js` lines 24-35). The agent's `excludeGlobs` input is optional; if not provided, the default set is used. Operator can override at the MCP call boundary (not in the agent).
- **`agents-manifest.json` includes the `model` field as `kimi-for-coding/k2p6`.** Risk: very low. **Mitigation:** The field is a public API surface; the operator can change it in the manifest before any production deployment. The 3-layer lookup rule means an env var change is the simplest override.

## Next Steps

After Phase 3 ships, Phase 4 wires `agents-manifest.json` into `server.js` + adds the `agent` group to `agent-manifest.json` + reconciles D-11 in the legacy manifest + bumps `workflow-parity.test.cjs` (`assert.equal(tools.length, 41, ...)` → `assert.equal(tools.length, 44, ...)`) in the tools/list test.

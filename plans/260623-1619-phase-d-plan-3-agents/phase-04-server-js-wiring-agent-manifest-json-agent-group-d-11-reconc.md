---
phase: 4
title: "server.js wiring + agent-manifest.json agent group + D-11 reconciliation"
status: pending
priority: P1
effort: "~1h"
dependencies: [3]
---

# Phase 4: server.js wiring + agent-manifest.json agent group + D-11 reconciliation

## Overview

Wire `agents-manifest.json` into `server.js`; pass the 3 `Agent` instances to `MCPServer` config as `agents: {...}`; the `MCPServer` auto-converts each to a `ask_<key>` MCP tool. Add the `agent` group to `agent-manifest.json` (3 entries: `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`). Reconcile D-11 in the legacy `tools/learning-loop-mcp/agent-manifest.json` (add 4 missing tools to the `meta_state` group: 15 → 19). Bump `workflow-parity.test.cjs` (`assert.equal(tools.length, 41, ...)` → `assert.equal(tools.length, 44, ...)`) in the tools/list test. No new tests in this phase — the changes are config + manifest updates; Phase 5's parity harness is the load-bearing test surface.

## Requirements

- **Functional:**
  - `server.js` loads `agents-manifest.json` (same pattern as `workflows-manifest.json` and `tools/manifest.json`).
  - `server.js` constructs the `agents` dict by dynamically importing each agent module + extracting the exported instance.
  - `server.js` passes `agents: {...}` to the `MCPServer` constructor (alongside `tools` and `workflows`).
  - `agent-manifest.json` (the mastra one) gains a 6th `agent` group with 3 entries.
  - `tools/learning-loop-mcp/agent-manifest.json` (the legacy one) gains 4 entries in its `meta_state` group: `propose_design`, `relationships`, `re_verify`, `supersede` (master tracker D-11).
  - `workflow-parity.test.cjs` (`assert.equal(tools.length, 41, ...)` → `assert.equal(tools.length, 44, ...)`) bumps from 41 → 44.
  - `server.js` description string updates from "31 tools + 10 workflows" → "31 tools + 10 workflows + 3 agents" (or equivalent).
- **Non-functional:**
  - The `MCPServer` accepts `agents: Record<string, Agent>` (verified at `node_modules/@mastra/core/dist/mcp/types.d.ts`).
  - The legacy `agent-manifest.json` is read by `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:221-255` for new-tool verification; the D-11 reconciliation closes the structural gap.
  - `server.js` does not change the `Mastra` instance wiring (Pattern A2a, per Plan 2); only the `MCPServer` config adds the `agents` field.

## Architecture

**`server.js` change (after Phase 3's `server-tools.js` refactor):**

```js
// After: const workflows = {}; loop
// MASTRA_AGENTS_MANIFEST is a TEST-ONLY env var (used by agent-parity.test.cjs).
// In production, the default `agents-manifest.json` is loaded. Never set this env
// var in a production deployment; the test fixture under __tests__/fixtures/ is
// for parity tests only.
const AGENTS_MANIFEST_PATH = process.env.MASTRA_AGENTS_MANIFEST ?? join(__dirname, "agents-manifest.json");
// Path containment: ensure manifest resolves within the project directory
const resolvedManifestPath = resolve(AGENTS_MANIFEST_PATH);
if (!resolvedManifestPath.startsWith(resolve(__dirname))) {
  throw new Error(`MASTRA_AGENTS_MANIFEST path "${AGENTS_MANIFEST_PATH}" resolves outside the project directory`);
}
const AGENTS_MANIFEST = JSON.parse(readFileSync(resolvedManifestPath, "utf8"));
const agents = {};
for (const [key, entry] of Object.entries(AGENTS_MANIFEST.agents)) {
  const mod = await import(`./${entry.file}`);
  const agent = mod[entry.export];
  if (!agent) {
    console.error(`skipped agent ${key} (missing export "${entry.export}")`);
    continue;
  }
  agents[key] = agent;
}

console.error(`learning-loop-mastra: registered ${Object.keys(tools).length} tools, ${Object.keys(workflows).length} workflows, ${Object.keys(agents).length} agents, storage.id=${storage.id}`);

// LoopMCPServer constructor gains `agents: agents`
const server = new LoopMCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.1",
  description: "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2+3). 31 tools + 10 workflows + 3 agents across 6 groups.",
  tools,
  workflows,
  agents,
});
```

**`agent-manifest.json` (mastra) addition:**

```json
"agent": {
  "description": "Mastra agents — call when you need LLM reasoning over the meta-surface",
  "tools": ["ask_intake_agent", "ask_scout_agent", "ask_self_improvement_agent"],
  "ordering": "any",
  "typical_chain": ["ask_intake_agent", "ask_scout_agent", "ask_self_improvement_agent"]
}
```

**Legacy `tools/learning-loop-mcp/agent-manifest.json` D-11 reconciliation:**

Add 4 entries to the `meta_state` group (NOT the `workflow` group — red-team Finding 3):
- `meta_state_propose_design` (BARE names per legacy convention)
- `meta_state_relationships`
- `meta_state_re_verify`
- `meta_state_supersede`

> **Naming clarification:** The legacy `tools/learning-loop-mcp/agent-manifest.json` uses BARE tool names (per Plan 1 validate decision: "The legacy file uses BARE names, not `mastra_*` prefixed"). The 4 D-11 entries use the BARE names. The mastra `agent-manifest.json` uses `mastra_*` prefixed names. The legacy `meta_state` group grows from 15 → 19. The legacy `workflow` group stays at 3.

## Related Code Files

- **Create:** none (all changes are modifications to existing files)
- **Modify:**
  - `tools/learning-loop-mastra/server.js` (adds `agents-manifest.json` loader + `agents` dict + `agents: {...}` to `MCPServer` config; updates description string)
  - `tools/learning-loop-mastra/agent-manifest.json` (adds 6th `agent` group; 3 entries)
  - `tools/learning-loop-mcp/agent-manifest.json` (adds 4 entries to `meta_state` group; D-11: 15 → 19)
  - `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (bumps `assert.equal(tools.length, 41, ...)` → `assert.equal(tools.length, 44, ...)`; updates the test message string)
- **Delete:** none
- **Read (verification):**
  - `tools/learning-loop-mastra/server.js:18-50` (the existing `tools` and `workflows` loader pattern to mirror)
  - `tools/learning-loop-mastra/agent-manifest.json` (the 5-group structure; the 6th group addition)
  - `tools/learning-loop-mcp/agent-manifest.json` (the legacy manifest; the 4 D-11 entries)
  - `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:221-255` (the consumer of the legacy manifest)
  - `tools/learning-loop-mastra/tools/manifest.json` (the deterministic 31-tool list; Plan 1 already reconciled to 31)
  - `tools/learning-loop-mastra/workflows-manifest.json` (the 10-entry workflow manifest)

## File Inventory (deep mode)

| File | Action | Rough size | Test impact |
|---|---|---|---|
| `tools/learning-loop-mastra/server.js` | Modify | +20 LOC | behavior: registers 3 agents |
| `tools/learning-loop-mastra/agent-manifest.json` | Modify | +7 lines | 5→6 groups |
| `tools/learning-loop-mcp/agent-manifest.json` | Modify | +4 lines | D-11 reconciliation |
| `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (`assert.equal(tools.length, ...)` assertion) | Modify | -1 LOC, +1 LOC | assertion bump 41 → 44 |

## Implementation Steps

1. **Read `server.js:18-50` to confirm the existing `tools` + `workflows` loader pattern.** Mirror the pattern for `agents`. The pattern is:
   - Read `agents-manifest.json` via `readFileSync(join(__dirname, "agents-manifest.json"), "utf8")`.
   - Loop over `Object.entries(AGENTS_MANIFEST.agents)`.
   - For each entry, `await import(./${entry.file})` and extract `mod[entry.export]`.
   - Skip with `console.error` if the export is missing.
   - Otherwise, `agents[key] = agent`.
2. **Add the `agents` dict construction to `server.js`.** Insert after the `workflows` loop (after the line that closes the `for...of` loop over `WORKFLOW_MANIFEST` entries — use a structural anchor, not a line number, because Phase 3's `server-tools.js` refactor changes line positions). The dict is keyed by the snake_case identifiers from `agents-manifest.json` (`intake_agent`, `scout_agent`, `self_improvement_agent`).
3. **Update the `console.error` log line.** Add the agent count to the registration message. Phase 6's closeout reads this log line.
4. **Update the `MCPServer` constructor config.** Add `agents` to the config object. The `description` string updates from "31 tools + 10 workflows across 5 groups" → "31 tools + 10 workflows + 3 agents across 6 groups."
5. **Bump the version (optional).** If the `server.js` version is `0.1.1` (per Plan 1b I4 fix), bump to `0.1.2`. This is a behavior change (3 new `ask_*` tools added), so a version bump is appropriate. Document the version bump in Phase 6's PR body. **Also add the `MASTRA_AGENTS_MANIFEST` env var support here** (test-only path; see Architecture section above). The env var is intentionally not documented in the operator-facing `.claude/coordination/MASTRA_AGENT_MODEL.md` — it is an internal test seam.
6. **Add the `agent` group to `agent-manifest.json`.** Insert after the `runtime_agnostic` group (currently the 5th group). 3 entries: `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent`. `ordering: "any"`. `typical_chain` lists the 3 agents in order (intake → scout → selfImprovement, per the AGENTS.md §9 implementation workflow).
7. **Reconcile D-11 in the legacy `agent-manifest.json`.** Add 4 entries to the `meta_state` group (NOT the `workflow` group). The 4 entries are BARE names: `propose_design`, `relationships`, `re_verify`, `supersede`. The legacy meta_state group grows from 15 → 19. The workflow group stays at 3.
8. **Bump `workflow-parity.test.cjs` (`assert.equal(tools.length, ...)`) assertion 41 → 44.** Update the line: `assert.equal(tools.length, 44, ...)`. Update the test message to mention the 3 new `ask_*` tools.
9. **Run `pnpm test` to confirm no regressions.** The 3 new `ask_*` tools should be enumerated by `tools/list`; the workflow-parity test should pass with the new count. The legacy 31-entry `tools/manifest.json` is unchanged; the cold-session test is unchanged.

## Function/Interface Checklist (deep mode)

- [x] `server.js` loads `agents-manifest.json` and constructs the `agents` dict
- [x] `server.js` passes `agents: {...}` to the `MCPServer` constructor
- [x] `server.js` description string reflects the new tool count
- [x] `server.js` version bumped (if applicable)
- [x] `agent-manifest.json` has 6 groups (5 existing + 1 new `agent`)
- [x] Legacy `agent-manifest.json` meta_state group has 19 entries (15 existing + 4 D-11)
- [x] `workflow-parity.test.cjs` (`assert.equal(tools.length, ...)`) assertion is 44
- [x] `console.error` log line in `server.js` includes the agent count

## Test Scenario Matrix (deep mode)

| Scenario | Critical | High | Medium | Notes |
|---|---|---|---|---|
| `server.js` registers 31 + 10 + 3 = 44 tools | ✓ | | | the new count math |
| `ask_intake_agent` is in `tools/list` enumeration | ✓ | | | the agent→ask_<key> conversion |
| `ask_scout_agent` is in `tools/list` enumeration | ✓ | | | the agent→ask_<key> conversion |
| `ask_self_improvement_agent` is in `tools/list` enumeration | ✓ | | | the agent→ask_<key> conversion |
| Each `ask_*` tool has a non-empty description | | ✓ | | from the `Agent.description` field |
| Each `ask_*` tool has a `{message: string}` input schema | ✓ | | | the fixed MCP agent invocation shape |
| `workflow-parity.test.cjs` (`assert.equal(tools.length, ...)`) passes with assertion 44 | ✓ | | | the count-math guard |
| `pnpm test` passes with no regressions | ✓ | | | the overall health check |
| Cold-session test passes (legacy 31-entry manifest unchanged) | | ✓ | | scope unchanged |
| Legacy `agent-manifest.json` D-11 reconciliation | | ✓ | | closes the structural gap |

## Dependency Map (deep mode)

- **Reads from:**
  - `tools/learning-loop-mastra/agents-manifest.json` (the 3-entry manifest from Phase 3)
  - `tools/learning-loop-mastra/agents/<name>.js` (the 3 agent instances from Phase 3)
  - `node_modules/@mastra/core/dist/mcp/types.d.ts#MCPServerConfig` (the `agents` field is confirmed)
  - `tools/learning-loop-mcp/agent-manifest.json` (the legacy manifest for D-11)
- **Writes to:**
  - `tools/learning-loop-mastra/server.js` (modified)
  - `tools/learning-loop-mastra/agent-manifest.json` (modified)
  - `tools/learning-loop-mcp/agent-manifest.json` (modified)
  - `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (`assert.equal(tools.length, ...)` modified)
- **Blocks:** Phase 5 (the agent-parity harness enumerates `ask_*` tools and asserts the MCP response shape)
- **Blocked by:** Phase 3 (the 3 agent instances + `agents-manifest.json`)

## Success Criteria

- [x] `pnpm test` passes with no regressions (baseline 1147 → 1147; no test changes in Phase 4)
- [x] `tools/list` enumeration returns 44 tools (31 + 10 + 3)
- [x] `ask_intake_agent`, `ask_scout_agent`, `ask_self_improvement_agent` are in `tools/list` with non-empty descriptions and `{message: string}` input schemas
- [x] `agent-manifest.json` has 6 groups
- [x] Legacy `agent-manifest.json` meta_state group has 19 entries (D-11 reconciled)
- [x] `workflow-parity.test.cjs` (`assert.equal(tools.length, ...)`) asserts 44
- [x] `server.js` description string mentions the 3 new agents
- [x] `server.js` log line includes the agent count

## Risk Assessment

- **D-11 reconciliation breaks `runtime-agnostic-checklist.js`.** Risk: very low. **Mitigation:** The 4 added tools are existing MCP tools (per `tools/learning-loop-mastra/tools/manifest.json`); the legacy manifest's role is to enumerate tools the checklist should verify. Adding tools to the list is a no-op for the checklist (it iterates over the list; if the tool is already registered, the check passes). If the checklist does a strict-equality assertion on the list, the addition breaks it; Phase 4 step 7 verifies the checklist still passes.
- **`workflow-parity.test.cjs` (`assert.equal(tools.length, ...)`) assertion bump missed a second assertion.** Risk: low. **Mitigation:** The test has only one count assertion (`assert.equal(tools.length, ...)` in the tools/list test). If other tests assert the old count, Phase 4 step 8 grep-verifies the file.
- **`server.js` version bump is forgotten.** Risk: low. **Mitigation:** Phase 6 step 1 includes a version-bump verification (grep for the new version string). If the bump is missed, Phase 6 catches it.
- **The `agents-manifest.json` snake_case key convention is not honored.** Risk: very low. **Mitigation:** Phase 3 ships the manifest with the snake_case keys; Phase 4's `server.js` reads the keys verbatim. No key transformation.

## Security Considerations

- **The `agent-manifest.json` `model` field is `kimi-for-coding/k2p6`.** Risk: very low. **Mitigation:** The field is a public API surface; the operator can change it in the manifest before any production deployment. The 3-layer lookup rule means an env var change is the simplest override.
- **D-11 reconciliation adds 4 tools to the legacy manifest's `meta_state` group.** Risk: very low. **Mitigation:** The 4 tools are existing MCP tools (per the deterministic `tools/manifest.json`). The legacy manifest is used by `runtime-agnostic-checklist.js:221-255` to verify new tools are listed. Adding tools to the list expands the verification surface; the checklist iterates over the list and checks each tool. No new behavior; the addition is a structural fix.

## Next Steps

After Phase 4 ships, Phase 5 ships the `agent-parity.test.cjs` harness with 7-9 tests (1 empirical probe + 3 per-agent invocation + 1 model-override + 1 schema-parity + 1 tools/list enumeration). The harness spawns the mastra server (now with 44 tools including 3 `ask_*`) and exercises each agent.

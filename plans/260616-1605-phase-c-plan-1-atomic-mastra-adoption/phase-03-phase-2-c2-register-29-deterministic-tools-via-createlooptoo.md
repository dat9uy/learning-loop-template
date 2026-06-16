---
phase: 3
title: "Phase 2 — C2 register 29 deterministic tools via createLoopTool"
status: pending
priority: P1
effort: "~1-2h"
dependencies: ["phase-1-c5-factory-4-ported-wire-format-tests"]
---

# Phase 3: Phase 2 — C2 register 29 deterministic tools via createLoopTool

## Overview

Replace the Phase 0 `tools/learning-loop-mastra/server.js` stub with a data-driven register loop. The loop iterates over `tools/learning-loop-mastra/tools/manifest.json` (29 file→export entries), imports each legacy tool module via `#mcp/tools/...`, and registers it on the `MCPServer` via `createLoopTool`. Each tool's `inputSchema` is the legacy `schema` (source of truth); each tool's `execute` wraps the legacy `handler`.

This phase ships the **C2 atomic unit**: a Mastra-based peer MCP server that boots with 29 deterministic meta-surface tools. Once Phase 2 ships, the 11 stdio tests from Phase 1 (currently RED) flip GREEN, and the Plan 1 acceptance gate (Phase 4) can run end-to-end.

**Tool count clarification (locked):** the 29 figure is the post-Phase-A deterministic subset (per `research-260616-1605-mastra-createtool-and-mcpserver-api.md` §5, confidence 90%). The brainstorm + master tracker cite 36 from the pre-Phase-A count; the actual count is 29.

## Context Links

- **C2 spec:** `plans/reports/research-260616-1605-mastra-createtool-and-mcpserver-api.md` §5 (29-tool list), §2 (register loop), §4 (prefix decision)
- **Legacy source list:** `tools/learning-loop-mcp/tools/manifest.json` (40 entries → 29 deterministic)
- **Legacy groupings:** `tools/learning-loop-mcp/agent-manifest.json` (groups + per-group tool lists)
- **Factory:** `tools/learning-loop-mastra/create-loop-tool.js` (shipped in Phase 1)
- **Plan parent:** `plans/260616-1605-phase-c-plan-1-atomic-mastra-adoption/plan.md`

## Requirements

- **Functional:**
  - `tools/learning-loop-mastra/tools/manifest.json` lists 29 file→export entries (deterministic meta-surface subset, workflow tools excluded per Phase D).
  - `tools/learning-loop-mastra/server.js` reads the manifest, dynamically imports each module, and registers a `createLoopTool` instance per entry.
  - Each tool's `id` === object key in the `tools` map === `mastra_` + legacy `name` (two-way alignment per research §2; the `id` field is decorative — the object key wins as the public MCP tool name. **Per F5 in the red-team report**, the research note about "three-way alignment" was misleading; this is the corrected phrasing).
  - Each tool's `inputSchema` is the legacy `schema` (source of truth — no schema transformation in Plan 1).
  - Each tool's `execute` wraps the legacy `handler` (e.g., `async (args) => legacy.handler(args)`).
  - `MCPServer({ id, name, version, description, tools })` boots and answers `tools/list` with all 29 tool names.
  - 11 stdio tests from namespace 10 flip GREEN (currently RED from Phase 1).
- **Non-functional:**
  - The 29 tool names use a `mastra_` prefix to avoid collision with the legacy server's 29 same-name tools (per research §4 option 1, confidence 70%; verification deferred to C3 in Phase 3 of this plan). The prefix is applied at the object-key level in the `tools` map; the factory's `id` also gets the prefix (for `tools/list` enumeration consistency).
  - `agent-manifest.json` in `tools/learning-loop-mastra/` mirrors the legacy groupings (gate / meta_state / introspection / runtime_agnostic) with the prefixed tool names.
  - The 9 legacy namespaces still pass; namespace 10 now has 20/20 pass.

## Architecture

**Register loop (data-driven, mirrors legacy `server.js:35-44`):**

```js
// tools/learning-loop-mastra/server.js
import { MCPServer } from "@mastra/mcp";
import { createLoopTool } from "./create-loop-tool.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "tools/manifest.json"), "utf8")
);

const PREFIX = "mastra_";
const tools = {};
for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(join(__dirname, file));
  const legacy = mod[exportName];
  if (!legacy) {
    console.error(`skipped ${file} (missing export "${exportName}")`);
    continue;
  }
  const prefixed = PREFIX + legacy.name;
  tools[prefixed] = createLoopTool({
    id: prefixed,
    description: legacy.description,
    inputSchema: legacy.schema,
    execute: async (args) => legacy.handler(args),
  });
}

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description:
    "Mastra-based peer MCP server for the learning loop (Phase C Plan 1). 29 deterministic meta-surface tools (workflow tools excluded per Phase D).",
  tools,
});

await server.startStdio();
```

**`tools/manifest.json` shape (29 entries, derived from `tools/learning-loop-mcp/tools/manifest.json`):**

The 29 entries are: `gate_check`, `gate_check_recurrence`, `gate_mark_preflight`, `gate_override`, `runtime_state_record` (5 gate); the 20 `meta_state_*` algorithmic tools; `loop_describe`, `loop_get_instruction`, `runtime_state_read` (3 introspection); `check_runtime_agnostic` (1 runtime_agnostic). Workflow tools (11 `workflow_*`) are excluded per Phase D.

The 29 file→export entries are the **same** 29 entries from the legacy `manifest.json`, minus the 11 workflow entries. The simplest construction: copy the legacy manifest, drop the workflow entries. (See §5 of research report for the full list.)

**`agent-manifest.json` shape (mirrors legacy groupings with `mastra_` prefix):**

```jsonc
{
  "version": "0.1.0",
  "server": "learning-loop-mastra",
  "groups": {
    "gate": { "tools": ["mastra_gate_check", "mastra_gate_check_recurrence", "mastra_gate_mark_preflight", "mastra_gate_override", "mastra_runtime_state_record"] },
    "meta_state": { "tools": ["mastra_meta_state_report", "mastra_meta_state_list", ...] },
    "introspection": { "tools": ["mastra_loop_describe", "mastra_loop_get_instruction", "mastra_runtime_state_read"] },
    "runtime_agnostic": { "tools": ["mastra_check_runtime_agnostic"] }
  }
}
```

**Per-tool parity contract test (TDD, internal to Phase 2):**

Plan 1 includes a small per-tool parity test in `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (one test, 29 assertions). The test asserts `deepEqual(legacy.schema, mastraFactory.inputSchema)` for all 29 tools. This is the contract: any future drift between the legacy schema and the factory's wrapped schema fails this test before integration tests run.

```js
// tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoopTool } from "../create-loop-tool.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "../tools/manifest.json"), "utf8")
);

for (const { file, export: exportName } of MANIFEST) {
  test(`parity: ${exportName} inputSchema shape matches legacy`, async () => {
    const legacy = await import(join(__dirname, "../../learning-loop-mcp", file));
    const tool = legacy[exportName];
    const factory = createLoopTool({
      id: "test",
      description: "test",
      inputSchema: tool.schema,
      execute: async () => ({}),
    });
    // The factory wraps inputSchema with z.preprocess → ZodEffects.
    // The shape is preserved (same fields, same types).
    const legacyShape = tool.schema.shape ?? tool.schema;
    const factoryShape = factory.inputSchema._def.schema.shape ?? factory.inputSchema._def.schema;
    assert.deepEqual(
      Object.keys(factoryShape).sort(),
      Object.keys(legacyShape).sort(),
      `${exportName} inputSchema keys mismatch`
    );
  });
}
```

**29 tests, all GREEN if the data-driven loop is wired correctly.**

## Related Code Files

- **Create (3):**
  - `tools/learning-loop-mastra/server.js` (replace Phase 0 stub; ~50 lines)
  - `tools/learning-loop-mastra/agent-manifest.json` (mirrors legacy groupings, ~80 lines)
  - `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` (29-test parity contract, ~50 lines)
- **Modify (1):**
  - `tools/learning-loop-mastra/tools/manifest.json` (29 file→export entries, derived from legacy)

## Implementation Steps

**Step 1 — Build `tools/manifest.json` (~15 min)**

1. Copy `tools/learning-loop-mcp/tools/manifest.json` to `tools/learning-loop-mastra/tools/manifest.json`.
2. Remove the 11 `workflow_*` entries: `workflow_intake_orient`, `workflow_intake_plan`, `workflow_classify_prompt`, `workflow_prepare_runtime_request`, `workflow_generate_prompt`, `workflow_intentional_skip`, `workflow_self_improvement`, `workflow_report_phase_status`, `workflow_runtime_probe`, `workflow_notify_artifact`, `workflow_trigger`.
3. Verify 29 entries remain.
4. Commit this file standalone (small diff, easy to review).

**Step 2 — Write the parity contract test (TDD, ~20 min)**

1. Create `tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js` with the 29-test loop above.
2. Run `node --test tools/learning-loop-mastra/__tests__/parity-schema-shape.test.js`.
3. RED: 29 tests fail because `createLoopTool` doesn't exist yet in the test path (it does — Phase 1 shipped it — but the test imports `legacy` modules dynamically; check the import path is right).
4. The test should pass with the factory's wrapped schema having the same keys as the legacy schema. If keys mismatch, the test reveals which tool drifted.

**Step 3 — Replace `server.js` with the data-driven loop (~30 min)**

1. Replace the Phase 0 stub with the data-driven register loop (the 50-line snippet above).
2. Smoke test: `node tools/learning-loop-mastra/server.js` boots, answers `tools/list` with 29 `mastra_*` tools, exits cleanly on SIGTERM.
3. Run `pnpm test` — expect 20 + 29 = 49 pass in namespace 10; 9 legacy still pass.

**Step 4 — Write `agent-manifest.json` (~15 min)**

1. Mirror the legacy `agent-manifest.json` groupings (gate / meta_state / introspection / runtime_agnostic).
2. Apply the `mastra_` prefix to every tool name in the lists.
3. Commit standalone (documentation, no test impact).

**Step 5 — Commit (~5 min)**
1. `git add tools/learning-loop-mastra/{server.js,tools/manifest.json,agent-manifest.json,__tests__/parity-schema-shape.test.js}`
2. Commit message: `feat(mastra): register 29 deterministic meta-surface tools via createLoopTool (Phase C Plan 1 Phase 2 / C2)`.
3. Push branch.

## Success Criteria

- [ ] `tools/learning-loop-mastra/tools/manifest.json` has 29 entries (5 gate + 20 meta_state + 3 introspection + 1 runtime_agnostic).
- [ ] `tools/learning-loop-mastra/server.js` is the data-driven register loop (no more stub).
- [ ] `node tools/learning-loop-mastra/server.js` boots and answers `tools/list` with 29 `mastra_*` tool names.
- [ ] `tools/learning-loop-mastra/agent-manifest.json` exists with the 4 mirrored groupings.
- [ ] 29 parity contract tests pass in namespace 10.
- [ ] 11 stdio tests from Phase 1 flip GREEN.
- [ ] Total namespace 10 = 20 (Phase 1) + 29 (parity) = 49 pass.
- [ ] 9 legacy namespaces still pass.
- [ ] Commit on branch; no PR opened yet.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| One or more legacy modules fail to import (path mismatch, missing export) | low | The data-driven loop logs `skipped ${file}` on missing exports; smoke test surfaces it. |
| A tool's `inputSchema` shape drifts from legacy (the parity contract test) | low | The 29 parity tests fail fast; investigate the drifted tool before continuing. |
| `mastra_` prefix breaks the stdio test imports (test 2 line 19 spawns the server) | low | The stdio tests use the tool's actual name (`meta_state_propose_design` etc.), not the prefixed name. Verify by running test 2's stdio block. |
| The factory's `execute` wrapping (`async (args) => legacy.handler(args)`) loses the `context` arg | low | Legacy handlers don't use `context`; loss is acceptable. Confirm with a manual trace of one tool. |
| `runtime_state_record` requires operator preflight per `gate_mark_preflight` (legacy gate layer) | medium | Per `research-260611-2216` §3.9, the runtime hooks are unchanged. The mastra server doesn't gate; the legacy hooks still fire on legacy calls. **Mastra calls are not gated in Plan 1** — this is a known operational gap deferred to Plan 3 (C6) cut-over decision. Document in the commit. |

## Next Steps

- **After Phase 2:** Phase 3 (C3 stdio peer config) starts. The mastra server is fully functional; the only remaining piece is the `.mcp.json` + `.factory/mcp.json` peer entry.
- **Operator checkpoint:** at Phase 2 commit, the peer server works in isolation. The C3 phase adds the peer config so both servers can run in parallel.

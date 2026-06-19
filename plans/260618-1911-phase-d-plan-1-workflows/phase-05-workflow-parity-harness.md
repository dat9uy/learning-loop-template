---
phase: 5
title: "Workflow parity harness"
status: completed
priority: P1
effort: "1-2h"
dependencies: ["4"]
---

# Phase 5: Workflow parity harness

## Overview

Ship `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` — the MCP-level parity gate that spawns the mastra server, calls each of 8 workflows via `run_<key>`, and asserts the live output matches the legacy handler return. **TDD-per-workflow:** 1 empirical probe test first (CONCERN #1 from researcher B — workflow MCP output format), then 8 parity tests.

## Why a dedicated harness

Phase 3's `workflow-direct-parity.test.js` proves the wrappers are correct **in isolation** (no MCP layer). This phase proves they are correct **through the MCPServer registration path** (the actual surface downstream consumers see). The two tests cover different failure modes:
- Direct parity fails → wrapper signature broken
- MCP parity fails → MCPServer workflow registration broken, OR the wrapper's parity view is wrong, OR the output format is different than the legacy server

The MCP-level test is the gate that closes D1 + D2 + D3.

## Empirical probe first (CONCERN #1)

Researcher B's `plans/reports/researcher-B-260618-1911-mastra-createworkflow-api-report.md` §"CONCERN #1 (BLOCKING for implementation)" notes that the MCP `tools/call` response shape for workflow-backed tools is **not documented**. Three possibilities:
- `{ content: [{ type: "text", text: JSON.stringify(result) }] }` — matches legacy tool convention
- `{ structuredContent: { status, result, steps, ... } }` — MCP 2025 spec extension
- Both

**Phase 5's first action:** spawn the server with one workflow, call it, inspect the raw response. Lock the format before writing 7 more tests.

## Requirements

- **Functional:** 8 parity tests, one per workflow. Each test: spawns the mastra server via `with-mcp-server.js`, calls `run_<key>` with realistic args, asserts the response shape and content. Plus 1 cold-session-style test that enumerates `tools/list` and asserts 8 `run_<key>` entries appear with the expected `inputSchema`.
- **Non-functional:** tests use the existing `with-mcp-server.js` helper; no new spawn infrastructure. Tests run in series (shared `GATE_ROOT` per Phase C Plan 2 mutex pattern; if mutex isn't needed for read-only workflows, omit).

## Architecture

```
workflow-parity.test.cjs
  ├── test 0: empirical probe
  │     ├── spawn server
  │     ├── callTool("run_workflow_classify_prompt", { prompt: "test" })  // simplest workflow
  │     ├── assert.ok(result)
  │     ├── log raw result shape (for documentation)
  │     └── assert at least one of { content, structuredContent } is populated
  ├── test 1-8: per-workflow parity
  │     ├── spawn server (or share spawn from test 0)
  │     ├── callTool("run_<key>", <args>)
  │     ├── parse response (locked format from test 0)
  │     ├── import legacy handler from #mcp/tools/workflow-*-tool.js
  │     ├── run legacy handler with same args
  │     ├── assert.deepEqual(parsedOutput, legacyResult)  // with documented tolerance
  │     └── assert.equal(parsedStatus, "success")
  └── test 9: tools/list enumeration
        ├── listTools()
        ├── assert 8 run_<key> entries present
        ├── assert each has non-empty description (MCPServer requirement)
        └── assert each has a real inputSchema (object type)
```

## Related Code Files

- **Create:** `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (~250 lines; 9 tests)

## Implementation Steps

1. **TDD: write the empirical probe test first (RED).** The probe calls `run_workflow_classify_prompt` (simplest, pure transform), asserts response exists, logs the raw shape to the test output:
   ```js
   test("workflow parity: empirical probe locks response format", async (t) => {
     const SERVER_ENTRY = resolve(import.meta.dirname, "..", "server.js");
     const { listTools, callTool, cleanup, tempRoot } = await connectMcpServer(SERVER_ENTRY, t.tmpdir());
     t.after(cleanup);

     const result = await callTool("run_workflow_classify_prompt", { prompt: "test classification" });
     console.log("EMPIRICAL PROBE:", JSON.stringify(result, null, 2));
     assert.ok(result, "workflow call must return a result");
     assert.ok(
       result.content !== undefined || result.structuredContent !== undefined,
       "workflow call must return content or structuredContent"
     );
   });
   ```

2. **Run probe, inspect output.** Note the shape: which fields are populated, what the inner JSON looks like, how the workflow's output is wrapped. This is the empirical lock for the format.

3. **Write a parsing helper** that handles the locked format:
   ```js
   function parseWorkflowResult(rawResult) {
     // Empirical: <locked format from step 2>
     if (rawResult.structuredContent) {
       return rawResult.structuredContent.result ?? rawResult.structuredContent;
     }
     if (rawResult.content && rawResult.content[0]?.text) {
       return JSON.parse(rawResult.content[0].text);
     }
     throw new Error(`Unknown workflow result shape: ${JSON.stringify(rawResult)}`);
   }
   ```
   The helper is versioned with a comment: `// Locked 2026-06-18 from probe; if MCPServer changes, re-probe.`

4. **Write 8 parity tests (RED).** **Use a top-level `before` to spawn the server once and share across all 9 tests** (matches `mcp-protocol-e2e.test.cjs` pattern). This halves CI time, eliminates 8 spawn cycles, and matches the existing harness convention. Per test:

   **Comparison mode per workflow type:**
   - `intake_orient` (FS read, timestamp/mtime noise) → `Object.keys(parsed.result).sort() === Object.keys(legacyResult).sort()` (structural equivalence)
   - `intake_plan`, `classify_prompt`, `prepare_runtime_request`, `self_improvement`, `intentional_skip`, `report_phase_status`, `runtime_probe` (pure transforms) → `assert.deepEqual(parsed.result, legacyResult)` (full deep-equal)
   ```js
   test("workflow parity: run_workflow_intake_orient matches legacy", async (t) => {
     const SERVER_ENTRY = resolve(import.meta.dirname, "..", "server.js");
     const { callTool, cleanup, tempRoot } = await connectMcpServer(SERVER_ENTRY, t.tmpdir());
     t.after(cleanup);

     // Set up test fixture in tempRoot
     setupOrientFixture(tempRoot);

     const args = { root: tempRoot };
     const legacyTool = await import("#mcp/tools/workflow-intake-orient-tool.js");
     const legacyResult = await legacyTool.workflowIntakeOrientTool.handler(args);

     const raw = await callTool("run_workflow_intake_orient", args);
     const parsed = parseWorkflowResult(raw);

     // Tolerance: timestamp / file mtime may differ; assert structural equivalence
     assert.equal(parsed.status, "success");
     assert.deepEqual(
       Object.keys(parsed.result).sort(),
       Object.keys(legacyResult).sort(),
       "result keys must match legacy"
     );
   });
   ```

5. **Run tests, confirm 9 RED** (probe + 8 parity).

6. **Investigate any failures.** Most likely failure mode per researcher B's CONCERN #1: response shape mismatch. Adjust `parseWorkflowResult` based on actual shape; if the shape is fundamentally different from the legacy, the test surfaces it for the planner to decide.

7. **Re-run tests, confirm 9 GREEN.** All pass.

8. **Add the tools/list enumeration test (test 9).** Asserts the 8 `run_<key>` entries appear in `tools/list` with non-empty descriptions and real inputSchemas. **This is the workflow parity gate** — the cold-session discoverability test (in Phase 6) is a separate concern (it verifies the legacy manifest's 31 remaining entries register; it does NOT check workflow parity). The two tests cover different failure modes; do not conflate them.

## Success Criteria

- [x] Empirical probe test passes; format locked
- [x] 8 per-workflow parity tests pass
- [x] 1 tools/list enumeration test passes
- [x] `parseWorkflowResult` helper handles the locked format
- [x] All 10 test namespaces pass (including the new `workflow-parity.test.cjs`)

## Risk Assessment

- **Risk:** workflow MCP output format differs significantly from legacy (e.g., `{ status, result, steps }` shape vs `{ content: [{ text: JSON.stringify(...) }] }`). **Mitigation:** `parseWorkflowResult` normalizes to the inner result; the deep-equal assertion compares inner fields. If shapes are fundamentally incompatible, the test surfaces it for the planner to choose: (a) add output-format adapter, (b) accept the new shape and document the difference, (c) revert this workflow to createTool.
- **Risk:** `intake_orient` test fixture is hard to set up correctly (5 surfaces + evidence dirs + runtime-state.jsonl). **Mitigation:** the test can use a minimal fixture: 1 surface, 1 index entry, 1 evidence file, 1 runtime-state row. The structural equivalence assertion (sorted keys) doesn't require content parity.
- **Risk:** `run_workflow_intake_orient` requires `SURFACES` to be defined and the temp project to have at least one surface's directory. **Mitigation:** create a `meta/` surface dir under `tempRoot/records/` with a stub `index/` YAML file.
- **Risk:** MCPServer double-prefixes `run_` if the workflow key already starts with `run_` (researcher B's CONCERN #2). **Mitigation:** probe in step 2 surfaces this; the workflow id pattern is `workflow_<name>` (no `run_` prefix), so the prefix collision is avoided.
- **Risk:** spawn-loop memory bloat from 9 server spawns in one test file. **Mitigation:** use a top-level `before` to spawn once, share across tests, cleanup in `after`. Pattern from `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs`.

## Security Considerations

The harness spawns the production MCP server with realistic test fixtures. The server's workflow tools are deterministic; no privileged operations are triggered. Same security profile as Phase C Plan 2's `withBothMcpServers` harness.

## Next Steps

Phase 6 (acceptance gate + closeout) runs the full `pnpm test`, asserts 9/9 workflow parity tests pass alongside the existing 70 namespace-10 tests, flips the master tracker D1/D2/D3 to `[x]`, and files `meta_state_log_change`.
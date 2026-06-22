---
phase: 5
title: "RunId Generation"
status: pending
effort: "~30min"
---

# Phase 5: RunId Generation

## Overview

Replace `proxiedContext?.get("runId")` (often undefined) in `server.js:96` with explicit `crypto.randomUUID()` fallback. Closes review-260619-1429 finding #6. Mastra tolerates undefined today but downstream idempotency/caching (Plan 3 agents, future caching layer) needs stable runIds.

## Context Links

- `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md` finding #6 (`proxiedContext?.get("runId")` in server.js — undefined in common case; no test asserting runId stability)
- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" item 1.4 (explicit `runId` generation in `LoopMCPServer.convertWorkflowsToTools` via `crypto.randomUUID()`)
- `tools/learning-loop-mastra/server.js:96` (target line; `const run2 = await workflow.createRun({ runId: proxiedContext?.get("runId") });`)
- `tools/learning-loop-mastra/__tests__/` (target dir for new `server-runid.test.js`)

## Requirements

- **Functional:**
  - Modify `server.js:96` to use `crypto.randomUUID()` when `proxiedContext?.get("runId")` is undefined.
  - Add 1 new test file `server-runid.test.js` proving two consecutive `workflow.createRun()` calls (with no proxiedContext) produce different runIds.
- **Non-functional:**
  - Test count delta: +1.
  - Import `crypto` (built-in Node module; no new dep).
  - Preserve backward compatibility: when `proxiedContext?.get("runId")` is defined, use it (caller-supplied runId wins).

## Architecture

Single-line server.js change + 1 new test file.

| Step | Action |
|---|---|
| RED | Add new test file `server-runid.test.js`. Spawn server; call `run_workflow_classify_prompt` twice in succession; capture both runIds; assert they differ. Run; expect test PASSES today (Mastra generates UUIDs internally even when runId is undefined). The test asserts the **explicit** behavior. |
| GREEN | Modify `server.js:96`: `const explicitRunId = proxiedContext?.get("runId") ?? crypto.randomUUID(); const run2 = await workflow.createRun({ runId: explicitRunId });`. Add `import { randomUUID } from "crypto";` at top of file. |
| VERIFY | Re-run; expect test still passes. Run full `pnpm test`; expect 1093 pass (1092 baseline + 1 new). |

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/server.js` (1 import + 2-line runId generation at line 96)
- **Create:** `tools/learning-loop-mastra/__tests__/server-runid.test.js` (1 idempotency test)
- **Delete:** none

## Implementation Steps

1. Read `server.js` line 90-100 (workflow registration + createRun call).
2. Read `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (existing spawn helper; reuse).
3. Create `server-runid.test.js`:
   ```js
   const { spawnMcpServer } = require("./with-mcp-server.js");
   const test = require("node:test");
   const assert = require("node:assert");

   test("server generates stable runId per createRun call", async () => {
     const client = await spawnMcpServer();
     const r1 = await client.callTool("run_workflow_classify_prompt", { prompt: "test1" });
     const r2 = await client.callTool("run_workflow_classify_prompt", { prompt: "test2" });
     const runId1 = JSON.parse(r1.content[0].text).runId;
     const runId2 = JSON.parse(r2.content[0].text).runId;
     assert.notStrictEqual(runId1, runId2);
     assert.match(runId1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
     await client.close();
   });
   ```
4. Modify `server.js`:
   - Add `import { randomUUID } from "node:crypto";` at top.
   - Replace line 96: `const run2 = await workflow.createRun({ runId: proxiedContext?.get("runId") ?? randomUUID() });`
5. Run; expect test passes.
6. Run full `pnpm test`; expect 1093 pass.

## Success Criteria

- [ ] `server.js:96` uses `crypto.randomUUID()` as fallback when `proxiedContext?.get("runId")` is undefined.
- [ ] `tools/learning-loop-mastra/__tests__/server-runid.test.js` asserts two consecutive calls produce different UUID-formatted runIds.
- [ ] `pnpm test` exits 0 with 1093 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Caller-supplied runId precedence.** Risk: low. Phase 5 step 4 uses `??` (nullish coalescing) which preserves caller-supplied runIds when defined. Mitigation: Phase 5 step 6 runs the full parity harness to confirm no MCP contract change.

## Security Considerations

- **RunId predictability.** Risk: very low. `crypto.randomUUID()` is RFC 4122 v4; cryptographically random. No security boundary depends on runId secrecy.

## Next Steps

Phase 6: Schema Fingerprint Test (LibSQL storage substrate schema drift detection).
---
phase: 4
title: "4-server-wiring-manifest"
status: pending
priority: P2
effort: "1h"
dependencies: ["3"]
---

# Phase 4: 4-server-wiring-manifest

## Overview

Wire `tools/learning-loop-mastra/storage.js` (Phase 2's factory) into `tools/learning-loop-mastra/server.js` via a new `Mastra` instance with `storage` (Pattern A2a — build `LoopMCPServer` first; then `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })` wires storage via `Mastra.__registerMastra(server)`). Add 2 new entries to `workflows-manifest.json` (grows 8 → 10). Bump `workflow-parity.test.cjs:159` assertion 39 → 41. Update `server.js` description string.

After this phase, the mastra server registers 31 `mastra_*` createTool tools (unchanged) + 8 `run_workflow_*` createWorkflow tools (unchanged) + 2 new `run_workflow_storage_*` createWorkflow tools = **41 total**.

## Why a dedicated wiring phase

The wiring change has 4 blast-radius pieces: (1) `server.js` adds `Mastra` import + storage wiring + new constructor arg; (2) `workflows-manifest.json` grows by 2 entries; (3) `workflow-parity.test.cjs:159` assertion must bump; (4) `server.js` description string must update. All four must change in lockstep or downstream tools (`loop_describe`, cold-session E2E, `tools/list` enumeration) report inconsistent counts.

## Wiring pattern (locked)

**Pattern A2a** (post-construction attach via `mcpServers: { ... }` config): build `LoopMCPServer` first; then `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })`. The `Mastra` constructor calls `server.__registerMastra(mastra)` internally for each entry in `mcpServers`. The `Mastra` instance is the canonical owner of `storage`; `MCPServer` reads via `mastra.getStorage()` when workflows need to persist `stateSchema` snapshots.

**Why not "pass `mastra` to `LoopMCPServer` constructor":** `MCPServerConfig` does NOT accept a `mastra` field. Verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285` — the interface exposes `name`, `version`, `tools`, `agents?`, `workflows?`, `id?`, `description?`, `instructions?`, `mapAuthInfoToUser?`, etc., but no `mastra`. The `mastra` reference is set post-construction via `server.__registerMastra(mastra)` (`node_modules/@mastra/core/dist/mcp/index.d.ts:81`), which the `Mastra` constructor invokes for each entry in `mcpServers` (per `node_modules/@mastra/core/dist/mastra/index.d.ts:1661-1680` example). The `storage?: MastraCompositeStore` field on `Mastra` Config lives at `node_modules/@mastra/core/dist/mastra/index.d.ts:83`.

This pattern is forward-compatible with Plan 3 (`agents: { ... }` on the same `Mastra` instance) and Plan 5 (Observational Memory uses the same `storage`).

## Requirements

- **Functional:** `server.js` imports `storage`, `initStorage`, `getMastraStorage` from `./storage.js`; constructs `LoopMCPServer` first; then `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })`; `workflows-manifest.json` has 10 entries (was 8); `workflow-parity.test.cjs:159` asserts 41.
- **Non-functional:** `await initStorage()` runs BEFORE `await server.startStdio()` so the storage is ready when workflows are invoked; no `storage.close()` lifecycle hook in this phase (added in Plan 3 when `Mastra.shutdown()` is called).

## Architecture

```
server.js (post-Phase 4)
├── imports: add Mastra from "@mastra/core"; storage, initStorage from "./storage.js"
├── existing: MANIFEST (31 tools) + WORKFLOW_MANIFEST (8 → 10 workflows)
├── AWAIT: await initStorage();  ← new (idempotent ~12ms) — runs FIRST
├── const server = new LoopMCPServer({            ← built FIRST (Pattern A2a)
│     id: "learning-loop-mastra",
│     name: "learning-loop-mastra",
│     version: "0.1.0",
│     description: "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2). 41 tools + 10 workflows across 5 groups. Single server post-cut-over.",  ← updated 31+8 → 41+10
│     tools,
│     workflows,
│   });
├── const mastra = new Mastra({                  ← built SECOND (Pattern A2a)
│     storage,                                    ← Mastra owns storage
│     mcpServers: { "learning-loop-mastra": server },  ← wires storage to server via __registerMastra
│   });
└── await server.startStdio();                    ← starts LAST (after both wiring steps)

workflows-manifest.json (post-Phase 4)
[
  ...8 existing workflow entries...,
  { "file": "workflows/workflow-storage-round-trip.js", "export": "workflowStorageRoundTrip" },  ← NEW
  { "file": "workflows/workflow-storage-read.js", "export": "workflowStorageRead" }              ← NEW
]

workflow-parity.test.cjs:159 (post-Phase 4)
- assert.equal(tools.length, 39, `total must be 39, got ${tools.length}`);
+ assert.equal(tools.length, 41, `total must be 41, got ${tools.length}`);
```

**Count math (verified 2026-06-19):**

| Source | Pre-Phase 4 | Post-Phase 4 |
|---|---|---|
| `tools/learning-loop-mastra/tools/manifest.json` | 31 entries | 31 (unchanged) |
| `tools/learning-loop-mastra/workflows-manifest.json` | 8 entries | **10 entries** |
| `mastra_*` tools registered at runtime | 31 | 31 (unchanged) |
| `run_workflow_*` tools registered at runtime | 8 | 8 (unchanged) |
| `run_workflow_storage_*` tools registered at runtime | 0 | **2 (NEW)** |
| **Total tools registered** | **39** | **41** (+2) |

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/server.js` (add Mastra + storage wiring)
- **Modify:** `tools/learning-loop-mastra/workflows-manifest.json` (add 2 entries)
- **Modify:** `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (bump line 159: 39 → 41)

## Implementation Steps

1. **Read the current `server.js`** to understand the exact registration loop pattern. (Done during plan authoring; the file is at `tools/learning-loop-mastra/server.js:1-149`.)

2. **Update `server.js`** with 4 edits (Pattern A2a order: `initStorage` → build server → build mastra → start stdio):
   - **Edit A (add imports):**
     ```js
     import { MCPServer } from "@mastra/mcp";
     import { Mastra } from "@mastra/core";     // NEW
     import { createTool } from "@mastra/core/tools";
     // ... existing imports ...
     import { storage, initStorage } from "./storage.js";  // NEW
     ```
   - **Edit B (await initStorage before LoopMCPServer build):** insert after the workflows registration loop (currently at `server.js:38-47`) and before the LoopMCPServer class. This runs FIRST so storage is ready when the server is constructed:
     ```js
     // Initialize storage before the server starts accepting requests so that
     // workflows can persist stateSchema snapshots from the first call.
     // initStorage() is idempotent (~12ms first call, <1ms subsequent).
     await initStorage();
     ```
   - **Edit C (build server then mastra with mcpServers config — Pattern A2a):** replace the `new LoopMCPServer({...})` call at `server.js:139-147`. The server is constructed FIRST (without `mastra` — `MCPServerConfig` does not accept it; verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`). The `Mastra` instance is constructed SECOND with `mcpServers` config; the constructor calls `server.__registerMastra(mastra)` internally (per `node_modules/@mastra/core/dist/mcp/index.d.ts:81`):
     ```js
     const server = new LoopMCPServer({
       id: "learning-loop-mastra",
       name: "learning-loop-mastra",
       version: "0.1.0",
       description:
         "Mastra-based canonical MCP server for the learning loop (Phase D Plans 1+2). 41 tools + 10 workflows across 5 groups. Single server post-cut-over.",
       tools,
       workflows,
     });
     const mastra = new Mastra({
       storage,
       mcpServers: { "learning-loop-mastra": server },
     });
     ```
   - **Edit D (add storage note to startup log):** update the log line at `server.js:49`:
     ```js
     console.error(`learning-loop-mastra: registered ${Object.keys(tools).length} tools, ${Object.keys(workflows).length} workflows, storage.id=${storage.id}`);
     ```

3. **Verify `MCPServerConfig` lacks `mastra` (the gate that locked Pattern A2a).** Read `node_modules/@mastra/core/dist/mcp/types.d.ts` lines 220-285 — the interface exposes `name`, `version`, `tools`, `agents?`, `workflows?`, `id?`, `description?`, `instructions?`, `mapAuthInfoToUser?`, etc., but **no `mastra` field**. This is why the plan uses Pattern A2a (server built first; Mastra constructor calls `__registerMastra(server)` via the `mcpServers` config), not "pass `mastra` to the `LoopMCPServer` constructor."

   **Verification commands:**
   ```bash
   # Confirm MCPServerConfig lacks mastra field
   sed -n '220,285p' node_modules/@mastra/core/dist/mcp/types.d.ts | grep -c "mastra"
   # Expected: 0 (the interface has no `mastra` field)

   # Confirm Mastra constructor accepts mcpServers (used in Pattern A2a)
   grep -n "mcpServers?" node_modules/@mastra/core/dist/mastra/index.d.ts | head -5
   # Expected: line 178: mcpServers?: TMCPServers;

   # Confirm __registerMastra exists on MCPServerBase
   grep -n "__registerMastra" node_modules/@mastra/core/dist/mcp/index.d.ts | head -5
   # Expected: line 81: __registerMastra(mastra: Mastra): void;
   ```
   If any of these checks fail (e.g., a future Mastra version adds `mastra` to `MCPServerConfig` or removes `mcpServers`), the plan's wiring pattern must be revisited at author time. As of `@mastra/core@1.42.0`, Pattern A2a is the only viable shape.

4. **Update `tools/learning-loop-mastra/workflows-manifest.json`** — append 2 entries:
   ```json
   [
     ...existing 8 entries...,
     { "file": "workflows/workflow-storage-round-trip.js", "export": "workflowStorageRoundTrip" },
     { "file": "workflows/workflow-storage-read.js", "export": "workflowStorageRead" }
   ]
   ```
   Verify the resulting JSON is valid:
   ```bash
   node -e "console.log(JSON.parse(require('fs').readFileSync('/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows-manifest.json', 'utf8')).length)"
   # Expected: 10
   ```

5. **Update `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:159`** — bump assertion 39 → 41. This is the SEPARATE 41-tool enumeration gate; the cold-session test (`pnpm test:cold-session`) is a different gate that checks the legacy 31-entry manifest only (per BLOCKER #4 fix):
   ```diff
   -    assert.equal(tools.length, 39, `total must be 39, got ${tools.length}`);
   +    assert.equal(tools.length, 41, `total must be 41, got ${tools.length}`);
   ```
   Also update the test name (line 153):
   ```diff
   -  test("tools/list enumerates 31 mastra_* + 8 run_workflow_* = 39 total", { timeout: 10000 }, async () => {
   +  test("tools/list enumerates 31 mastra_* + 8 run_workflow_* + 2 run_workflow_storage_* = 41 total", { timeout: 10000 }, async () => {
   ```
   And update the per-bucket assertions (lines 157-158):
   ```diff
        assert.equal(mastra.length, 31, `must have 31 mastra_* tools, got ${mastra.length}`);
   -    assert.equal(runWorkflows.length, 8, `must have 8 run_workflow_* tools, got ${runWorkflows.length}`);
   +    assert.equal(runWorkflows.length, 10, `must have 10 run_workflow_* tools (8 existing + 2 storage), got ${runWorkflows.length}`);
   ```
   The `runWorkflows` filter at line 156 catches both `run_workflow_*` and `run_workflow_storage_*` (the substring match is the same). Verify with:
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs
   # Expected: 9/9 pass (was 8/8 per Plan 1; the enumeration test now asserts 41)
   ```
   **Note (BLOCKER #4 fix):** the cold-session test (`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-77`) reads the LEGACY `tools/learning-loop-mcp/tools/manifest.json` (31 entries), NOT the mastra server's `tools/list`. The 41-tool enumeration is this `workflow-parity.test.cjs` gate. Updating the cold-session test to also enumerate the mastra server is a Plan 1 review deferred item; Plan 4 owns it.

6. **Run the existing mastra test suite** to confirm no regressions:
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   pnpm test
   ```
   Expected: all 10 namespaces pass. Specifically `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` now asserts 41 tools; the new `storage-factory-direct.test.js` (Phase 2) and `storage-workflow-direct.test.js` (Phase 3) are also picked up by the glob.

7. **Smoke test the server** via a temp spawn (not a manual `node -e` script). Add an inline check that `startStdio()` succeeds with the new wiring:
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   timeout 3 node tools/learning-loop-mastra/server.js 2>&1 | head -5
   # Expected: "learning-loop-mastra: registered 31 tools, 10 workflows, storage.id=mastra-storage"
   # The server stays alive waiting on stdio; the timeout kills it after 3s.
   ```

## Success Criteria

- [ ] `server.js` registers 10 workflows via `MCPServer.workflows` field (was 8)
- [ ] `server.js` builds `LoopMCPServer` FIRST (without `mastra`); then `new Mastra({ storage, mcpServers: { 'learning-loop-mastra': server } })` (Pattern A2a)
- [ ] `await initStorage()` runs BEFORE `new LoopMCPServer({...})`
- [ ] `new LoopMCPServer({...})` runs BEFORE `new Mastra({...})`
- [ ] `workflows-manifest.json` has 10 entries (was 8)
- [ ] `workflow-parity.test.cjs:159` asserts 41 (was 39)
- [ ] `workflow-parity.test.cjs:157` asserts 31 mastra_* (unchanged)
- [ ] `workflow-parity.test.cjs:158` asserts 10 run_workflow_* (was 8)
- [ ] `server.js` description string updated to "41 tools + 10 workflows"
- [ ] No `product/**` writes in this phase
- [ ] Smoke test (`timeout 3 node ... server.js`) logs the expected startup line

## Risk Assessment

- **Risk:** `MCPServer` constructor does not accept `mastra` field (verified at `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`). **Mitigation:** Pattern A2a (server built first; `Mastra` constructor wires `server.__registerMastra(mastra)` via `mcpServers` config) avoids the unsupported constructor arg. This is the ONLY viable shape against `@mastra/core@1.42.0`.
- **Risk:** `LoopMCPServer`'s `convertWorkflowsToTools` (the existing method at `server.js:54-136`) crashes when a workflow throws on import (e.g., `workflow-storage-read.js` has a missing import). **Mitigation:** the existing `console.error` + `continue` at `server.js:43-45` catches the missing-export case; for import errors, the `try { await import(...) } catch` is missing. Add a try/catch in the registration loop if the existing pattern doesn't catch import errors:
   ```js
   for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
     let mod;
     try {
       mod = await import(`./${file}`);
     } catch (err) {
       console.error(`skipped ${file} (import failed: ${err.message})`);
       continue;
     }
     const wf = mod[exportName];
     // ... rest of loop ...
   }
   ```
   If the existing code already catches import errors, no change needed. Verify by inspection at author time.
- **Risk:** Build order drifts (e.g., `Mastra` constructed before `LoopMCPServer`). **Mitigation:** Edit C's code block pins the order; the editor's syntax check fails if the closure captures `server` before its declaration. The smoke test in step 7 catches runtime wiring errors.
- **Risk:** Two server processes start in parallel and both try to write to the same `mastra-memory.db` file → SQLITE_BUSY. **Mitigation:** the project has only one MCP server process at a time (single CLI invocation); `connection_limit=1` enforces single-connection per process. Not a Plan 2 risk.
- **Risk:** `pnpm test` catches the new `storage-parity.test.cjs` (added in Phase 5) and the test glob doesn't pick it up. **Mitigation:** Phase 1 adds `'tools/learning-loop-mastra/__tests__/*.test.cjs'` to the `pnpm test` glob; both `storage-parity.test.cjs` (new) and `workflow-parity.test.cjs` (existing) are picked up. Verify by running `pnpm test` in step 6.

## Security Considerations

None. Wiring change has no security impact. The `storage` field on `Mastra` is a server-side config; no untrusted input crosses the boundary.

## Next Steps

Phase 5 writes `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (6 tests: 4 substrate-direct + 2 MCP-integration). The MCP integration tests (Test 4 + Test 6) share a top-level `before` to halve spawn cycles. Test 4 calls `run_workflow_storage_round_trip` then `run_workflow_storage_read` across server restart to prove cross-process persistence.

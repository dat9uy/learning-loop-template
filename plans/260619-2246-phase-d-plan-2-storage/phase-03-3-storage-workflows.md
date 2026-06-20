---
phase: 3
title: "3-storage-workflows"
status: pending
priority: P2
effort: "1-2h"
dependencies: ["2"]
---

# Phase 3: 3-storage-workflows

## Overview

Write 2 `createLoopWorkflow({...})` wrappers that exercise `getParityDb()` from inside the Mastra runtime (Q1.A lock — direct `createClient` from `@libsql/client`, not the `LibSQLStore` abstraction):
- `workflow-storage-round-trip.js` — writes a record via `getParityDb().execute(INSERT ...)`, returns `{ id, written: true }`.
- `workflow-storage-read.js` — reads a record by id via `getParityDb().execute(SELECT ...)`, returns `{ found, payload }`.

**TDD-per-workflow:** write 5 direct unit parity tests first (no MCP), then implement the wrappers. Both ship with **thin `stateSchema = input`** (parity-faithful, per Plan 1's Q1 resolution). The 2 wrappers are the integration seam that Phase 5 Test 4 (MCP server restart preserves storage state) exercises.

## Why 2 new workflows (not reuse existing)

Per researcher B §4.2: Plan 1's 8 workflows are parity-faithful thin `stateSchema = input`. **None of them touch storage.** The integration test (Phase 5 Test 4) needs a workflow that DOES touch storage end-to-end; otherwise the test is vacuous. The 2 wrappers are the minimum viable end-to-end proof that Plan 3's multi-step `stateSchema` workflows will rely on.

The 2 wrappers have forward value beyond this plan:
- Plan 3's `createAgent` calls can invoke `run_workflow_storage_round_trip` to checkpoint state.
- Plan 5's Observational Memory writes threads/messages via the same `getMastraStorage()` pattern.
- The MCP `tools/list` enumeration surfaces them to operators at session start (cold-session discoverability).

## Per-workflow mapping

| # | File | Exported name | MCP name (with `run_` prefix) | Purpose |
|---|------|---------------|------------------------------|---------|
| 1 | `workflows/workflow-storage-round-trip.js` | `workflowStorageRoundTrip` | `run_workflow_storage_round_trip` | Write a record by id; return ack |
| 2 | `workflows/workflow-storage-read.js` | `workflowStorageRead` | `run_workflow_storage_read` | Read a record by id; return `{ found, payload }` |

## Requirements

- **Functional:** 2 wrapper files, each exporting a workflow instance via `createLoopWorkflow`. Workflows read/write via `getParityDb()` and `getParityDDL()` from `storage.js` (per Q1.A lock — direct libsql client, not the `LibSQLStore` abstraction). Each workflow's `description` is non-empty (MCPServer hard requirement).
- **Non-functional:** no behavior change vs direct substrate calls (proven by 5 direct unit tests in this phase). Thin `stateSchema = input` (parity-faithful default).

## Architecture

```
workflows/workflow-storage-round-trip.js (~30 LOC)
├── import: createLoopWorkflow from "../create-loop-workflow.js"
├── import: getParityDb, getParityDDL from "../storage.js"  ← Q1.A lock (direct libsql client)
├── import: z from "zod"
├── handler: async function writeRecord({ id, kind, payload }) {
│     const db = getParityDb();
│     await db.execute(getParityDDL());
│     const createdAt = new Date().toISOString();
│     await db.execute({
│       sql: "INSERT OR REPLACE INTO parity_records (id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
│       args: [id, kind, JSON.stringify(payload), createdAt],
│     });
│     return { id, written: true, createdAt };
│   }
└── export: workflowStorageRoundTrip = createLoopWorkflow({
                 id: "workflow_storage_round_trip",
                 description: "Writes a parity record to the Mastra storage substrate (via direct libsql client) and returns the assigned id. Used by storage-parity.test.cjs.",
                 inputSchema: {
                   id: z.string().describe("Unique record id (TEXT PRIMARY KEY)"),
                   kind: z.string().describe("Free-form tag, e.g. 'test-fixture'"),
                   payload: z.unknown().describe("JSON-serializable value to persist"),
                 },
                 steps: [{ id: "write-record", inputSchema: { id, kind, payload }, outputSchema: { id, written, createdAt }, handler: writeRecord }],
               });

workflows/workflow-storage-read.js (~30 LOC)
├── (imports same as round-trip)
├── handler: async function readRecord({ id }) {
│     const db = getParityDb();
│     await db.execute(getParityDDL());
│     const result = await db.execute({
│       sql: "SELECT kind, payload, created_at FROM parity_records WHERE id = ?",
│       args: [id],
│     });
│     if (result.rows.length === 0) return { found: false, payload: null };
│     const row = result.rows[0];
│     return { found: true, payload: { id, kind: row.kind, payload: JSON.parse(row.payload), createdAt: row.created_at } };
│   }
└── export: workflowStorageRead = createLoopWorkflow({
                 id: "workflow_storage_read",
                 description: "Reads a parity record from the Mastra storage substrate (via direct libsql client) by id. Used by storage-parity.test.cjs.",
                 inputSchema: {
                   id: z.string().describe("Unique record id (TEXT PRIMARY KEY)"),
                 },
                 steps: [{ id: "read-record", inputSchema: { id }, outputSchema: { found, payload }, handler: readRecord }],
               });
```

**Q1.A lock (2026-06-19):** both wrappers use `getParityDb()` (a direct `createClient` from `@libsql/client` — NOT the `LibSQLStore` abstraction). The Mastra `LibSQLStore` is for future Mastra runtime domains (workflow snapshots, threads, etc.); the 2 storage workflows operate at the parity layer (the `parity_records` table), which is an app-level concern.

**`createdAt` semantics:** round-trip workflow stamps `createdAt` at write time (ISO timestamp from `Date.now()`). The read workflow returns the stored record verbatim — `createdAt` is part of the record payload, not generated on read.

## Related Code Files

- **Create:** `tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js` (~30 LOC)
- **Create:** `tools/learning-loop-mastra/workflows/workflow-storage-read.js` (~30 LOC)
- **No new test file in this phase.** The 5 direct unit tests for the 2 storage workflows are added to `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` as Tests 7-11. Phase 5 owns the test file creation and addition (per Whole-Plan Consistency Sweep: Phase 5's file absorbs the 5 direct unit tests; matches Plan 1's `workflow-parity.test.cjs` which combines direct + MCP in one file).

## Implementation Steps

1. **TDD: write the 5 direct unit parity tests as a draft (RED).** Phase 3 authors the 5 tests in the same shape that Phase 5 will paste into `storage-parity.test.cjs` as Tests 7-11. The tests cover the contract from both sides (write/read) and the failure modes (missing key, complex payload, schema drift). Phase 5 owns the actual file write and Test 1-6 placement.

   ```js
   // tools/learning-loop-mastra/__tests__/storage-parity.test.cjs  (Phase 5 owns this file; Tests 7-11 here)
   import { test, before, after } from "node:test";
   import assert from "node:assert/strict";
   import { getParityDb } from "../storage.js";

   // Tests 7-11 exercise the 2 storage workflows directly via createRun/start.
   // They use the project's default DATA_DIR (the same mastra-memory.db that
   // the MCP integration tests use) — tests are responsible for cleanup.

   let workflowRoundTrip, workflowRead;

   before(async () => {
     ({ workflowStorageRoundTrip: workflowRoundTrip } = await import(
       "../workflows/workflow-storage-round-trip.js"
     ));
     ({ workflowStorageRead: workflowRead } = await import(
       "../workflows/workflow-storage-read.js"
     ));
   });

   after(async () => {
     // Cleanup test records from the project's mastra-memory.db
     const db = getParityDb();
     await db.execute({
       sql: "DELETE FROM parity_records WHERE id IN (?, ?, ?, ?)",
       args: ["rec-rt-001", "rec-complex", "rec-overwrite", "rec-ts"],
     });
   });

   test("storage workflow: round-trip writes a record and read returns it", async () => {
     const args = { id: "rec-rt-001", kind: "test", payload: { x: 1 } };
     const writeRun = await workflowRoundTrip.createRun();
     const writeResult = await writeRun.start({ inputData: args });
     assert.equal(writeResult.status, "success");
     assert.equal(writeResult.result.written, true);
     assert.equal(writeResult.result.id, "rec-rt-001");

     const readRun = await workflowRead.createRun();
     const readResult = await readRun.start({ inputData: { id: "rec-rt-001" } });
     assert.equal(readResult.status, "success");
     assert.equal(readResult.result.found, true);
     assert.equal(readResult.result.payload.id, "rec-rt-001");
     assert.equal(readResult.result.payload.kind, "test");
     assert.deepEqual(readResult.result.payload.payload, { x: 1 });
     assert.ok(readResult.result.payload.createdAt, "createdAt must be present");
   });

   test("storage workflow: read returns { found: false, payload: null } for missing key", async () => {
     const readRun = await workflowRead.createRun();
     const readResult = await readRun.start({ inputData: { id: "does-not-exist-999" } });
     assert.equal(readResult.status, "success");
     assert.equal(readResult.result.found, false);
     assert.equal(readResult.result.payload, null);
   });

   test("storage workflow: complex nested payload survives serialization", async () => {
     const complexPayload = {
       nested: { deeply: { value: [1, 2, 3] } },
       unicode: "héllo 世界 🚀",
       nullable: null,
       bool: true,
       number: 3.14159,
     };
     const writeRun = await workflowRoundTrip.createRun();
     await writeRun.start({ inputData: { id: "rec-complex", kind: "complex", payload: complexPayload } });

     const readRun = await workflowRead.createRun();
     const readResult = await readRun.start({ inputData: { id: "rec-complex" } });
     assert.deepEqual(readResult.result.payload.payload, complexPayload);
   });

   test("storage workflow: id is unique (write same id twice overwrites; second write wins)", async () => {
     const writeRun = await workflowRoundTrip.createRun();
     await writeRun.start({ inputData: { id: "rec-overwrite", kind: "v1", payload: { v: 1 } } });
     await writeRun.start({ inputData: { id: "rec-overwrite", kind: "v2", payload: { v: 2 } } });

     const readRun = await workflowRead.createRun();
     const readResult = await readRun.start({ inputData: { id: "rec-overwrite" } });
     assert.equal(readResult.result.payload.kind, "v2");
     assert.equal(readResult.result.payload.payload.v, 2);
   });

   test("storage workflow: createdAt is ISO 8601 timestamp from write time", async () => {
     const before = Date.now();
     const writeRun = await workflowRoundTrip.createRun();
     const writeResult = await writeRun.start({ inputData: { id: "rec-ts", kind: "ts", payload: {} } });
     const after = Date.now();

     const createdAt = writeResult.result.createdAt;
     assert.ok(createdAt, "createdAt must be set on writeResult");

     const ts = new Date(createdAt).getTime();
     assert.ok(ts >= before - 5 && ts <= after + 5, `createdAt (${createdAt}) must be within 5ms of write window`);
   });
   ```

2. **Run tests, confirm 5 RED.** Phase 5 owns the `storage-parity.test.cjs` file, so at Phase 3 author time, run the draft tests via an inline `--test` against the staged code. Alternative: copy the 5 tests into a scratch file for RED confirmation, then move them to `storage-parity.test.cjs` in Phase 5.
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   # Phase 5 will create storage-parity.test.cjs; for Phase 3 RED check, use a scratch file or skip the run
   # (the 2 workflow files do not exist yet, so any test importing them will fail RED by module-not-found)
   ```

3. **Implement `workflow-storage-round-trip.js`** (per the architecture sketch above). Use the Q1.A-locked API surface: `getParityDb()` (direct `createClient` from `@libsql/client`) + `getParityDDL()` (the `CREATE TABLE IF NOT EXISTS parity_records` DDL string). The factory exposes both exports; the workflow imports them and runs `db.execute(DDL)` once per invocation (idempotent).

4. **Implement `workflow-storage-read.js`** (per the architecture sketch above). Symmetric to write — `getParityDb().execute(SELECT ...)`.

5. **Run tests, confirm 5 GREEN.** Same caveat as step 2 — Phase 5 owns `storage-parity.test.cjs`. Phase 3 confirms GREEN via the same scratch file or by deferring the run to Phase 5 (where Tests 1-6 + Tests 7-11 are all run together).
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   # Phase 5 will run all 11 tests in storage-parity.test.cjs:
   # node --test tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
   # Expected: 11/11 pass (10 with native driver + 1 conditional skip on memory driver per BLOCKER #2 + MINOR #4 fixes)
   ```

6. **Sanity check the round-trip in the console.**
   ```bash
   cat > /tmp/storage-workflow-smoke.mjs <<'EOF'
   import { workflowStorageRoundTrip } from "/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js";
   import { workflowStorageRead } from "/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/workflows/workflow-storage-read.js";
   import { getParityDb } from "/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/storage.js";
   const w = await workflowStorageRoundTrip.createRun();
   const r1 = await w.start({ inputData: { id: "smoke-1", kind: "smoke", payload: { hello: "world" } } });
   console.log("write:", JSON.stringify(r1.result));
   const r = await workflowStorageRead.createRun();
   const r2 = await r.start({ inputData: { id: "smoke-1" } });
   console.log("read:", JSON.stringify(r2.result));
   const r3 = await (await workflowStorageRead.createRun()).start({ inputData: { id: "smoke-2" } });
   console.log("missing:", JSON.stringify(r3.result));
   // Cleanup: delete the smoke record via direct libsql client
   const db = getParityDb();
   await db.execute({ sql: "DELETE FROM parity_records WHERE id = ?", args: ["smoke-1"] });
   EOF
   node /tmp/storage-workflow-smoke.mjs
   # Expected: write shows { id: "smoke-1", written: true, createdAt: "..." }; read shows { found: true, payload: { id: "smoke-1", kind: "smoke", payload: { hello: "world" }, createdAt: "..." } }; missing shows { found: false, payload: null }
   rm /tmp/storage-workflow-smoke.mjs
   ```
   **Note:** the smoke script writes to the project's actual `tools/learning-loop-mastra/data/mastra-memory.db`. The script deletes its smoke record via `getParityDb().execute(DELETE ...)` before exiting to keep the file clean for CI. Alternative: use `:memory:` via `MASTRA_STORAGE_DRIVER=memory` env var for the smoke (but then the cross-restart gate isn't exercised).

## Success Criteria

- [ ] 2 wrapper files exist and export workflows via `createLoopWorkflow`
- [ ] 5 direct unit parity tests drafted as Tests 7-11 of `storage-parity.test.cjs` (Phase 5 owns the file write)
- [ ] Both wrappers import `getParityDb()` and `getParityDDL()` from `storage.js` (Q1.A lock)
- [ ] Round-trip workflow writes a record via `INSERT OR REPLACE INTO parity_records`; read workflow returns it identically
- [ ] Missing-key case returns `{ found: false, payload: null }` (no thrown error)
- [ ] Complex nested payload (unicode, null, bool, number, array) survives JSON serialization
- [ ] Idempotent overwrite: writing same id twice, second write wins
- [ ] `createdAt` is an ISO 8601 timestamp within ±5ms of write time
- [ ] Each wrapper has a comment documenting the parity-faithful thin `stateSchema` default (forward-compatible with Plan 3 multi-step stateSchema)

## Risk Assessment

- **Risk:** Workflow step's `outputSchema` doesn't match the handler's actual return shape, causing Zod parse failure at workflow boundary. **Mitigation:** Test 1 (`assert.equal(writeResult.result.written, true)`) surfaces the mismatch; the `adaptLegacyHandler` envelope-strip in `createLoopWorkflow` (`create-loop-workflow.js:39-54`) protects against the legacy MCP envelope shape.
- **Risk:** Direct unit tests pollute the project's actual `tools/learning-loop-mastra/data/mastra-memory.db` with `rec-rt-001`, `rec-complex`, etc. **Mitigation:** add a `before`/`after` hook to the test file that cleans up test records (`DELETE FROM parity_records WHERE id IN ('rec-rt-001', 'rec-complex', 'rec-overwrite', 'rec-ts')` after the suite). Document this in the test file header comment. Alternative: use `MASTRA_STORAGE_DRIVER=memory` for these tests — but then cross-restart assertions are impossible (already covered by Phase 5 Test 3 skip on memory driver).
- **Risk:** `createdAt` timestamp comparison is flaky on slow CI. **Mitigation:** ±5ms tolerance in Test 5; if CI is slower, bump to ±50ms.
- **Risk:** `INSERT OR REPLACE` semantics in workflow-storage-round-trip interact unexpectedly with `createdAt` (overwrites may erase the original timestamp). **Mitigation:** the round-trip handler generates `createdAt` at write time and stores it in the same INSERT; on overwrite, the new write's `createdAt` replaces the old (intentional — overwrite is documented as "second write wins" in Test 4 / Test 10).

## Security Considerations

The wrappers accept arbitrary `id` (TEXT PRIMARY KEY) and `payload` (JSON-serializable). There is no SQL injection risk because the storage layer (LibSQLStore) parameterizes queries internally. There is no DoS risk: each test creates at most 5 records; the project's `mastra-memory.db` is gitignored and bounded by hand-test usage.

For production: the `id` namespace (`records:*`) is internal; downstream consumers should not accept untrusted `id` strings without validation (the workflow factory accepts any string; consumers wrap with Zod validation if needed).

## Next Steps

Phase 4 wires the 2 new workflows into `server.js` via `workflows-manifest.json` (grows 8→10), updates `LoopMCPServer.convertWorkflowsToTools` registration loop (no code change — automatic via manifest), and bumps `workflow-parity.test.cjs:159` assertion 39→41. Phase 5 adds the 11-test `storage-parity.test.cjs` (Tests 1-6 substrate + MCP; Tests 7-11 are the 5 workflow-direct unit tests drafted in Phase 3, folded into the same file per BLOCKER #2). Test 4 spawns the server and calls `run_workflow_storage_round_trip` + `run_workflow_storage_read` to prove cross-process persistence (via `getParityDb()` per Q1.A lock).

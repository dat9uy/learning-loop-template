---
phase: 5
title: "5-storage-parity-harness"
status: pending
priority: P2
effort: "2h"
dependencies: ["4"]
---

# Phase 5: 5-storage-parity-harness

## Overview

Ship `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` — the parity gate that proves (1) LibSQL is a functionally complete persistence substrate for Mastra runtime (write/read/list round-trip; cross-restart persistence), and (2) the substrate-level contract is **honest about being separate from meta-state** (the JSONL sidecar test pins the boundary, not the parity).

**11 tests total** (per BLOCKER #2 fix: Phase 3's 5 workflow-direct unit tests fold into this file as Tests 7-11; matches Plan 1's `workflow-parity.test.cjs` pattern of combining direct + MCP in one file):
- **4 substrate-direct** (no server spawn; direct `getParityDb()` calls to LibSQL per Q1.A lock): Test 1 round-trip, Test 2 JSONL sidecar, Test 3 cross-restart persistence, Test 5 isolation.
- **2 MCP integration** (server spawn): Test 4 cross-process persistence via the 2 storage workflows (also skips on `memory` driver per MINOR #4), Test 6 `tools/list` enumeration.
- **5 workflow-direct unit** (no server spawn; exercise the 2 storage workflows directly via `createRun`/`start`): Test 7 round-trip, Test 8 missing-key, Test 9 complex payload, Test 10 idempotent overwrite, Test 11 `createdAt` timestamp.

The harness reuses `connectMcpServer` from `with-mcp-server.js` (no new spawn infrastructure) and adds a small `withTempStorageRoot()` helper (~30 LOC) for per-test storage isolation. Total file: ~350 LOC.

## Why a mixed-mode harness

The 4 substrate tests prove LibSQL works in isolation; direct calls are 10× faster than spawning a server per test. The 2 MCP tests prove the end-to-end wire (Mastra runtime → MCP server → workflow → storage) — the integration that downstream Plans 3-5 depend on. The mixed-mode split mirrors Plan 1's `workflow-direct-parity.test.js` (direct unit) vs `workflow-parity.test.cjs` (MCP-level integration).

## Requirements

- **Functional:** 11 tests, each green; Test 4 + Test 6 share one server spawn via top-level `before` (halves CI time vs per-test spawn); Test 3 skips when `MASTRA_STORAGE_DRIVER=memory`; Test 4 also skips on `memory` driver (cross-process persistence is impossible under `:memory:` — each process has its own in-memory db).
- **Non-functional:** no new spawn infrastructure; reuse `connectMcpServer` from `with-mcp-server.js:55-109`; no mocks; per-test fixture cleanup.

## Architecture

```
storage-parity.test.cjs (~350 LOC)
├── imports: test, before, after, describe from "node:test"
│            assert from "node:assert/strict"
│            mkdtempSync, rmSync, existsSync from "node:fs"
│            join from "node:path"
│            tmpdir from "node:os"
│            resolve from "node:path"
│            getParityDb, getParityDDL, getMastraStorage, initStorage from "../storage.js"  ← Q1.A lock: direct libsql client
│            connectMcpServer from "./with-mcp-server.js"
│            workflowStorageRoundTrip, workflowStorageRead from "../workflows/workflow-storage-*.js"  ← added in Phase 5 step 3
├── call initStorage() once in a top-level `before` (idempotent; ~12ms cold start)
├── withTempStorageRoot(prefix?) helper (~30 LOC)
│     ├── mkdtempSync(join(tmpdir(), `storage-parity-${prefix || ""}`))
│     ├── dbPath: join(storageRoot, "mastra-memory.db")
│     ├── jsonlPath: join(storageRoot, "records.jsonl")
│     └── cleanup: rmSync(storageRoot, { recursive: true, force: true })
├── writeRecord(db, record) — INSERT into parity_records
├── readRecord(db, id) — SELECT * FROM parity_records WHERE id = ?
├── writeJsonl(path, record) — append JSON.stringify(record) + "\n"
├── readJsonl(path, id) — scan lines, JSON.parse, filter by id
├── parseWorkflowResult(rawResult) — extract inner JSON from MCP envelope (matches workflow-parity.test.cjs pattern)
└── describe("storage parity harness", () => {
      // Tests 1-3, 5 (substrate-direct, no server spawn). Direct LibSQL via getParityDb().
      test("libsql: write then read returns identical record", ...);
      test("jsonl sidecar: write then read returns identical record", ...);
      test("libsql: data persists across client close + reopen", ...);
      test("storage isolation: two temp roots do not share state", ...);

      // Tests 4 + 6 (MCP integration, share one server spawn).
      let handles;
      before(async () => {  ← also skips on MASTRA_STORAGE_DRIVER=memory (per MINOR #4)
        if (process.env.MASTRA_STORAGE_DRIVER === "memory") {
          t.skip("MASTRA_STORAGE_DRIVER=memory; cross-process persistence requires file-backed storage");
          return;
        }
        handles = await connectMcpServer(SERVER_ENTRY, mkdtempSync(...));
      }, { timeout: 15000 });
      after(async () => { if (handles) await handles.cleanup(); });

      test("mcp integration: server restart preserves storage state", ...);
      test("tools/list: storage registration surfaces 2 storage workflows", ...);

      // Tests 7-11 (workflow-direct unit, drafted in Phase 3, added to this file in Phase 5).
      // No server spawn. Exercise the 2 storage workflows directly via createRun/start.
      test("storage workflow: round-trip writes a record and read returns it", ...);
      test("storage workflow: read returns { found: false, payload: null } for missing key", ...);
      test("storage workflow: complex nested payload survives serialization", ...);
      test("storage workflow: id is unique (write same id twice overwrites; second write wins)", ...);
      test("storage workflow: createdAt is ISO 8601 timestamp from write time", ...);
    });
```

**Header comment (mandatory):**
```js
// storage-parity.test.cjs
//
// Plan 2 parity harness (D5+D6). 11 tests; mixed mode:
// - 4 substrate-direct tests (Tests 1, 2, 3, 5): direct LibSQL/file I/O
//   via getParityDb() and getParityDDL() from ../storage.js (Q1.A lock:
//   the 2 storage workflows and the substrate tests use a direct libsql
//   client, NOT the LibSQLStore abstraction).
// - 2 MCP integration tests (Tests 4, 6): spawn mastra server, call storage
//   workflows via run_workflow_storage_*, assert round-trip + tools/list.
//   Tests 4 + 6 share a server spawn via top-level `before` (skips both on
//   MASTRA_STORAGE_DRIVER=memory per MINOR #4).
// - 5 workflow-direct unit tests (Tests 7-11): exercise the 2 storage
//   workflows directly via createRun/start (drafted in Phase 3, added to
//   this file in Phase 5 per BLOCKER #2 fix).
//
// IMPORTANT: The JSONL sidecar in Test 2 is a PER-TEST FIXTURE only.
// It is NOT a meta-state migration. It exists solely to prove the parity
// claim is honest: the substrate (LibSQL) and the sidecar (JSONL) accept
// the SAME data shape (id/kind/payload/createdAt) and operations
// (write/read/list), and return observably-equivalent results. It is not
// a substitute for meta-state.jsonl, not a migration path, not a long-lived
// artifact. Per mastra-storage-memory-260619-1918-direction-clarification-report.md
// §3, meta-state stays JSONL on disk.
```

## Related Code Files

- **Create:** `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (~350 LOC; 11 tests: 4 substrate-direct + 2 MCP integration + 5 workflow-direct unit)

## Implementation Steps

1. **TDD: write Tests 1-3, 5 (substrate-direct) first (RED).** Each test is self-contained; uses `withTempStorageRoot()` helper.

   **Test 1 — substrate round-trip (uses getParityDb() per Q1.A lock):**
   ```js
   test("libsql: write then read returns identical record", { timeout: 10000 }, async () => {
     const { dbPath, cleanup } = withTempStorageRoot();
     try {
       // Q1.A lock: substrate-direct test uses the same factory export
       // (getParityDb) that the 2 storage workflows use, ensuring parity.
       // The factory reads MASTRA_STORAGE_DRIVER at module load; we override
       // the file path for this test by exporting a fresh factory at the test
       // level (YAGNI for now — the test writes to a fresh temp dbPath via
       // a hand-built client, then exercises getParityDb() against the
       // project's default DATA_DIR for parity).
       const db = createClient({ url: `file:${dbPath}` });
       await db.execute(getParityDDL());
       const rec = {
         id: "rec-test-001",
         kind: "test-fixture",
         payload: { x: 1, y: "two" },
         createdAt: "2026-06-19T22:00:00.000Z",
       };
       await writeRecord(db, rec);
       const fetched = await readRecord(db, "rec-test-001");
       assert.deepEqual(fetched, rec, "round-trip must return identical record");
       db.close();
     } finally {
       cleanup();
     }
   });
   ```

   **Test 2 — JSONL sidecar:**
   ```js
   test("jsonl sidecar: write then read returns identical record", { timeout: 10000 }, async () => {
     const { jsonlPath, cleanup } = withTempStorageRoot();
     try {
       const rec = {
         id: "rec-test-001",
         kind: "test-fixture",
         payload: { x: 1, y: "two" },
         createdAt: "2026-06-19T22:00:00.000Z",
       };
       await writeJsonl(jsonlPath, rec);
       const fetched = await readJsonl(jsonlPath, "rec-test-001");
       assert.deepEqual(fetched, rec, "JSONL round-trip must return identical record");
     } finally {
       cleanup();
     }
   });
   ```

   **Test 3 — cross-restart persistence (skips on memory driver):**
   ```js
   test("libsql: data persists across client close + reopen", { timeout: 10000 }, async (t) => {
     if (process.env.MASTRA_STORAGE_DRIVER === "memory") {
       t.skip("MASTRA_STORAGE_DRIVER=memory; cross-restart persistence requires file-backed storage");
       return;
     }
     const { dbPath, cleanup } = withTempStorageRoot("cross-restart-");
     try {
       const client1 = createClient({ url: `file:${dbPath}` });
       await client1.execute(getParityDDL());
       await writeRecord(client1, {
         id: "rec-survives",
         kind: "k",
         payload: { v: 42 },
         createdAt: "2026-06-19T22:00:00.000Z",
       });
       client1.close();

       const client2 = createClient({ url: `file:${dbPath}` });
       const fetched = await readRecord(client2, "rec-survives");
       assert.equal(fetched.payload.v, 42, "data must persist across close/reopen");
       client2.close();
     } finally {
       cleanup();
     }
   });
   ```

   **Test 5 — isolation:**
   ```js
   test("storage isolation: two temp roots do not share state", { timeout: 15000 }, async () => {
     const { dbPath: dbA, cleanup: cleanupA } = withTempStorageRoot("iso-A-");
     const { dbPath: dbB, cleanup: cleanupB } = withTempStorageRoot("iso-B-");
     try {
       const clientA = createClient({ url: `file:${dbA}` });
       const clientB = createClient({ url: `file:${dbB}` });
       await clientA.execute(getParityDDL());
       await clientB.execute(getParityDDL());

       await writeRecord(clientA, {
         id: "rec-A",
         kind: "iso",
         payload: { which: "A" },
         createdAt: new Date().toISOString(),
       });
       const fetchedA = await readRecord(clientA, "rec-A");
       const fetchedB = await readRecord(clientB, "rec-A");
       assert.ok(fetchedA, "A must see its own record");
       assert.equal(fetchedB, null, "B must NOT see A's record (different dbPath)");
       clientA.close();
       clientB.close();
     } finally {
       cleanupA();
       cleanupB();
     }
   });
   ```

   **Helpers (using factory exports per Q1.A lock):**
   ```js
   // DDL comes from getParityDDL() (the factory export) — single source of truth.
   // The factory's getParityDb() reads MASTRA_STORAGE_DRIVER at module load;
   // for temp-root tests we use a hand-built createClient({ url: file:${dbPath} })
   // pointing at the temp db, then call getParityDDL() for the schema.
   import { getParityDb, getParityDDL, getMastraStorage, initStorage } from "../storage.js";
   import { createClient } from "@libsql/client";

   function withTempStorageRoot(prefix = "storage-parity-") {
     const storageRoot = mkdtempSync(join(tmpdir(), prefix));
     const dbPath = join(storageRoot, "mastra-memory.db");
     const jsonlPath = join(storageRoot, "records.jsonl");
     return { storageRoot, dbPath, jsonlPath, cleanup: () => rmSync(storageRoot, { recursive: true, force: true }) };
   }

   async function writeRecord(db, rec) {
     await db.execute({
       sql: "INSERT INTO parity_records (id, kind, payload, created_at) VALUES (?, ?, ?, ?)",
       args: [rec.id, rec.kind, JSON.stringify(rec.payload), rec.createdAt],
     });
   }

   async function readRecord(db, id) {
     const result = await db.execute({
       sql: "SELECT id, kind, payload, created_at FROM parity_records WHERE id = ?",
       args: [id],
     });
     if (!result.rows || result.rows.length === 0) return null;
     const row = result.rows[0];
     return {
       id: row.id,
       kind: row.kind,
       payload: JSON.parse(row.payload),
       createdAt: row.created_at,
     };
   }

   async function writeJsonl(path, rec) {
     const { appendFileSync } = await import("node:fs");
     appendFileSync(path, JSON.stringify(rec) + "\n", "utf8");
   }

   async function readJsonl(path, id) {
     const { readFileSync } = await import("node:fs");
     const content = readFileSync(path, "utf8");
     for (const line of content.split("\n")) {
       if (!line) continue;
       const rec = JSON.parse(line);
       if (rec.id === id) return rec;
     }
     return null;
   }
   ```

2. **Run tests, confirm 4 RED (Tests 1, 2, 3, 5).**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
   # Expected: 0/4 substrate tests pass (or 3/4 if Test 3 is skipped on memory driver)
   ```
   If Tests 1-3, 5 fail at the import line (no `withTempStorageRoot` yet), the test file's helper definitions haven't been written — write them, re-run.

3. **Write Tests 4 + 6 (MCP integration) with shared `before`:**
   ```js
   const SERVER_ENTRY = resolve(import.meta.dirname, "..", "server.js");

   describe("mcp integration", () => {
     let handles;
     before(async () => {
       const tempRoot = mkdtempSync(join(tmpdir(), "storage-mcp-"));
       handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
     }, { timeout: 15000 });
     after(async () => {
       if (handles) await handles.cleanup();
     });

     test("mcp integration: server restart preserves storage state", { timeout: 20000 }, async () => {
       // Session 1: spawn, write via storage workflow, exit
       await handles.callTool("run_workflow_storage_round_trip", {
         id: "rec-mcp-001",
         kind: "mcp-fixture",
         payload: { source: "session-1" },
       });
       await handles.cleanup();

       // Session 2: spawn fresh against same tempRoot, read via storage workflow
       const tempRoot2 = mkdtempSync(join(tmpdir(), "storage-mcp-restart-"));
       // Need to share GATE_ROOT between sessions for storage to be reachable
       // ... OR: use the same tempRoot across both sessions via a shared env var
       // Simplest: spawn session 2 with the SAME tempRoot session 1 used.
       // Note: connectMcpServer already prepared a tempRoot in `before`; we need
       // to expose it so test 4 can reuse the path.
       // (See step 4: refactor to share tempRoot via closure.)
       // ...
     });

     test("tools/list: storage registration surfaces 2 storage workflows", { timeout: 10000 }, async () => {
       const tools = await handles.listTools();
       const writeTool = tools.find((t) => t.name === "run_workflow_storage_round_trip");
       const readTool = tools.find((t) => t.name === "run_workflow_storage_read");
       assert.ok(writeTool, "write workflow tool must be registered");
       assert.ok(readTool, "read workflow tool must be registered");
       assert.ok(writeTool.inputSchema && writeTool.inputSchema.type === "object", "write tool must have object inputSchema");
       assert.ok(readTool.inputSchema && readTool.inputSchema.type === "object", "read tool must have object inputSchema");
     });
   });
   ```

4. **Refactor: expose `tempRoot` from the shared `before` so Test 4 can reuse it for the second session. The `before` block also skips on `MASTRA_STORAGE_DRIVER=memory` per MINOR #4 (cross-process persistence is impossible under `:memory:` — each process has its own in-memory db; Test 4's contract cannot be honored).** The `connectMcpServer` helper returns `{ client, listTools, callTool, tempRoot, cleanup }` per `with-mcp-server.js:92-108`. Capture `tempRoot` in the outer `describe` scope:

   ```js
   describe("mcp integration", () => {
     let handles;
     let tempRoot;
     before(async (t) => {
       if (process.env.MASTRA_STORAGE_DRIVER === "memory") {
         t.skip("MASTRA_STORAGE_DRIVER=memory; cross-process persistence requires file-backed storage");
         return;
       }
       tempRoot = mkdtempSync(join(tmpdir(), "storage-mcp-"));
       handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
     }, { timeout: 15000 });
     after(async () => {
       if (handles) await handles.cleanup();
     });

     test("mcp integration: server restart preserves storage state", { timeout: 25000 }, async () => {
       // Session 1: write
       await handles.callTool("run_workflow_storage_round_trip", {
         id: "rec-mcp-001",
         kind: "mcp-fixture",
         payload: { source: "session-1" },
       });
       await handles.cleanup();
       handles = null;

       // Session 2: spawn fresh against SAME tempRoot
       handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
       const result = await handles.callTool("run_workflow_storage_read", { id: "rec-mcp-001" });
       assert.equal(result.found, true, "record must be found in fresh server session");
       assert.equal(result.payload.source, "session-1", "payload must match what session-1 wrote");
     });

     test("tools/list: storage registration surfaces 2 storage workflows", { timeout: 10000 }, async () => {
       // (assumes Test 4 ran and re-spawned `handles`; the after hook cleans up)
       const tools = await handles.listTools();
       // ... assertions ...
     });
   });
   ```
   **Important:** Test 4 mutates `handles` (cleanup + re-spawn). Test 6 runs AFTER Test 4 (alphabetical or definition order); it sees the re-spawned `handles`. If Test 6 runs FIRST, the assertions pass against session 1's tools/list (which still includes the 2 storage workflows — registration is manifest-driven, not session-driven). Either order works; the test is robust.

   **MINOR #4 fix:** the `before` block (not just Test 3's standalone skip) checks `MASTRA_STORAGE_DRIVER=memory` and skips the entire `describe`. Both Test 4 and Test 6 skip together. On `memory` driver: 2 skips (Test 3 in the substrate describe + the MCP describe), 10/11 pass. On `native` driver: 0 skips, 11/11 pass.

5. **Add Tests 7-11 (workflow-direct unit, drafted in Phase 3).** These exercise the 2 storage workflows directly via `createRun`/`start` (no MCP spawn). Place them in the same file, after the MCP `describe` block:

   ```js
   // Tests 7-11 (workflow-direct unit, drafted in Phase 3). No server spawn.
   // Exercises the 2 storage workflows directly via createRun/start.
   // Uses getParityDb() for cleanup (per Q1.A lock — direct libsql client).
   let workflowRoundTrip, workflowRead;
   before(async () => {
     await initStorage();  // idempotent; ~12ms cold start
     ({ workflowStorageRoundTrip: workflowRoundTrip } = await import(
       "../workflows/workflow-storage-round-trip.js"
     ));
     ({ workflowStorageRead: workflowRead } = await import(
       "../workflows/workflow-storage-read.js"
     ));
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

   **Cleanup:** Tests 7-11 leave `rec-rt-001`, `rec-complex`, `rec-overwrite`, `rec-ts` in the project's actual `tools/learning-loop-mastra/data/mastra-memory.db`. The file is gitignored. Add an `after` hook to delete these records via `getParityDb().execute(DELETE ...)` (per Q1.A lock — direct libsql client):

   ```js
   after(async () => {
     const db = getParityDb();
     await db.execute({
       sql: "DELETE FROM parity_records WHERE id IN (?, ?, ?, ?)",
       args: ["rec-rt-001", "rec-complex", "rec-overwrite", "rec-ts"],
     });
   });
   ```

6. **Run all 11 tests, confirm GREEN.**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   MASTRA_STORAGE_DRIVER=native node --test tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
   # Expected: 11/11 pass on native driver
   ```

7. **Sanity check under `MASTRA_STORAGE_DRIVER=memory`:**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   MASTRA_STORAGE_DRIVER=memory node --test tools/learning-loop-mastra/__tests__/storage-parity.test.cjs
   # Expected: 9/11 pass + 2 skipped (Test 3 cross-restart + Test 4/6 MCP integration share a `before` skip)
   # Both skips MUST log to stderr: "MASTRA_STORAGE_DRIVER=memory; cross-process persistence requires file-backed storage"
   ```

7. **Verify the test is in the `pnpm test` glob.** The `pnpm test` glob update happened in Phase 1 step 8 (per BLOCKER #3 fix). The glob at `package.json:17` includes both `'tools/learning-loop-mastra/__tests__/*.test.js'` AND `'tools/learning-loop-mastra/__tests__/*.test.cjs'`. Verify:
   ```bash
   grep "tools/learning-loop-mastra/__tests__" /home/datguy/codingProjects/learning-loop-template/package.json
   # Expected: both `*.test.js` and `*.test.cjs` entries present
   ```

8. **Run the full test suite** to confirm no regressions and the new file is picked up:
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   pnpm test
   ```
   Expected: 11 namespaces pass (was 10; new `storage-parity` is the 11th). Test count on native driver: **1109 pass / 0 fail / 1 skipped** (the 1 skipped is the pre-existing skip; Test 3 + Test 4/6 only skip on `memory`). The +26 delta vs the 1083 baseline = +15 existing `.cjs` tests (now picked up by the BLOCKER #3 glob fix) + +11 new from storage-parity.

## Success Criteria

- [ ] 11 storage-parity tests pass on `native` driver (4 substrate-direct + 2 MCP integration + 5 workflow-direct unit)
- [ ] 9/11 pass + 2 skipped on `memory` driver (Test 3 substrate-direct skips; the MCP `before` block skips Test 4 + Test 6)
- [ ] Both skip paths log to stderr: "MASTRA_STORAGE_DRIVER=memory; cross-process persistence requires file-backed storage"
- [ ] Tests 4 + 6 share one server spawn via top-level `before` (skipped together on `memory` driver)
- [ ] JSONL sidecar boundary documented in test file header comment (mandatory; reads as warning to future maintainers)
- [ ] `withTempStorageRoot()` helper handles prefix arg for isolation tests
- [ ] All per-test temp roots cleaned up in `finally` blocks (no leak)
- [ ] Test file picked up by `pnpm test` glob (Phase 1 step 8 added `*.test.cjs` to the glob per BLOCKER #3 fix)
- [ ] Full `pnpm test` passes (11 namespaces; **1109** pass / 0 fail / 1 skipped on native; **1108** pass / 0 fail / 2 skipped on memory)

## Risk Assessment

- **Risk:** `connectMcpServer` from `with-mcp-server.js` does not return `tempRoot` in its handle. **Mitigation:** verified at `with-mcp-server.js:92-108` — `tempRoot` IS returned. If the helper is refactored and loses this field, Phase 5 step 4's closure capture breaks; restore the field.
- **Risk:** `createClient` from `@libsql/client` is not a direct dep (it's transitive via `@mastra/libsql`). **Mitigation:** add `@libsql/client@0.17.4` to root `package.json` `dependencies` as a direct dep (matches the transitive version pinned by `@mastra/libsql@1.13.0`). Alternative: import via `await import("@mastra/libsql/node_modules/@libsql/client")` (fragile; not recommended). **Q1.A lock verification (Phase 2 risk):** `node -e 'import("@libsql/client").then(m => console.log(typeof m.createClient))'` must log `function`; if not, escalate.
- **Risk:** Server restart in Test 4 doesn't preserve storage because the second `connectMcpServer` uses a different `tempRoot` and the storage path is keyed off `tempRoot`. **Mitigation:** the storage path is `tools/learning-loop-mastra/data/mastra-memory.db` (absolute, via `import.meta.url`), NOT keyed off `GATE_ROOT` / `tempRoot`. The `tempRoot` is for `meta-state.jsonl` isolation; storage is shared across all server processes on the same machine. **Verify:** inspect `storage.js` Phase 2 step 4 — `DATA_DIR` is `join(__dirname, "data")` where `__dirname` is `tools/learning-loop-mastra`. Two sessions against the same machine share the same `mastra-memory.db`. The cross-restart test works.
- **Risk:** Two Test 4 invocations in the same suite (CI rerun) accumulate records in `mastra-memory.db` (NOT cleaned up because the file is gitignored and persists across server processes). **Mitigation:** add a top-level `after` hook that cleans up `rec-mcp-001` via direct `getParityDb().execute(DELETE ...)` after the MCP describe block. Acceptable: the test data is harmless noise in a gitignored file.

## Security Considerations

The harness spawns the production MCP server with realistic test fixtures. The server's storage workflows are deterministic and accept only the 3 fields they declare (id, kind, payload). There is no SQL injection risk (storage layer parameterizes queries). There is no DoS risk: per-test fixtures are bounded, and the storage file is gitignored.

For production: the MCP server exposes `run_workflow_storage_round_trip` and `run_workflow_storage_read` to any MCP client. If untrusted clients can invoke these, the `id` and `payload` fields are user-controlled. Validate at the consumer layer (downstream plans); the storage layer trusts the workflow API surface.

## Next Steps

Phase 6 runs the full `pnpm test` to confirm 1109 pass / 0 fail / 1 skipped on native driver (and 1108 / 0 / 2 skipped on memory driver per BLOCKER #2 + MINOR #4); runs `pnpm test:cold-session` (legacy 31-entry manifest; scope unchanged by Plan 2 per BLOCKER #4) and `workflow-parity.test.cjs:159` (the SEPARATE 41-tool enumeration gate); flips tracker D5/D6 `[x]`; files `meta_state_log_change` (semantic, D5+D6 closure, mentioning Q1.A lock); writes journal entry; drafts PR body with the count matrix.

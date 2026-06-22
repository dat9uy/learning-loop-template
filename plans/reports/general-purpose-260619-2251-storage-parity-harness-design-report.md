# Researcher B — Storage Parity Test Harness Design

**Type:** research report (test design)
**Date:** 2026-06-19
**Slug:** storage-parity-harness-design
**Status:** complete
**Aligned to:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (Plan 2 row + "Plan 2 Scope Clarification" section) + `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` (Storage/Memory/Meta-state boundary) + `plans/260618-1911-phase-d-plan-1-workflows/phase-05-workflow-parity-harness.md` (mirror pattern)

---

## TL;DR

The storage parity harness proves **two things**: (1) LibSQL is a functionally complete persistence substrate for Mastra runtime (write/read/list round-trip; cross-restart persistence), and (2) the substrate-level contract is **honest about being separate from meta-state** — the JSONL sidecar test pins the boundary, not the parity. The harness ships as `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` with **6 tests**: 1 substrate round-trip, 1 JSONL equivalent (with the same shape + same asserts), 1 cross-restart persistence, 1 MCP-server-wiring integration test, 1 isolation test (no cross-test contamination), 1 tools/list enumeration test. It reuses the existing `with-mcp-server.js` helper (no new spawn infrastructure) and adds a small new helper `withTempStorageRoot()` for per-test storage isolation. Total: 6 tests, ~200 LOC.

---

## 1. Parity Data Shape (the substrate-level contract)

### 1.1 The shape

```js
// The parity data shape — minimal to prove round-trip, not coupled to meta-state.
type StorageRecord = {
  id: string;          // unique key, e.g. "rec-test-001"
  kind: string;        // free-form tag, e.g. "test-fixture"
  payload: unknown;    // any JSON-serializable value
  createdAt: string;   // ISO timestamp
};
```

This is a **3-field shape** (id, kind, payload, createdAt). It is intentionally lighter than the meta-state entry shape (which has 4 kinds × status lifecycle × evidence refs × verification spec). The reason: we are testing the **substrate**, not the meta-state semantics.

### 1.2 Operation set

Three operations, no more:

| Operation | LibSQL | JSONL sidecar |
|---|---|---|
| `write(record)` | INSERT row into a `records` table | append a line to `records.jsonl` |
| `read(id)` | SELECT row WHERE id = ? | scan JSONL line-by-line |
| `list()` | SELECT all rows | read whole file, split by `\n` |

No `update`, no `delete`. The harness proves **round-trip**, not CRUD. If round-trip works for write/read/list, the substrate is functionally complete for the Plan 1 workflow `stateSchema` persistence use case (one-shot write at suspend, read on resume, list at startup). CRUD is a follow-up concern for Plan 3 (multi-step stateSchema restructuring).

### 1.3 Why this shape, not the meta-state shape

The brainstorm Q1-Q5 (resolved) lock meta-state as **JSONL only**, with no LibSQL migration in scope. Forcing the parity test to use the full 4-kind meta-state shape would:
1. Re-open the "is meta-state in Storage?" question (already settled: NO, per `mastra-storage-memory-260619-1918-direction-clarification-report.md` §2).
2. Couple the substrate test to a domain model it doesn't need to know about.
3. Make the JSONL sidecar test pretend to be the actual meta-state registry — but it isn't; it's a parity fixture.

The chosen shape (id/kind/payload/createdAt) is **the minimum that proves a substrate works**: a key, a tag, an opaque blob, a timestamp. Nothing more. The JSONL sidecar is exactly that — a sequence of those records, one per line. Both the LibSQL table and the JSONL file store **the same shape**; the parity test asserts they can be read back identically.

### 1.4 Storage backend mapping (LibSQL)

```js
// tools/learning-loop-mastra/storage.js (design sketch — for planner reference)
import { LibSQLStore } from "@mastra/libsql";
import { createClient } from "@libsql/client";

export function createMastraStorage(dbPath) {
  return new LibSQLStore({
    id: "mastra-storage",
    url: `file:${dbPath}`,
  });
}

// For the parity harness (test-side, not server-side):
export function createLibSQLClient(dbPath) {
  return createClient({ url: `file:${dbPath}` });
}

// SQL DDL for the parity shape:
const DDL = `
  CREATE TABLE IF NOT EXISTS parity_records (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`;
```

The SQL table is keyed by `id` (TEXT PRIMARY KEY) with `payload` stored as TEXT (JSON-stringified). This is the **substrate-level contract**: any schema the runtime needs (workflow stateSchema, suspend snapshots, thread/messages) can be stored in this table or in similar tables Plan 3+ can add. The parity test only exercises this one table.

---

## 2. Test Cases (6 concrete cases)

### Test 1: substrate round-trip — write then read returns identical record

```js
test("libsql: write then read returns identical record", { timeout: 10000 }, async () => {
  const { db, storageRoot } = await withTempStorageRoot();
  try {
    await db.execute(DDL);
    const rec = { id: "rec-test-001", kind: "test-fixture", payload: { x: 1, y: "two" }, createdAt: "2026-06-19T22:00:00.000Z" };
    await writeRecord(db, rec);

    const fetched = await readRecord(db, "rec-test-001");
    assert.deepEqual(fetched, rec, "round-trip must return identical record");
  } finally {
    cleanup(storageRoot);
  }
});
```

- **Setup:** Fresh empty LibSQL db in a temp dir.
- **Action:** INSERT one record via `db.execute()`, read it back via `db.execute(SELECT ... WHERE id = ?)`.
- **Assertion:** `assert.deepEqual(fetched, original)` — full structural equality including nested `payload`.
- **Why load-bearing:** proves the substrate can serialize a complex nested object and read it back losslessly. Catches type coercion (JSON→TEXT→JSON) bugs and timestamp format drift.

### Test 2: JSONL sidecar parity — same data, same ops, same assertions

```js
test("jsonl sidecar: write then read returns identical record", { timeout: 10000 }, async () => {
  const { jsonlPath, storageRoot } = await withTempStorageRoot();
  try {
    const rec = { id: "rec-test-001", kind: "test-fixture", payload: { x: 1, y: "two" }, createdAt: "2026-06-19T22:00:00.000Z" };
    await writeJsonl(jsonlPath, rec);

    const fetched = await readJsonl(jsonlPath, "rec-test-001");
    assert.deepEqual(fetched, rec, "JSONL round-trip must return identical record");
  } finally {
    cleanup(storageRoot);
  }
});
```

- **Setup:** Fresh empty `records.jsonl` file in the same temp dir as test 1.
- **Action:** Append one line (JSON.stringify + `\n`); read it back (split by `\n`, JSON.parse each line, filter by id).
- **Assertion:** `assert.deepEqual(fetched, original)` — same shape, same ops, same asserts as Test 1.
- **Why load-bearing:** proves the **parity** claim is honest. The two tests share their data shape (id/kind/payload/createdAt) and operation set (write/read/list). They are not byte-identical at the storage layer (SQL vs JSONL), but they ARE byte-identical at the **logical contract** (what you wrote is what you read). This is what "substrate parity" means — not "same bytes on disk" but "same observable behavior for the consumer."

### Test 3: cross-restart persistence — data survives client close + reopen

```js
test("libsql: data persists across client close + reopen", { timeout: 10000 }, async () => {
  const { dbPath, storageRoot } = await withTempStorageRoot();
  try {
    // Phase 1: open client, write, close
    const client1 = createLibSQLClient(dbPath);
    await client1.execute(DDL);
    await writeRecord(client1, { id: "rec-survives", kind: "k", payload: { v: 42 }, createdAt: "2026-06-19T22:00:00.000Z" });
    client1.close();

    // Phase 2: open a fresh client against the same file, read
    const client2 = createLibSQLClient(dbPath);
    const fetched = await readRecord(client2, "rec-survives");
    assert.equal(fetched.payload.v, 42, "data must persist across close/reopen");
    client2.close();
  } finally {
    cleanup(storageRoot);
  }
});
```

- **Setup:** Temp dir + new LibSQL file.
- **Action:** Write a record, close the client, open a fresh client to the same file, read.
- **Assertion:** The record is still there.
- **Why load-bearing:** proves the storage is **persistent on disk**, not just process-memory. Catches the "in-memory-only mode accidentally enabled" failure mode (if someone sets `url: ":memory:"` instead of `file:${dbPath}`). This is the test that proves Plan 2's deliverable matches the brainstorm's "Mastra runtime substrate" intent.

### Test 4: MCP-server wiring — workflow that touches storage persists across server restart

```js
test("mcp integration: server restart preserves storage state", { timeout: 20000 }, async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "storage-mcp-"));
  const dbPath = join(tempRoot, "mastra-memory.db");
  process.env.MASTRA_STORAGE_PATH = dbPath;
  let handles;
  try {
    // Server session 1: spawn, write via a storage-touching workflow, exit
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
    await handles.callTool("run_workflow_storage_round_trip", {
      id: "rec-mcp-001",
      kind: "mcp-fixture",
      payload: { source: "session-1" },
    });
    await handles.cleanup();

    // Server session 2: spawn fresh, read back, verify
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
    const result = await handles.callTool("run_workflow_storage_read", {
      id: "rec-mcp-001",
    });
    assert.equal(result.found, true, "record must be found in fresh server session");
    assert.equal(result.payload.source, "session-1", "payload must match what session-1 wrote");
  } finally {
    if (handles) await handles.cleanup();
    cleanup(tempRoot);
  }
});
```

- **Setup:** Spawn the mastra server, set `MASTRA_STORAGE_PATH` to a temp DB path.
- **Action:** Call a workflow that writes via `storage.set()` (Plan 1's `run_workflow_*` factory exposes the workflow's storage API). Restart the server (cleanup + reconnect). Read the record via a second workflow that reads via `storage.get()`.
- **Assertion:** The record from session-1 is visible to session-2.
- **Why load-bearing:** this is the **end-to-end integration test** that proves the storage backend wires into the MCP server, into the Mastra runtime, into a workflow's `stateSchema`. If any link in the chain is broken, this test fails. Specifically:
  - Storage backend instantiated correctly (constructor + URL).
  - Wired into the `Mastra` instance or `MCPServer` (server.js import).
  - Accessible from within a workflow's execute (Plan 1's factory surfaces it).
  - Persists across process boundaries (LibSQL file format works).

  **Workaround for the absence of a workflow that touches storage in Plan 1:** Plan 1 ships thin `stateSchema = input` for all 8 workflows — none of them read or write storage today. The harness can either:
  - (a) Add a tiny new workflow `workflow_storage_round_trip` to Plan 2 (1 file, ~30 LOC; TDD-first; same factory as the 8 existing). This is the cleanest path.
  - (b) Use one of Plan 1's existing workflows as a proxy (e.g., call `run_workflow_classify_prompt`, which under the hood MIGHT use storage for state persistence in future; but it doesn't today, so this is a no-op test).
  - (c) Skip this test and rely on Test 3 for cross-restart. But then the MCP integration isn't actually proven.

  **Recommendation: option (a).** Plan 2 ships a 9th workflow (or a separate test-only tool) whose sole purpose is to exercise storage from inside the Mastra runtime. This is a real shape that Plan 3's multi-step `stateSchema` workflows will use, so it has forward value. The planner should add it to the Plan 2 file list as `tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js`.

### Test 5: isolation — two concurrent tests get separate storage, no cross-contamination

```js
test("storage isolation: two temp roots do not share state", { timeout: 15000 }, async () => {
  const { dbPath: dbA } = await withTempStorageRoot("iso-A-");
  const { dbPath: dbB } = await withTempStorageRoot("iso-B-");
  try {
    const clientA = createLibSQLClient(dbA);
    const clientB = createLibSQLClient(dbB);
    await clientA.execute(DDL);
    await clientB.execute(DDL);

    await writeRecord(clientA, { id: "rec-A", kind: "iso", payload: { which: "A" }, createdAt: NOW });
    // Don't write to B; assert B is empty
    const fetchedA = await readRecord(clientA, "rec-A");
    const fetchedB = await readRecord(clientB, "rec-A");
    assert.ok(fetchedA, "A must see its own record");
    assert.equal(fetchedB, null, "B must NOT see A's record (different dbPath)");
    clientA.close();
    clientB.close();
  } finally {
    cleanup(dbA);
    cleanup(dbB);
  }
});
```

- **Setup:** Two independent temp dirs, two independent LibSQL files.
- **Action:** Write to A, do not write to B. Read from both.
- **Assertion:** A sees the record, B does not.
- **Why load-bearing:** proves the harness doesn't accidentally share storage across tests. Catches the "process-level singleton" anti-pattern (a module that creates a single `LibSQLStore` on import and reuses it across tests — would leak state). Same kind of failure mode the Phase C Plan 2 mutex test catches for the meta-state registry (`connect-mcp-server-mutex.test.js`).

### Test 6: tools/list enumeration — mastra server registers storage + workflow parity tools

```js
test("tools/list: storage registration surfaces 1 storage + 1 read workflow", { timeout: 10000 }, async () => {
  const handles = await withMcpServerForStorage();
  try {
    const tools = await handles.listTools();
    const storageTools = tools.filter((t) => t.name.includes("storage") || t.name.includes("run_workflow_storage"));
    assert.ok(storageTools.length >= 2, `expected at least 2 storage-related tools, got ${storageTools.length}`);

    const writeTool = tools.find((t) => t.name === "run_workflow_storage_round_trip");
    const readTool = tools.find((t) => t.name === "run_workflow_storage_read");
    assert.ok(writeTool, "write workflow tool must be registered");
    assert.ok(readTool, "read workflow tool must be registered");
    assert.ok(writeTool.inputSchema && writeTool.inputSchema.type === "object", "must have object inputSchema");
    assert.ok(readTool.inputSchema && readTool.inputSchema.type === "object", "must have object inputSchema");
  } finally {
    await handles.cleanup();
  }
});
```

- **Setup:** Spawn the mastra server.
- **Action:** `listTools()`, filter for storage-related names.
- **Assertion:** The two storage-touching workflows are present with valid object inputSchemas.
- **Why load-bearing:** same shape as `workflow-parity.test.cjs` test 9 (`tools/list enumerates 31 mastra_* + 8 run_workflow_* = 39 total`). The cold-session discoverability test is downstream — this is the storage-specific enumeration guard. Catches manifest drift and missing registration in one test.

---

## 3. Test File Structure

### 3.1 Location

`tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` — `.cjs` extension matches `workflow-parity.test.cjs` and `mcp-protocol-e2e.test.cjs` in the same directory. CommonJS for the spawn-loop compatibility with `connectMcpServer` from `with-mcp-server.js` (which is ESM but imported via dynamic import). Actually — `with-mcp-server.js` is ESM (uses `import`/`export`) but tests call it via `require()` after dynamic `import()`. The pattern is established in `workflow-parity.test.cjs:14` and works; storage-parity.test.cjs follows the same.

### 3.2 Spawn vs direct LibSQL

**Mixed mode** — use direct `LibSQLStore`/`createClient` for the 4 substrate tests (1, 2, 3, 5) and **spawn the mastra server** for the 2 integration tests (4, 6).

Rationale:
- Substrate tests don't need the MCP layer; they prove LibSQL works in isolation. Direct calls are 10× faster than spawning a server per test.
- Integration tests need the real wire (Mastra runtime → MCP server → workflow → storage). Direct calls would prove nothing about whether the server can reach the substrate.
- Same split as Plan 1's `workflow-direct-parity.test.js` (direct unit) vs `workflow-parity.test.cjs` (MCP-level integration). Mirrors the proven pattern.

### 3.3 Helpers

**Reuse:** `connectMcpServer` from `tools/learning-loop-mastra/__tests__/with-mcp-server.js:55-109` — same spawn helper Plan 1 and Phase C Plan 2 use. No new spawn infrastructure. The `tempRoot` pattern (`with-mcp-server.js:117-128`) is reused for the per-test temp storage path.

**Add (small, ~30 LOC):** `withTempStorageRoot` helper at the top of `storage-parity.test.cjs`:

```js
function withTempStorageRoot(prefix = "storage-parity-") {
  const storageRoot = mkdtempSync(join(tmpdir(), prefix));
  const dbPath = join(storageRoot, "mastra-memory.db");
  const jsonlPath = join(storageRoot, "records.jsonl");
  return { storageRoot, dbPath, jsonlPath, cleanup: () => rmSync(storageRoot, { recursive: true, force: true }) };
}
```

The prefix argument lets Test 5 distinguish two parallel temp roots in the same test (`iso-A-` and `iso-B-`).

**Do NOT add:** a new `withMcpServerForStorage` helper. Just inline the `connectMcpServer` call in Test 4 and Test 6. Plan 1's `workflow-parity.test.cjs` does the same — no per-test helper, just a top-level `before` to share the spawn.

### 3.4 Test ordering and shared `before`

Use a top-level `describe("storage parity harness", () => { ... })` with a shared `before` for Test 6 only (the tools/list enumeration). Tests 1-5 are pure-function + LibSQL-client tests; they don't need the server spawn. Spawning a server per test would add 5-10s × 4 = 20-40s of CI time for zero test coverage gain.

```js
describe("storage parity harness", () => {
  // Tests 1-5: no server spawn. Use direct LibSQL calls.
  test("libsql: write then read returns identical record", ...);
  test("jsonl sidecar: write then read returns identical record", ...);
  test("libsql: data persists across client close + reopen", ...);
  test("storage isolation: two temp roots do not share state", ...);

  // Tests 4 + 6: spawn server once in before, share across both tests.
  let handles;
  before(async () => {
    handles = await connectMcpServer(SERVER_ENTRY, mkdtempSync(...));
  }, { timeout: 15000 });
  after(async () => {
    if (handles) await handles.cleanup();
  });

  test("mcp integration: server restart preserves storage state", ...);
  test("tools/list: storage registration surfaces 1 storage + 1 read workflow", ...);
});
```

This halves the MCP-spawn CI time (1 spawn instead of 2 for the integration tests) and matches the established pattern from `mcp-protocol-e2e.test.cjs` and `workflow-parity.test.cjs`.

---

## 4. Substrate-to-MCP Integration Test

### 4.1 The problem

Plan 1 ships 8 workflows with thin `stateSchema = input`. None of them touch storage. The substrate-to-MCP integration test needs a workflow that **does** touch storage — otherwise the test is vacuous.

### 4.2 The solution: ship 2 new workflows in Plan 2

Add to the Plan 2 file list:

1. `tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js` — writes a record via the storage backend, returns the record's id and storage ack.
2. `tools/learning-loop-mastra/workflows/workflow-storage-read.js` — reads a record by id from the storage backend, returns `{ found, payload }`.

These are the **minimum viable workflows that exercise storage from inside the Mastra runtime**. Both ship with thin `stateSchema = input` (parity-faithful, per Plan 1's Q1 conflict resolution). The integration test calls them via `run_workflow_storage_round_trip` and `run_workflow_storage_read` (Plan 1's `LoopMCPServer.convertWorkflowsToTools` adds the `run_` prefix automatically).

### 4.3 The workflow code (TDD-first; for planner reference)

```js
// tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js (sketch)
import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { getMastraStorage } from "../storage.js";

export const workflowStorageRoundTrip = createWorkflow({
  id: "workflow_storage_round_trip",
  description: "Writes a record to the Mastra storage backend and returns the assigned id. Used by storage-parity.test.cjs.",
  inputSchema: z.object({
    id: z.string(),
    kind: z.string(),
    payload: z.unknown(),
  }),
  outputSchema: z.object({ id: z.string(), written: z.boolean() }),
})
  .then(async ({ id, kind, payload }) => {
    const storage = getMastraStorage();
    await storage.set(`records:${id}`, { id, kind, payload, createdAt: new Date().toISOString() });
    return { id, written: true };
  })
  .commit();
```

```js
// tools/learning-loop-mastra/workflows/workflow-storage-read.js (sketch)
import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { getMastraStorage } from "../storage.js";

export const workflowStorageRead = createWorkflow({
  id: "workflow_storage_read",
  description: "Reads a record from the Mastra storage backend by id. Used by storage-parity.test.cjs.",
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({ found: z.boolean(), payload: z.unknown().nullable() }),
})
  .then(async ({ id }) => {
    const storage = getMastraStorage();
    const result = await storage.get(`records:${id}`);
    if (!result) return { found: false, payload: null };
    return { found: true, payload: result };
  })
  .commit();
```

The actual API surface (`storage.set/get`, or `storage.stores.<table>.save/get`) depends on the Mastra version's exact API. The planner should verify against the installed `@mastra/libsql` types at Plan 2 author time. The sketches above are API-shape placeholders; the contract (write a record by id, read a record by id) is fixed.

### 4.4 Workflows manifest update

`tools/learning-loop-mastra/workflows-manifest.json` grows from 8 to 10 entries:

```json
[
  ...8 existing workflow entries...,
  { "file": "workflows/workflow-storage-round-trip.js", "export": "workflowStorageRoundTrip" },
  { "file": "workflows/workflow-storage-read.js", "export": "workflowStorageRead" }
]
```

`tools/list` enumeration now has 31 mastra_* + 8 run_workflow_* + 2 new run_workflow_storage_* = **41 total tools**. Update Plan 1's `workflow-parity.test.cjs:159` assertion from `39` to `41` (this is the manifest drift guard Plan 1's brainstorm §"Process patterns that worked" #6 promised — file a meta-finding if not).

---

## 5. WSL2 / Native Binding Fallback

### 5.1 The risk

Per brainstorm risk #2: "@libsql/client + native bindings; WSL2 build issues." `@libsql/client` ships with native bindings (`better-sqlite3`) by default. On WSL2 with a clean distro, the postinstall step may fail (no C++ toolchain, or glibc version mismatch). The brainstorm's fallback: "in-memory SQLite via `@libsql/client` `file::memory:?`".

### 5.2 Verification via Mastra docs

Per https://mastra.ai/reference/storage/libsql (fetched 2026-06-19):

- `LibSQLStore` accepts `url: 'file:./storage.db'`, `url: ':memory:'`, or `url: 'libsql://...'` (remote Turso).
- The official Mastra docs use `file:./storage.db` as the local-file pattern — not `file::memory:?`.
- The `:memory:` format is documented for LibSQLStore directly, no `file::memory:?` prefix needed.

**Correction to the brainstorm's fallback:** the right fallback is `url: ':memory:'` (not `file::memory:?`). `@libsql/client` accepts both, but the simpler `:memory:` is what Mastra's docs use. Planners should update the brainstorm's fallback wording to `:memory:`.

### 5.3 Native-binding fallback strategy

Three-tier, fail-closed:

1. **Primary:** `file:${dbPath}` — works on any platform with native bindings compiled.
2. **Fallback A (postinstall fails):** `@libsql/client` ships a pure-JS variant (`@libsql/client/web`) with no native bindings. Switch the import path; same API. The harness detects this via `process.env.MASTRA_STORAGE_DRIVER === "web"` env var, set in CI when the install probe fails.
3. **Fallback B (everything fails):** `url: ':memory:'` — works always (no I/O, no bindings). Data lost on process exit. **The harness MUST detect this and emit a warning** so a real install failure is surfaced (not silently masked by the in-memory fallback).

### 5.4 What the harness does on install failure

The harness does NOT skip tests on install failure. Instead:

- The install probe (Plan 2 Phase 1, separate from the harness) sets `MASTRA_STORAGE_DRIVER`:
  - `MASTRA_STORAGE_DRIVER=native` → `file:${dbPath}` (Tests 1, 3, 4 work; Test 2 unaffected; Test 5 works).
  - `MASTRA_STORAGE_DRIVER=web` → `@libsql/client/web` with `file:${dbPath}` (same as native; bindings-free).
  - `MASTRA_STORAGE_DRIVER=memory` → `url: ':memory:'` (Test 3 SKIPPED via `t.skip` because cross-restart is impossible; Tests 1, 2, 4, 5, 6 still run).

**Detection in test code:**

```js
const driver = process.env.MASTRA_STORAGE_DRIVER || "native";
test("libsql: data persists across client close + reopen", { timeout: 10000 }, async (t) => {
  if (driver === "memory") {
    t.skip("MASTRA_STORAGE_DRIVER=memory; cross-restart persistence requires file-backed storage");
    return;
  }
  // ... actual test body
});
```

The skip message is **logged to stderr** so a CI run that accidentally falls back to memory is visible (Test 3 always being skipped is a red flag worth investigating).

### 5.5 The fallback is for CI/dev, not production

Production uses `file:${dbPath}` (locked per brainstorm Q2). The fallback is a CI safety net so the gate doesn't block forever if a developer's WSL2 install is broken. The production path is always tested first; the fallback only fires when install fails.

---

## 6. Test Count Math + Whole-Suite Impact

### 6.1 New tests added

| Test # | Test name | Type | Timeout |
|---|---|---|---|
| 1 | `libsql: write then read returns identical record` | substrate direct | 10s |
| 2 | `jsonl sidecar: write then read returns identical record` | substrate direct | 10s |
| 3 | `libsql: data persists across client close + reopen` | substrate direct (skipped if memory) | 10s |
| 4 | `mcp integration: server restart preserves storage state` | MCP spawn | 20s |
| 5 | `storage isolation: two temp roots do not share state` | substrate direct | 15s |
| 6 | `tools/list: storage registration surfaces 1 storage + 1 read workflow` | MCP spawn (shares with #4) | 10s |

**Total: 6 tests.**

### 6.2 Whole-suite impact

- **Currently:** Plan 1's closeout: 1083 pass / 0 fail / 1 skipped (`brainstorm-260618-1538-phase-d-plan-split-report.md:376`).
- **Plan 2 adds:** +6 tests in `storage-parity.test.cjs`.
- **Plan 2 modifies:** `tools/list` count in `workflow-parity.test.cjs:159` (39 → 41). This is a manifest drift guard, not a test addition.
- **Net change:** +6 tests. Whole suite: 1089 pass / 0 fail / 2 skipped (1 pre-existing + 1 new conditional skip on memory driver).

### 6.3 Comparison to Plan 1's count math

Plan 1 added **21 tests** (5 factory invariants + 8 direct unit parity + 8 MCP parity per Plan 1's `Whole-Plan Consistency Sweep`). Plan 2 adds **6 tests** — about 1/3 of Plan 1's count.

The lower count is honest: Plan 2's substrate is a single concern (LibSQL round-trip + MCP wiring + isolation). Plan 1's workflows are 8 distinct concerns (8 different workflows × parity layers). The Plan 2 count is **right-sized** for the scope. Adding more tests would be padding, not coverage.

### 6.4 Net namespace count

`storage-parity.test.cjs` is a new test file (new namespace). The 10-namespace count becomes 11 namespaces post-Plan 2. The "all 10 namespaces pass" tracker language (per brainstorm §"Test gate") needs a one-word update: "all 11 namespaces pass." The planner should note this in the Phase 5 success criteria.

### 6.5 CI time budget

- 4 substrate tests @ ~50ms each = ~200ms.
- 1 MCP integration test @ ~15s (2 server spawns).
- 1 tools/list enumeration @ ~5s (shares the second spawn).
- Total: ~20s.

This fits well under Plan 1's per-test budget (~10s) for the MCP tests and is negligible for the substrate tests.

---

## 7. Recommendations for the Planner

### 7.1 File list for Plan 2 (additions to brainstorm §"Touchpoints Plan 2")

Create:
- `tools/learning-loop-mastra/storage.js` (LibSQL config + `getMastraStorage()` helper).
- `tools/learning-loop-mastra/workflows/workflow-storage-round-trip.js` (write workflow).
- `tools/learning-loop-mastra/workflows/workflow-storage-read.js` (read workflow).
- `tools/learning-loop-mastra/__tests__/storage-parity.test.cjs` (the 6 tests).
- `tools/learning-loop-mastra/data/.gitignore` (gitignore the data dir; keep `data/` present for runtime).

Modify:
- `tools/learning-loop-mastra/package.json` — add `@mastra/libsql` dep.
- `tools/learning-loop-mastra/workflows-manifest.json` — add 2 new entries.
- `tools/learning-loop-mastra/server.js` — wire storage backend into `Mastra`/`MCPServer` constructor.
- `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:159` — bump tool count from 39 to 41.
- `plans/reports/productization-260612-1530-master-tracker.md` — flip D5/D6 `[x]` after gate passes (Phase 8 closeout).

### 7.2 Phase structure (suggested)

| Phase | Concern | TDD | Notes |
|---|---|---|---|
| 1 | Install probe (`pnpm add @mastra/libsql`; verify on WSL2; pick driver) | n/a (mechanical) | Sets `MASTRA_STORAGE_DRIVER` env var for downstream tests |
| 2 | `storage.js` LibSQL config + `getMastraStorage()` | n/a (config + factory) | 1 file ~50 LOC |
| 3 | `workflow-storage-round-trip` + `workflow-storage-read` | RED → GREEN (5 tests; same as Plan 1 Phase 3) | 2 new workflow files + workflow-direct unit tests |
| 4 | `server.js` wiring + manifest updates | n/a (config) | Add 2 workflows to `workflows-manifest.json`; bump `tools/list` count |
| 5 | `storage-parity.test.cjs` (the 6 tests) | TDD per concern | This report's deliverable |
| 6 | Acceptance gate + closeout | verify-only | `pnpm test` → 1089 pass; D5/D6 flip |

### 7.3 The fallback wording correction

The brainstorm risk #2 says "fall back to in-memory SQLite via `@libsql/client` `file::memory:?`". The correct format per Mastra docs is `url: ':memory:'` (no `file:` prefix when using LibSQLStore directly). The planner should update this in the Phase 1 install-probe phase doc.

### 7.4 The 2-workflow addition is forward-compatible, not scope creep

The two storage workflows are small (~30 LOC each) and:
- Plan 3's multi-step `stateSchema` workflows will reuse the same `getMastraStorage()` pattern.
- The `tools/list` enumeration test catches manifest drift (per Plan 1's `process patterns that worked` #6).
- The cold-session discoverability test (`cold-session-discoverability.test.cjs`) automatically surfaces these to operators at session start.

The alternative — skip the integration test, prove MCP wiring via a sidecar — would leave the storage→runtime→MCP wire unproven. **The 2 workflow files are the minimum viable end-to-end proof.**

### 7.5 The JSONL sidecar is a fixture, not a meta-state migration

The harness uses a JSONL sidecar to prove parity. The sidecar file is **per-test** (`records.jsonl` in the temp dir) and **discarded after each test**. It is NOT a replacement for `meta-state.jsonl`, NOT a migration path, NOT a long-lived artifact. The harness docs should call this out explicitly so a reader doesn't conflate the sidecar with the actual meta-state registry.

---

## Open Questions

1. **Storage API surface for `getMastraStorage()`** — does the installed `@mastra/libsql` expose `storage.set/get` directly, or via `storage.stores.<table>.save/get`? The planner must verify against `node_modules/@mastra/libsql/dist/*.d.ts` at Plan 2 author time. The workflow sketches in §4.3 use `.set/.get` as the most common API; adjust if the installed version differs.

2. **Mastra version check** — `Mastra`/`MCPServer` constructors may or may not accept a `storage:` option directly. Plan 1 ships `MCPServer`; Plan 2 needs to verify the constructor signature accepts the LibSQL backend. If not, the wire point may be `new Mastra({ storage, mcpServers })` wrapping the existing MCPServer.

3. **Per-test temp root mutex** — `with-mcp-server.js`'s `inFlightByTempRoot` mutex serializes operations sharing a `GATE_ROOT`. The storage parity tests use **separate temp roots per test** (no shared GATE_ROOT for the LibSQL paths), so no mutex needed for Tests 1-3, 5. Tests 4, 6 share one tempRoot via the existing `connectMcpServer` helper — the existing mutex applies automatically.

4. **Should the 2 storage workflows be in `workflows-manifest.json` or a separate `storage-manifest.json`?** — this report's §4.4 says `workflows-manifest.json` (consistent with the existing pattern). The planner may revisit if Plan 4's cutover wants a separate `storage` group in `agent-manifest.json`.

5. **Test 4's `runId` parameter** — Plan 1's `LoopMCPServer.convertWorkflowsToTools` (per Plan 1 review finding #6) generates `runId` via `proxiedContext.get("runId")` which may be undefined. Plan 2 should ensure the storage workflows receive a stable `runId` so the storage key namespace is deterministic.

---

## References (cited inline)

- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` — Plan 2 row (line 40, 113); Touchpoints Plan 2 (line 131-135); Q2 file path resolution (line 222-225); risk #2 WSL2 install (line 102-103); Plan 1 process learnings (line 296-322); "Process patterns that worked" #6 manifest drift guard (line 314).
- `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` — Storage/Memory/Meta-state boundary (line 14-23, 41-49); §2 inversion check (line 81-89); §4.3 D5/D6 edits (line 119-126); Q3 stateSchema decision (line 270-279).
- `plans/260618-1911-phase-d-plan-1-workflows/phase-05-workflow-parity-harness.md` — TDD-per-concern pattern (line 42-60); empirical probe first (line 26-31); shared `before` for spawn (line 103); tools/list enumeration test pattern (line 56-60).
- `plans/260616-2200-phase-c-plan-2-parity/plan.md` — `withBothMcpServers` serializer mutex pattern (line 32, 121); per-plan `meta_state_log_change` discipline (line 134); whole-plan test count math (line 121).
- `plans/260616-2200-phase-c-plan-2-parity/phase-02-parity-harness.md` — TDD-first 5 invariant tests (line 60-67); harness as pure functions (line 70-138).
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:55-109` — `connectMcpServer` helper (the spawn primitive).
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:117-128` — `withMcpServer` (the spawn + cleanup wrapper).
- `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:42-165` — the pattern Plan 2 mirrors (TDD-first; shared `before`; per-tool assertion; tools/list enumeration).
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` — the substrate-direct unit test pattern (no MCP spawn).
- `tools/learning-loop-mastra/server.js:81-159` — `LoopMCPServer.convertWorkflowsToTools` (how Plan 1 wires workflows into MCP; the `run_` prefix logic).
- `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` — the per-tempRoot mutex pattern (lines 1-50).
- `https://mastra.ai/reference/storage/libsql` (fetched 2026-06-19) — `LibSQLStore` constructor + URL formats; `:memory:` vs `file:` distinction.
- `brainstorm-260618-1538-phase-d-plan-split-report.md:296-322` — Plan 1 process patterns carried forward to Plan 2 (TDD-per-concern, empirical probe, parity-faithful default).

Status: DONE
Summary: Designed 6-test storage parity harness with substrate-direct (4 tests) + MCP-integration (2 tests) split, mirroring Plan 1's pattern; specified 2 new storage workflows needed for the integration test; corrected brainstorm's `file::memory:?` fallback to `:memory:` per Mastra docs.
Concerns/Blockers: (1) Storage API surface (`.set/.get` vs `.stores.<table>.save/get`) must be verified at Plan 2 author time against installed `@mastra/libsql`. (2) `Mastra`/`MCPServer` constructor signature for `storage:` option must be verified at author time. Neither is blocking for the harness design — both are plumbing details the planner resolves during Phase 2/Phase 3 author work.

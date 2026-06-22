---
phase: 2
title: "2-storage-factory"
status: pending
priority: P2
effort: "1h"
dependencies: ["1"]
---

# Phase 2: 2-storage-factory

## Overview

Ship `tools/learning-loop-mastra/storage.js` — the factory seam for the loop's Mastra persistence substrate. **TDD-first: 5 invariant tests RED, then GREEN.** The factory exports `storage` (LibSQLStore singleton), `getMastraStorage()` (lazy accessor, for future Mastra runtime domains), `getParityDb()` (direct `createClient` from `@libsql/client`, used by the 2 storage workflows for app-level records per Q1.A lock), `getParityDDL()` (idempotent DDL string for the `parity_records` table), and `initStorage()` (idempotent bootstrap). Phases 3-5 build on this seam.

## Why a separate factory file

`getMastraStorage()` (for future Mastra runtime domains) and `getParityDb()` (used by the 2 storage workflows per Q1.A lock) are the load-bearing seams between the storage substrate (LibSQL) and the consumers (Phase 3's 2 workflows; future Plan 3 agents; future Plan 5 Observational Memory). A single-purpose factory file keeps that contract explicit and testable. Inlining the constructor in `server.js` or in each workflow would scatter the URL/mkdir logic and the parity-DDL knowledge.

## Requirements

- **Functional:** factory constructs `LibSQLStore` with `id: "mastra-storage"`; URL `file:${absDataDir}/mastra-memory.db?connection_limit=1`; parent dir created via `mkdirSync({ recursive: true })` BEFORE constructor; `getMastraStorage()` returns the same singleton on repeated calls; `initStorage()` is idempotent (safe to call on every server start).
- **Non-functional:** factory does NOT spawn servers; factory does NOT call `storage.init()` at import time (lazy, so the factory can be imported by tests without side effects); absolute path derived from `import.meta.url` (CWD-relative path is fragile via MCP stdio).

## Architecture

```
storage.js (~70 LOC)
├── imports: LibSQLStore from @mastra/libsql; createClient from @libsql/client;
│            mkdirSync from node:fs; dirname, join from node:path; fileURLToPath from node:url
├── DATA_DIR: absolute path resolved from import.meta.url (fileURLToPath)
├── mkdirSync(DATA_DIR, { recursive: true })  ← runs at module load (side effect acceptable;
│                                                  the factory is imported once by server.js
│                                                  and tests that touch storage intentionally)
├── storage: new LibSQLStore({ id: "mastra-storage",
│                              url: buildUrl() })
├── getMastraStorage() → storage (lazy accessor; same singleton; for future Mastra runtime domains)
├── getParityDb() → createClient({ url: buildUrl() })  ← direct libsql client for app-level
│                                                       records (id/kind/payload/createdAt);
│                                                       used by Phase 3's 2 storage workflows
│                                                       and Phase 5 Test 1 (substrate round-trip).
│                                                       Points to the same SQLite file as `storage`
│                                                       (when driver=native|web) but uses
│                                                       disjoint tables (`parity_records`).
├── getParityDDL() → CREATE TABLE IF NOT EXISTS parity_records (...)
└── initStorage() → storage.init() (idempotent; ~12ms cold start)

storage-factory-direct.test.js (5 invariant tests, no server spawn)
├── Test 1: getMastraStorage() returns a non-null object
├── Test 2: getMastraStorage() returns the SAME instance on repeated calls (singleton)
├── Test 3: storage.id === "mastra-storage" (matches Mastra docs convention)
├── Test 4: DATA_DIR exists after module load (mkdirSync ran; SQLITE_CANTOPEN mitigated)
└── Test 5 (NEW per Q1.A lock): getParityDb() returns a non-null libsql client
```

**Q1.A — Storage API surface (LOCKED 2026-06-19 at planning time per validate decision):** Plan 2 uses `createClient` from `@libsql/client` directly for the 2 storage workflows' read/write operations. The Mastra storage abstraction (`LibSQLStore`) is for future Mastra runtime domains (workflow snapshots, threads, etc.) and is NOT used by the 2 storage workflows. Verified against https://mastra.ai/reference/storage/libsql (fetched 2026-06-19): `LibSQLStore` exposes domain stores via `getStore('<domain>')` only; no generic CRUD API. App-level records (id/kind/payload/createdAt) don't fit any Mastra domain. The 5 invariant tests verify the factory exports `getMastraStorage()` AND `getParityDb()`; the API surface is fixed; no runtime verification needed.

**URL semantics (from researcher A §2.3):**

| URL | Use case | Plan 2 |
|---|---|---|
| `file:${absPath}/mastra-memory.db?connection_limit=1` | Local file, single-writer | **PRIMARY** |
| `url: ':memory:'` | In-memory SQLite (process-lifetime) | **FALLBACK** when `MASTRA_STORAGE_DRIVER=memory` |
| `libsql://<org>.turso.io` | Remote Turso | NOT IN PLAN 2 |

The `connection_limit=1` query param forces single-connection mode — the safest for Plan 2's single-process MCP server. Researcher A §1.4 verified this on WSL2.

## Related Code Files

- **Create:** `tools/learning-loop-mastra/storage.js` (~70 LOC)
- **Create:** `tools/learning-loop-mastra/__tests__/storage-factory-direct.test.js` (5 invariant tests)

## Implementation Steps

1. **TDD: write 5 invariant tests first (RED).** Use real `LibSQLStore` and real `createClient` (no mocks):
   ```js
   // tools/learning-loop-mastra/__tests__/storage-factory-direct.test.js
   import { test } from "node:test";
   import assert from "node:assert/strict";
   import { existsSync } from "node:fs";
   import { getMastraStorage, getParityDb, storage } from "../storage.js";

   test("storage factory: getMastraStorage() returns a non-null object", () => {
     assert.ok(getMastraStorage(), "must return a storage instance");
     assert.equal(typeof getMastraStorage, "function");
   });

   test("storage factory: getMastraStorage() returns the same instance on repeated calls (singleton)", () => {
     const a = getMastraStorage();
     const b = getMastraStorage();
     assert.strictEqual(a, b, "singleton must return the same instance");
     assert.strictEqual(a, storage, "getMastraStorage must return the module-level storage");
   });

   test('storage factory: storage.id === "mastra-storage" (matches Mastra docs convention)', () => {
     assert.equal(getMastraStorage().id, "mastra-storage");
   });

   test("storage factory: DATA_DIR exists after module load (mkdirSync ran)", () => {
     // Resolve DATA_DIR the same way storage.js does
     const { dirname, join } = await import("node:path");
     const { fileURLToPath } = await import("node:url");
     const __dirname = dirname(fileURLToPath(import.meta.url));
     const dataDir = join(__dirname, "..", "data");
     assert.ok(existsSync(dataDir), `DATA_DIR must exist at ${dataDir} (mkdirSync must run before LibSQLStore constructor)`);
   });

   // Test 5 (NEW per Q1.A lock — direct libsql client for app-level records):
   test("storage factory: getParityDb() returns a non-null libsql client", () => {
     const db = getParityDb();
     assert.ok(db, "must return a libsql client");
     assert.equal(typeof db.execute, "function", "client must have execute() method");
   });
   ```

2. **Run tests, confirm 5 RED.**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/storage-factory-direct.test.js
   # Expected: 0/5 pass (storage.js does not exist yet → module-not-found errors)
   ```

3. **Q1.A is LOCKED at planning time.** No runtime verification needed; the storage API surface is `createClient` from `@libsql/client` (direct, bypasses the Mastra storage abstraction). Phase 3's 5 direct unit tests exercise this surface; Phase 5 Test 1 is the load-bearing substrate round-trip gate. Document the lock in the storage.js file header comment.

4. **Implement `storage.js`:**
   ```js
   // tools/learning-loop-mastra/storage.js
   import { LibSQLStore } from "@mastra/libsql";
   import { createClient } from "@libsql/client";
   import { mkdirSync } from "node:fs";
   import { dirname, join } from "node:path";
   import { fileURLToPath } from "node:url";

   const __dirname = dirname(fileURLToPath(import.meta.url));
   const DATA_DIR = join(__dirname, "data");

   // Parent directory MUST exist before LibSQLStore constructor (SQLITE_CANTOPEN
   // errno 14 if missing). Idempotent on subsequent imports.
   mkdirSync(DATA_DIR, { recursive: true });

   const driver = process.env.MASTRA_STORAGE_DRIVER || "native";

   function buildUrl() {
     if (driver === "memory") return ":memory:";
     // native | web both use the file URL — web uses @libsql/client/web internally
     return `file:${join(DATA_DIR, "mastra-memory.db")}?connection_limit=1`;
   }

   // DDL for the parity_records table used by Phase 3's 2 storage workflows
   // (and the parity harness's Test 1). Idempotent on every client.execute().
   const PARITY_DDL = `
     CREATE TABLE IF NOT EXISTS parity_records (
       id TEXT PRIMARY KEY,
       kind TEXT NOT NULL,
       payload TEXT NOT NULL,
       created_at TEXT NOT NULL
     )
   `;

   export const storage = new LibSQLStore({
     id: "mastra-storage",
     url: buildUrl(),
   });

   export function getMastraStorage() {
     return storage;
   }

   export function getParityDb() {
     // Direct libsql client. Points to the same SQLite file as `storage` (when
     // MASTRA_STORAGE_DRIVER=native|web) so parity data shares the file with
     // future Mastra runtime data (workflow snapshots, threads, etc.).
     // When driver=memory, this returns an in-memory client; cross-restart
     // persistence (Test 3) is then impossible and that test skips.
     const url = driver === "memory" ? ":memory:" : buildUrl();
     return createClient({ url });
   }

   export function getParityDDL() {
     return PARITY_DDL;
   }

   export async function initStorage() {
     await storage.init();
   }
   ```

   **Notes:**
   - The `MASTRA_STORAGE_DRIVER` env var is read at module load (not at constructor time) so changing the env var after import has no effect on the same process. This is acceptable: each server process is short-lived (MCP stdio), and the env var is set before spawn.
   - The `web` driver is functionally identical to `native` from the factory's perspective; the `web` variant lives in `@libsql/client/web` and is loaded by `@mastra/libsql` internally. Documented in `node_modules/@mastra/libsql/dist/storage/index.d.ts`.
   - Absolute path (`import.meta.url` → `fileURLToPath` → `dirname`) is robust to CWD changes when the server is spawned via MCP stdio. Relative path (`./data/mastra-memory.db`) would resolve relative to CWD which may differ.
   - **Q1.A lock (2026-06-19):** Plan 2 uses `createClient` from `@libsql/client` directly for the 2 storage workflows (Phase 3) and the parity harness (Phase 5). `getMastraStorage()` (returning the `LibSQLStore`) is retained for future Mastra runtime use (workflow snapshots, threads, etc.) but is NOT used by the 2 storage workflows. Both exports point to the same `mastra-memory.db` file but use disjoint tables. Verified against https://mastra.ai/reference/storage/libsql.

5. **Run tests, confirm 5 GREEN.**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   node --test tools/learning-loop-mastra/__tests__/storage-factory-direct.test.js
   # Expected: 5/5 pass
   ```

6. **Sanity check the factory at the console.** Confirms `initStorage()` is idempotent and ~12ms:
   ```bash
   cat > /tmp/storage-smoke.mjs <<'EOF'
   import { initStorage, getMastraStorage, getParityDb } from "/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/storage.js";
   const t0 = Date.now();
   await initStorage();
   console.log(`initStorage 1st call: ${Date.now() - t0}ms`);
   const t1 = Date.now();
   await initStorage();
   console.log(`initStorage 2nd call (idempotent): ${Date.now() - t1}ms`);
   console.log("storage.id:", getMastraStorage().id);
   const db = getParityDb();
   console.log("getParityDb().execute:", typeof db.execute);
   EOF
   node /tmp/storage-smoke.mjs
   # Expected: initStorage 1st call: ~12ms; initStorage 2nd call: <1ms (no-op); storage.id: mastra-storage; getParityDb().execute: function
   rm /tmp/storage-smoke.mjs
   ```

7. **Refactor if needed** (YAGNI; no features the factory doesn't need). The factory should NOT export `close()`; that lifecycle hook is owned by `Mastra` instance in Phase 4.

## Success Criteria

- [ ] 5 invariant tests pass (`storage-factory-direct.test.js`)
- [ ] `storage.js` exports `storage`, `getMastraStorage`, `getParityDb`, `getParityDDL`, `initStorage`
- [ ] `getMastraStorage()` returns the same instance on repeated calls (singleton verified)
- [ ] `getParityDb()` returns a non-null libsql client with `execute()` (Test 5 green; Q1.A lock)
- [ ] `storage.id === "mastra-storage"`
- [ ] `DATA_DIR` exists after module load (Test 4 green; SQLITE_CANTOPEN mitigation verified)
- [ ] `initStorage()` is idempotent (2nd call is no-op <1ms)
- [ ] No `storage.init()` call at module load (lazy; tests can import without side effects)
- [ ] `MASTRA_STORAGE_DRIVER=memory` env var honored (URL becomes `:memory:`)
- [ ] No server spawn in the factory module
- [ ] Q1.A API surface (direct `createClient` from `@libsql/client`) documented in file header comment

## Risk Assessment

- **Risk:** `mkdirSync` at module load surprises a test that imports storage.js in a sandbox where `__dirname/data` is read-only. **Mitigation:** the factory's `DATA_DIR` is `tools/learning-loop-mastra/data` (writable on the dev box and CI). If a future sandbox needs read-only mode, gate the `mkdirSync` behind an env var check (YAGNI for now).
- **Risk:** `import.meta.url` + `fileURLToPath` resolves to the wrong directory if the file is symlinked. **Mitigation:** Node.js resolves `import.meta.url` to the real path (no symlink following) by default. Verified in Node 20+ (the project's runtime).
- **Risk:** `connection_limit=1` query param is rejected by older `@libsql/client` versions. **Mitigation:** `@libsql/client@0.17.4` (transitively pinned by `@mastra/libsql@1.13.0`) supports `connection_limit` since 0.5.0; verified by researcher A §2.3.
- **Risk:** Q1.A — direct `createClient` from `@libsql/client` is not exposed by `@libsql/client@0.17.4` (transitive of `@mastra/libsql@1.13.0`). **Mitigation:** Q1.A is LOCKED at planning time; the `createClient` export is verified at install time via `node -e 'import("@libsql/client").then(m => console.log(typeof m.createClient))'`. If the export is missing, escalate (do not silently substitute).

## Security Considerations

None. The factory constructs a local SQLite file in `tools/learning-loop-mastra/data/` (gitignored). No network I/O, no privileged operations, no untrusted input parsing at the factory boundary.

## Next Steps

Phase 3 writes the 2 storage workflows (`workflow-storage-round-trip.js`, `workflow-storage-read.js`) using `getParityDb()` (and `getParityDDL()`) from this factory — per Q1.A lock, the direct libsql client, not the `LibSQLStore` abstraction. TDD-per-workflow: 5 direct unit tests first (round-trip, missing-key, complex payload, schema drift, timestamp).

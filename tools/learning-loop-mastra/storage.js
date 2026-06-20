// tools/learning-loop-mastra/storage.js
//
// Q1.A lock (2026-06-19): Plan 2 uses createClient from @libsql/client directly
// for the 2 storage workflows and the parity harness. The Mastra storage
// abstraction (LibSQLStore) is for future Mastra runtime domains (workflow
// snapshots, threads, etc.) and is NOT used by the 2 storage workflows.
// Both exports point to the same mastra-memory.db file but use disjoint tables.
// Verified against https://mastra.ai/reference/storage/libsql.

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

// For the memory driver, every call to createClient({ url: ":memory:" }) returns
// a brand-new in-memory database. The workflow-direct tests (Tests 7-11) run in
// the same process and must share one parity database, so we keep a singleton.
// MCP restart tests (Tests 4 + 6) skip under MASTRA_STORAGE_DRIVER=memory because
// a separate process cannot see this singleton.
let memoryParityDb = null;

function buildUrl() {
  if (driver === "memory") return ":memory:";
  // native | web both use the file URL — web uses @libsql/client/web internally
  return `file:${join(DATA_DIR, "mastra-memory.db")}`;
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
  // When driver=memory, this returns the singleton in-memory client; workflow
  // steps in the same process share state, but cross-process persistence is
  // impossible and those tests skip.
  if (driver === "memory") {
    if (!memoryParityDb) {
      memoryParityDb = createClient({ url: ":memory:" });
    }
    return memoryParityDb;
  }
  return createClient({ url: buildUrl() });
}

export function getParityDDL() {
  return PARITY_DDL;
}

export async function initStorage() {
  await storage.init();
}

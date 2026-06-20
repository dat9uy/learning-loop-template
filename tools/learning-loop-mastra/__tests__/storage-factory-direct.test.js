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

test("storage factory: DATA_DIR exists after module load (mkdirSync ran)", async () => {
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

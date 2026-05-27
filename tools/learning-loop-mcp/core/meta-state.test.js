import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import {
  readRegistry,
  writeEntry,
  updateEntry,
  checkAutoResolve,
  checkExpiry,
  filterEntries,
  generateId,
} from "./meta-state.js";
import { mkdtempSync, writeFileSync, utimesSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REGISTRY_FILENAME = "meta-state.jsonl";

function makeEntry(overrides = {}) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: overrides.id ?? generateId("test"),
    category: overrides.category ?? "gate-logic-bug",
    severity: overrides.severity ?? "warning",
    affected_system: overrides.affected_system ?? "gate-logic",
    description: overrides.description ?? "Test meta-state entry description",
    evidence: overrides.evidence ?? { journal: "docs/journals/test.md" },
    auto_resolve: overrides.auto_resolve ?? null,
    status: overrides.status ?? "reported",
    created_at: overrides.created_at ?? now.toISOString(),
    expires_at: overrides.expires_at ?? tomorrow.toISOString(),
    acked_at: overrides.acked_at ?? null,
    resolved_at: overrides.resolved_at ?? null,
    resolved_by: overrides.resolved_by ?? null,
    ...overrides,
  };
}

describe("meta-state registry core", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function getRegistryPath() {
    return join(tempDir, REGISTRY_FILENAME);
  }

  test("readRegistry returns empty array when file does not exist", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const entries = readRegistry(tempDir);
    assert.deepStrictEqual(entries, []);
    process.env.GATE_ROOT = originalEnv;
  });

  test("writeEntry creates valid JSONL with one line per entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e1 = makeEntry({ id: generateId("first"), description: "First entry" });
    const e2 = makeEntry({ id: generateId("second"), description: "Second entry" });
    await writeEntry(tempDir, e1);
    await writeEntry(tempDir, e2);
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].id, e1.id);
    assert.strictEqual(entries[1].id, e2.id);
    process.env.GATE_ROOT = originalEnv;
  });

  test("updateEntry patches existing entry by id", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e = makeEntry({ id: generateId("patch-test") });
    await writeEntry(tempDir, e);
    const now = new Date().toISOString();
    await updateEntry(tempDir, e.id, { status: "active", acked_at: now });
    const entries = readRegistry(tempDir);
    const updated = entries.find((entry) => entry.id === e.id);
    assert.ok(updated);
    assert.strictEqual(updated.status, "active");
    assert.strictEqual(updated.acked_at, now);
    assert.strictEqual(updated.category, e.category);
    process.env.GATE_ROOT = originalEnv;
  });

  test("checkAutoResolve returns auto-resolved when file mtime > created_at", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const targetFile = join(tempDir, "target.js");
    writeFileSync(targetFile, "// initial");
    const now = new Date();
    const oneSecAgo = new Date(now.getTime() - 1000);
    // Set mtime to the future relative to created_at
    utimesSync(targetFile, now, now);
    const e = makeEntry({
      created_at: oneSecAgo.toISOString(),
      auto_resolve: { file_modified: targetFile },
    });
    const result = checkAutoResolve(e, tempDir);
    assert.strictEqual(result, "auto-resolved");
    process.env.GATE_ROOT = originalEnv;
  });

  test("checkAutoResolve returns null when file unchanged", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const targetFile = join(tempDir, "target.js");
    writeFileSync(targetFile, "// initial");
    const now = new Date();
    // Set created_at to future relative to mtime
    const oneSecFuture = new Date(now.getTime() + 1000);
    const e = makeEntry({
      created_at: oneSecFuture.toISOString(),
      auto_resolve: { file_modified: targetFile },
    });
    const result = checkAutoResolve(e, tempDir);
    assert.strictEqual(result, null);
    process.env.GATE_ROOT = originalEnv;
  });

  test("checkExpiry returns expired when 24h passed on reported entry", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const e = makeEntry({
      status: "reported",
      created_at: yesterday.toISOString(),
      expires_at: yesterday.toISOString(),
    });
    const result = checkExpiry(e);
    assert.strictEqual(result, "expired");
  });

  test("checkExpiry returns null on active entry with no TTL", async () => {
    const e = makeEntry({
      status: "active",
      expires_at: null,
    });
    const result = checkExpiry(e);
    assert.strictEqual(result, null);
  });

  test("filterEntries by category", async () => {
    const entries = [
      makeEntry({ id: "a1", category: "gate-logic-bug" }),
      makeEntry({ id: "a2", category: "schema-drift" }),
      makeEntry({ id: "a3", category: "gate-logic-bug" }),
    ];
    const result = filterEntries(entries, { category: "gate-logic-bug" });
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((e) => e.category === "gate-logic-bug"));
  });

  test("filterEntries by status", async () => {
    const entries = [
      makeEntry({ id: "b1", status: "reported" }),
      makeEntry({ id: "b2", status: "active" }),
      makeEntry({ id: "b3", status: "reported" }),
    ];
    const result = filterEntries(entries, { status: "active" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "b2");
  });

  test("filterEntries by affected_system", async () => {
    const entries = [
      makeEntry({ id: "c1", affected_system: "gate-logic" }),
      makeEntry({ id: "c2", affected_system: "mcp-tools" }),
    ];
    const result = filterEntries(entries, { affected_system: "mcp-tools" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "c2");
  });

  test("filterEntries by multiple fields (intersection)", async () => {
    const entries = [
      makeEntry({ id: "d1", category: "gate-logic-bug", status: "reported" }),
      makeEntry({ id: "d2", category: "gate-logic-bug", status: "active" }),
      makeEntry({ id: "d3", category: "schema-drift", status: "reported" }),
    ];
    const result = filterEntries(entries, { category: "gate-logic-bug", status: "reported" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "d1");
  });

  test("compaction removes old terminal entries on updateEntry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oldTerminal = makeEntry({
      id: generateId("old-terminal"),
      status: "auto-resolved",
      created_at: eightDaysAgo.toISOString(),
      resolved_at: eightDaysAgo.toISOString(),
    });
    const freshReported = makeEntry({
      id: generateId("fresh-reported"),
      status: "reported",
    });
    await writeEntry(tempDir, oldTerminal);
    await writeEntry(tempDir, freshReported);
    // Trigger compaction via update on the fresh entry
    await updateEntry(tempDir, freshReported.id, { description: "Updated description" });
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].id, freshReported.id);
    process.env.GATE_ROOT = originalEnv;
  });

  test("concurrent writes do not corrupt JSONL", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const e = makeEntry({ id: generateId(`concurrent-${i}`), description: `Concurrent ${i}` });
      promises.push(writeEntry(tempDir, e));
    }
    await Promise.all(promises);
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 5);
    for (const entry of entries) {
      assert.ok(entry.id);
      assert.ok(entry.category);
    }
    process.env.GATE_ROOT = originalEnv;
  });

  test("generateId matches expected format", async () => {
    const id = generateId("test-slug");
    assert.ok(/^meta-\d{6}T\d{4}Z-test-slug$/.test(id), `id "${id}" did not match expected format`);
  });

  test("checkAutoResolve resolves relative path against root", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const subDir = join(tempDir, "tools", "learning-loop-mcp");
    mkdirSync(subDir, { recursive: true });
    const targetFile = join(subDir, "core.js");
    writeFileSync(targetFile, "// code");
    const now = new Date();
    const oneSecAgo = new Date(now.getTime() - 1000);
    utimesSync(targetFile, now, now);
    const e = makeEntry({
      created_at: oneSecAgo.toISOString(),
      auto_resolve: { file_modified: "tools/learning-loop-mcp/core.js" },
    });
    const result = checkAutoResolve(e, tempDir);
    assert.strictEqual(result, "auto-resolved");
    process.env.GATE_ROOT = originalEnv;
  });

  test("updateEntry returns null when entry id not found", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-test-"));
    process.env.GATE_ROOT = tempDir;
    const e = makeEntry({ id: generateId("exists") });
    await writeEntry(tempDir, e);
    const result = await updateEntry(tempDir, "meta-000000T0000Z-nonexistent", { status: "active" });
    assert.strictEqual(result, null);
    process.env.GATE_ROOT = originalEnv;
  });

  test("checkExpiry returns null when expires_at is in future", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const e = makeEntry({
      status: "reported",
      expires_at: tomorrow.toISOString(),
    });
    const result = checkExpiry(e);
    assert.strictEqual(result, null);
  });

  test("filterEntries with empty filters returns all entries", async () => {
    const entries = [
      makeEntry({ id: "e1" }),
      makeEntry({ id: "e2" }),
    ];
    const result = filterEntries(entries, {});
    assert.strictEqual(result.length, 2);
  });
});

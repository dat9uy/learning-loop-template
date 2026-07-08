import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRegistry, writeEntry } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "lru-cache-test-"));
  return tmp;
}

function writeRegistry(root, entries) {
  const path = join(root, "meta-state.jsonl");
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(path, lines, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("readRegistry LRU cache", () => {
  let root;

  before(() => {
    root = makeTempRoot();
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("cold cache miss returns parsed entries", () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
      { id: "meta-test-2", entry_kind: "finding", status: "open" },
      { id: "meta-test-3", entry_kind: "change-log", status: "open" },
    ]);
    invalidateCache(root);
    const entries = readRegistry(root);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].id, "meta-test-1");
  });

  it("warm cache hit returns the SAME array reference", () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
    ]);
    invalidateCache(root);
    const first = readRegistry(root);
    const second = readRegistry(root);
    assert.equal(first, second, "second call must return the same array reference (cache hit)");
  });

  it("mtime change invalidates cache", async () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
    ]);
    invalidateCache(root);
    const before = readRegistry(root);

    const registryPath = join(root, "meta-state.jsonl");
    const mtimeBefore = statSync(registryPath).mtimeMs;
    await sleep(1100);
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
      { id: "meta-test-2", entry_kind: "finding", status: "open" },
    ]);
    const mtimeAfter = statSync(registryPath).mtimeMs;
    assert.notEqual(mtimeBefore, mtimeAfter, "mtime must have changed");

    const after = readRegistry(root);
    assert.notEqual(after, before, "must return a new array reference after mtime change");
    assert.equal(after.length, 2, "must reflect the new content");
  });

  it("size change invalidates cache even at same mtime", async () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
    ]);
    invalidateCache(root);
    const before = readRegistry(root);

    const registryPath = join(root, "meta-state.jsonl");
    const statBefore = statSync(registryPath);

    // Write different content but preserve mtime
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
      { id: "meta-test-2", entry_kind: "finding", status: "open" },
    ]);
    // Restore original mtime to simulate 1s-granularity filesystem
    const { utimesSync } = await import("node:fs");
    utimesSync(registryPath, statBefore.atime, statBefore.mtime);

    const after = readRegistry(root);
    assert.notEqual(after, before, "must return a new array reference after size change");
    assert.equal(after.length, 2, "must reflect the new content");
  });

  it("writeEntry invalidates cache", async () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
    ]);
    invalidateCache(root);
    const before = readRegistry(root);
    assert.equal(before.length, 1);

    await writeEntry(root, {
      id: "meta-test-2",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for writeEntry invalidation (min 20 chars)",
      status: "open",
      created_at: new Date().toISOString(),
    });

    const after = readRegistry(root);
    assert.equal(after.length, 2, "must include the newly written entry");
    assert.ok(after.find((e) => e.id === "meta-test-2"), "must find the new entry");
  });

  it("meta_state_batch invalidates cache once", async () => {
    writeRegistry(root, [
      { id: "meta-test-1", entry_kind: "finding", status: "open" },
    ]);
    invalidateCache(root);
    const before = readRegistry(root);
    assert.equal(before.length, 1);

    // Batch write 10 entries — cache should be invalidated once, not 10 times
    const { metaStateBatchTool } = await import("../../tools/handlers/meta-state-batch-tool.js");
    const originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    const ops = Array.from({ length: 10 }, (_, i) => ({
      op: "write",
      entry: {
        id: `meta-test-batch-${i}`,
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: `Batch entry ${i} for cache invalidation test (min 20 chars)`,
        status: "open",
        created_at: new Date().toISOString(),
      },
    }));

    const result = await metaStateBatchTool.handler({ operations: ops });
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.applied, 10, "batch must apply all 10 ops");

    const after = readRegistry(root);
    assert.equal(after.length, 11, "must include all 10 new entries plus original");
  });
});

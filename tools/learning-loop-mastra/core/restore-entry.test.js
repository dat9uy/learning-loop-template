import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  restoreEntry,
  archiveEntry,
  writeEntry,
  readRegistry,
  readRegistryAllVersions,
} from "./meta-state.js";
import { invalidateCache } from "./read-registry-cache.js";
import { metaStateBatch } from "./meta-state.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "restore-entry-test-"));
}

function writeFinding(root, id, overrides = {}) {
  const line = JSON.stringify({
    id,
    entry_kind: "finding",
    status: "open",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "meta",
    description: `Test finding ${id} for restore entry tests (min 20 chars)`,
    created_at: new Date().toISOString(),
    ...overrides,
  });
  writeFileSync(join(root, "meta-state.jsonl"), line + "\n", "utf8");
}

function writeChangeLog(root, id) {
  const line = JSON.stringify({
    id,
    entry_kind: "change-log",
    change_dimension: "surface",
    change_target: "test/path.js",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "Test change-log for restore entry tests (min 20 chars)",
    created_at: new Date().toISOString(),
  });
  writeFileSync(join(root, "change-log.jsonl"), line + "\n", "utf8");
}

describe("restoreEntry — invariant golden-fixture (Plan 260731-1325 Phase 2)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  test("rejects already-active entry with not_archived (bucket shape)", async () => {
    writeFinding(root, "restore-already-active");
    const before = readRegistryAllVersions(root);
    const result = await restoreEntry(root, "restore-already-active", "no reason");
    assert.deepEqual(result, { restored: false, reason: "not_archived", id: "restore-already-active" });
    // Mutation guard: no new line appended
    const after = readRegistryAllVersions(root);
    assert.strictEqual(after.length, before.length, "no line should be appended on rejection");
  });

  test("rejects change-log with not_archived (no change_log_immutable branch — red-team H1)", async () => {
    // Change-logs are status:"active" (z.literal on the change-log branch);
    // assertArchivedTombstone returns not_archived before any entry_kind check.
    writeChangeLog(root, "restore-changelog");
    const result = await restoreEntry(root, "restore-changelog", "no reason");
    assert.deepEqual(result, { restored: false, reason: "not_archived", id: "restore-changelog" });
  });

  test("rejects delete-tombstone unconditionally with delete_not_restorable (no flag — red-team M1)", async () => {
    // Seed an open finding, then archive it, then delete it (tombstone_kind:"delete").
    writeFinding(root, "restore-delete-tombstone");
    await archiveEntry(root, "restore-delete-tombstone", "first archive");
    await metaStateBatch(root, [{ op: "delete", id: "restore-delete-tombstone", reason: "delete" }]);
    const before = readRegistryAllVersions(root);
    const result = await restoreEntry(root, "restore-delete-tombstone", "no reason");
    assert.equal(result.restored, false);
    assert.equal(result.reason, "delete_not_restorable");
    assert.equal(result.id, "restore-delete-tombstone");
    assert.equal(result.tombstone_kind, "delete");
    const after = readRegistryAllVersions(root);
    assert.strictEqual(after.length, before.length, "no line should be appended on delete_tombstone rejection");
  });

  test("rejects not_found id", async () => {
    const result = await restoreEntry(root, "restore-missing-id", "no reason");
    assert.deepEqual(result, { restored: false, reason: "not_found", id: "restore-missing-id" });
  });
});

describe("restoreEntry — roundtrip (Plan 260731-1325 Phase 2)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  test("restores an archived entry to its pre-archive live status + content", async () => {
    writeFinding(root, "restore-roundtrip", { description: "Pre-archive description for roundtrip test" });
    await archiveEntry(root, "restore-roundtrip", "archive reason");
    // Sanity: tombstone is the projected line
    const projected = readRegistry(root);
    const archived = projected.find((e) => e.id === "restore-roundtrip");
    assert.equal(archived.status, "archived");
    assert.ok(archived.tombstone_kind);

    const result = await restoreEntry(root, "restore-roundtrip", "operator restore");
    assert.equal(result.restored, true);
    assert.equal(result.id, "restore-roundtrip");
    assert.equal(result.restored_status, "open");
    assert.ok(result.restored_at);
    assert.ok(typeof result.version === "number");

    // Projected (max-version) view now shows the live line
    const restored = readRegistry(root).find((e) => e.id === "restore-roundtrip");
    assert.equal(restored.status, "open", "pre-archive status restored");
    assert.equal(restored.archived_at, undefined, "archived_at cleared");
    assert.equal(restored.archived_by, undefined, "archived_by cleared");
    assert.equal(restored.archived_reason, undefined, "archived_reason cleared");
    assert.equal(restored.tombstone_kind, undefined, "tombstone_kind cleared");
    // The version is the tombstone+1 (the restore line is the new max)
    const allVersions = readRegistryAllVersions(root).filter((e) => e.id === "restore-roundtrip");
    assert.ok(allVersions.length >= 3, "original + archive tombstone + restore line all present");
    // The max-version line is the restored one
    const maxVersionLine = allVersions.reduce((a, b) => ((b.version ?? 0) > (a.version ?? 0) ? b : a));
    assert.equal(maxVersionLine.status, "open");
    assert.equal(maxVersionLine.version, result.version);
  });
});

describe("restoreEntry — D1 tombstone-recovery guard (red-team D1)", () => {
  let root;

  beforeAll(() => {
    root = makeTempRoot();
    process.env.GATE_ROOT = root;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env.GATE_ROOT;
  });

  test("recovery filter excludes prior tombstones (status !== 'archived')", async () => {
    // Seed open finding → archive (v1 archive tombstone) → batch-delete
    // (v2 delete tombstone) → rewrite the v2 tombstone's tombstone_kind to
    // "archive" IN PLACE (version stays 2). The projected max is then an
    // archive tombstone (restore pre-condition holds, delete_not_restorable
    // does not fire), and the candidate set below the tombstone is
    // {v0 open, v1 archive tombstone}. Without the status!=="archived"
    // recovery filter the reduce picks v1 → restored_status would be
    // "archived" (frankenstein tombstone); with it, restore picks v0.
    writeFinding(root, "restore-d1-guard");
    await archiveEntry(root, "restore-d1-guard", "first archive");
    await metaStateBatch(root, [{ op: "delete", id: "restore-d1-guard", reason: "delete" }]);
    const fs = await import("node:fs");
    const filePath = join(root, "meta-state.jsonl");
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((ln) => {
      const parsed = JSON.parse(ln);
      if (parsed.id === "restore-d1-guard" && parsed.tombstone_kind === "delete") {
        return JSON.stringify({ ...parsed, tombstone_kind: "archive" });
      }
      return ln;
    });
    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf8");
    invalidateCache(root);

    const result = await restoreEntry(root, "restore-d1-guard", "d1 test");
    assert.equal(result.restored, true, "restore must succeed");
    assert.equal(result.restored_status, "open", "must restore to pre-archive 'open' (not 'archived')");
    // The restored line must NOT be a tombstone (status:"open", no tombstone_kind)
    const restored = readRegistry(root).find((e) => e.id === "restore-d1-guard");
    assert.equal(restored.status, "open");
    assert.equal(restored.tombstone_kind, undefined);
  });
});

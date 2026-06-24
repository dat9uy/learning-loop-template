import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  metaStateEntrySchema,
  readRegistry,
  writeEntry,
} from "../core/meta-state.js";
import { invalidateCache } from "../core/read-registry-cache.js";

describe("meta-state schema extension (Phase 1)", () => {
  let tempDir;

  test("legacy entry without affected_system defaults to 'meta'", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-260612T0000Z-test",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      description: "Legacy entry without affected_system field (min 20 chars)",
      status: "active",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.affected_system, "meta");
  });

  test("new entry with valid affected_system enum passes", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-260612T0001Z-test",
      entry_kind: "finding",
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock",
      description: "New entry with vnstock affected_system (min 20 chars)",
      status: "active",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.affected_system, "vnstock");
  });

  test("invalid affected_system enum value is rejected", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-260612T0002Z-test",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "invalid-system",
      description: "Entry with invalid affected_system value (min 20 chars)",
      status: "active",
    });
    assert.strictEqual(result.success, false);
  });

  test("code_ref is optional and accepted", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-260612T0003Z-test",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "meta",
      description: "Entry with optional code_ref field (min 20 chars)",
      code_ref: "tools/test.js:42",
      status: "active",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.code_ref, "tools/test.js:42");
  });

  test("ledger_ref is optional and accepted", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-260612T0004Z-test",
      entry_kind: "finding",
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock",
      description: "Entry with optional ledger_ref field (min 20 chars)",
      ledger_ref: "vnstock-device-slot",
      status: "active",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.ledger_ref, "vnstock-device-slot");
  });

  test("all 4 entry kinds accept the new fields", () => {
    const kinds = ["finding", "change-log", "rule", "loop-design"];
    const baseFields = {
      affected_system: "meta",
      code_ref: "tools/test.js:1",
      ledger_ref: "test-ledger",
    };

    for (const kind of kinds) {
      let entry;
      if (kind === "finding") {
        entry = {
          id: "meta-260612T0005Z-test",
          entry_kind: "finding",
          category: "gate-logic-bug",
          severity: "warning",
          description: "Finding with new fields (min 20 chars)",
          status: "active",
          ...baseFields,
        };
      } else if (kind === "change-log") {
        entry = {
          id: "meta-260612T0006Z-test",
          entry_kind: "change-log",
          change_dimension: "semantic",
          change_target: "test",
          change_diff: { added: [], removed: [], changed: [] },
          reason: "Test change-log with new fields (min 20 chars)",
          status: "active",
          created_at: new Date().toISOString(),
          ...baseFields,
        };
      } else if (kind === "rule") {
        entry = {
          id: "rule-test-rule",
          entry_kind: "rule",
          origin: "meta-260612T0007Z-test",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          description: "Test rule with new fields (min 20 chars)",
          promoted_at: new Date().toISOString(),
          promoted_by: "test",
          ...baseFields,
        };
      } else if (kind === "loop-design") {
        entry = {
          id: "loop-design-test",
          entry_kind: "loop-design",
          title: "Test design with new fields",
          proposed_design_for: ["rule-test"],
          description: "Test loop-design with new fields (min 20 chars)",
          created_at: new Date().toISOString(),
          created_by: "test",
          ...baseFields,
        };
      }

      const result = metaStateEntrySchema.safeParse(entry);
      assert.strictEqual(result.success, true, `${kind} should accept new fields`);
      assert.strictEqual(result.data.affected_system, "meta");
      assert.strictEqual(result.data.code_ref, "tools/test.js:1");
      assert.strictEqual(result.data.ledger_ref, "test-ledger");
    }
  });
});

describe("read-registry cache affected_system extension", () => {
  let tempDir;

  function writeRegistry(root, entries) {
    const path = join(root, "meta-state.jsonl");
    const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(path, lines, "utf8");
  }

  test("cache hit when affected_system values unchanged", () => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    writeRegistry(tempDir, [
      { id: "meta-test-1", entry_kind: "finding", status: "active", affected_system: "meta" },
      { id: "meta-test-2", entry_kind: "finding", status: "active", affected_system: "vnstock" },
    ]);
    invalidateCache(tempDir);

    const first = readRegistry(tempDir);
    const second = readRegistry(tempDir);
    assert.equal(first, second, "cache hit must return same array reference");
  });

  test("cache miss when file changes (size/mtime)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    writeRegistry(tempDir, [
      { id: "meta-test-1", entry_kind: "finding", status: "active", affected_system: "meta" },
    ]);
    invalidateCache(tempDir);

    const first = readRegistry(tempDir);

    // Add entry with different affected_system
    writeRegistry(tempDir, [
      { id: "meta-test-1", entry_kind: "finding", status: "active", affected_system: "meta" },
      { id: "meta-test-2", entry_kind: "finding", status: "active", affected_system: "fastapi" },
    ]);

    const second = readRegistry(tempDir);
    assert.notEqual(second, first, "cache miss must return new array reference");
    assert.equal(second.length, 2, "must reflect new content");
  });

  test("writeEntry invalidates cache with affected_system", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    writeRegistry(tempDir, [
      { id: "meta-test-1", entry_kind: "finding", status: "active", affected_system: "meta" },
    ]);
    invalidateCache(tempDir);

    const before = readRegistry(tempDir);
    assert.equal(before.length, 1);

    await writeEntry(tempDir, {
      id: "meta-test-2",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "vnstock",
      description: "Test finding for cache invalidation (min 20 chars)",
      status: "reported",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const after = readRegistry(tempDir);
    assert.equal(after.length, 2, "must include newly written entry");
    assert.ok(after.find((e) => e.id === "meta-test-2"), "must find new entry");
    assert.strictEqual(after.find((e) => e.id === "meta-test-2").affected_system, "vnstock");
  });
});

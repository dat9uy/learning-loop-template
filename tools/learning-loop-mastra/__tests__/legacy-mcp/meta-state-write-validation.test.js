import { describe, test } from "node:test";
import assert from "node:assert";
import {
  writeEntry,
  updateEntry,
  readRegistry,
  InvalidEntryError,
} from "../../core/meta-state.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function makeTempRoot() {
  const dir = mkdtempSync(join(tmpdir(), "meta-state-write-validation-"));
  mkdirSync(join(dir, "records"), { recursive: true });
  return dir;
}

function makeValidFinding(id) {
  return {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    description: "A valid finding for write validation test",
    created_at: new Date().toISOString(),
    version: 0,
  };
}

function makeValidChangeLog(id) {
  return {
    id,
    entry_kind: "change-log",
    change_dimension: "semantic",
    change_target: "test",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "A valid change-log for write validation test",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  };
}

function makeValidRule(id) {
  return {
    id: "rule-test-write-validation",
    entry_kind: "rule",
    origin: "meta-260607T0008Z-test",
    enforcement: "agent",
    pattern_type: "regex",
    pattern: "test",
    description: "A valid rule for write validation test",
    promoted_at: new Date().toISOString(),
    promoted_by: "test",
    status: "active",
    created_at: new Date().toISOString(),
    version: 0,
  };
}

function makeValidLoopDesign(id) {
  return {
    id: "loop-design-test-write-validation",
    entry_kind: "loop-design",
    title: "Test design for write validation",
    proposed_design_for: ["test"],
    addresses: [],
    description: "A valid loop-design for write validation test",
    affected_system: "mcp-tools",
    created_at: new Date().toISOString(),
    created_by: "test",
    status: "active",
    version: 0,
  };
}

describe("writeEntry validation", () => {
  test("T-1: writeEntry rejects entry missing required fields", async () => {
    const root = makeTempRoot();
    const badEntry = {
      id: "meta-260607T1200Z-test-bad",
      entry_kind: "finding",
      // missing category, severity, affected_system, description
      created_at: new Date().toISOString(),
      version: 0,
    };

    let thrown = null;
    try {
      await writeEntry(root, badEntry);
    } catch (err) {
      thrown = err;
    }

    assert.ok(thrown instanceof InvalidEntryError, "Expected InvalidEntryError");
    assert.strictEqual(thrown.name, "InvalidEntryError");
    assert.ok(thrown.message.includes("Invalid meta-state entry"));
    assert.ok(thrown.errors);
  });

  test("T-2: writeEntry accepts valid union member (4 sub-tests)", async () => {
    const root = makeTempRoot();
    const entries = [
      makeValidFinding("meta-260607T1201Z-test-finding"),
      makeValidChangeLog("meta-260607T1202Z-test-changelog"),
      makeValidRule("meta-260607T1203Z-test-rule"),
      makeValidLoopDesign("meta-260607T1204Z-test-loop-design"),
    ];

    for (const entry of entries) {
      await writeEntry(root, entry);
    }

    const registry = readRegistry(root);
    assert.strictEqual(registry.length, 4);
    const kinds = registry.map((e) => e.entry_kind);
    assert.ok(kinds.includes("finding"));
    assert.ok(kinds.includes("change-log"));
    assert.ok(kinds.includes("rule"));
    assert.ok(kinds.includes("loop-design"));
  });
});

describe("updateEntry validation", () => {
  test("T-3: updateEntry rejects bad patch", async () => {
    const root = makeTempRoot();
    const entry = makeValidFinding("meta-260607T1205Z-test-update-bad");
    await writeEntry(root, entry);

    const result = await updateEntry(root, entry.id, null);
    assert.strictEqual(result, "validation_failed");
  });

  test("T-4: updateEntry accepts valid patch", async () => {
    const root = makeTempRoot();
    const entry = makeValidFinding("meta-260607T1206Z-test-update-good");
    await writeEntry(root, entry);

    const result = await updateEntry(root, entry.id, { status: "active" });
    assert.strictEqual(result, true);

    const registry = readRegistry(root);
    const updated = registry.find((e) => e.id === entry.id);
    assert.strictEqual(updated.status, "active");
  });

  test("T-5: updateEntry accepts promoted_to_rule patch", async () => {
    const root = makeTempRoot();
    const entry = makeValidFinding("meta-260607T1207Z-test-promote");
    await writeEntry(root, entry);

    const result = await updateEntry(root, entry.id, {
      promoted_to_rule: "rule-short-slug-for-risk-records",
    });
    assert.strictEqual(result, true);

    const registry = readRegistry(root);
    const updated = registry.find((e) => e.id === entry.id);
    assert.strictEqual(
      updated.promoted_to_rule,
      "rule-short-slug-for-risk-records"
    );
  });
});

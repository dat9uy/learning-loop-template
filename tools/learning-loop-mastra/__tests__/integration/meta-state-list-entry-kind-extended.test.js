import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";
import { writeEntry, updateEntry, generateId } from "../../core/meta-state.js";

const originalEnv = process.env.GATE_ROOT;

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "meta-list-"));
  process.env.GATE_ROOT = root;
  writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  return root;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
}

async function call(args) {
  return JSON.parse((await metaStateListTool.handler(args)).content[0].text);
}

async function writeTestEntry(root, entry) {
  await writeEntry(root, entry);
}

test("meta_state_list with entry_kind='rule' returns only rule entries", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: "rule-test-1",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test-pattern",
      description: "Test rule description that is at least 20 characters long.",
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });
    await writeTestEntry(root, {
      id: generateId("test-finding"),
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding description that is at least 20 characters long.",
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "rule" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].id, "rule-test-1");
    assert.equal(result.entries[0].entry_kind, "rule");
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kind='loop-design' returns only loop-design entries", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: "loop-design-test-1",
      entry_kind: "loop-design",
      title: "Test design that is at least 10 chars",
      status: "active",
      proposed_design_for: ["rule-test-1"],
      addresses: [],
      description: "Test design description that is at least 20 characters long.",
      affected_system: "mcp-tools",
      created_at: "2026-06-06T20:00:00.000Z",
      created_by: "operator",
    });
    await writeTestEntry(root, {
      id: generateId("test-finding"),
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding description that is at least 20 characters long.",
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "loop-design" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].id, "loop-design-test-1");
    assert.equal(result.entries[0].entry_kind, "loop-design");
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kinds=['rule', 'loop-design'] returns both", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: "rule-test-2",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test-pattern",
      description: "Test rule description that is at least 20 characters long.",
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });
    await writeTestEntry(root, {
      id: "loop-design-test-2",
      entry_kind: "loop-design",
      title: "Test design that is at least 10 chars",
      status: "active",
      proposed_design_for: ["rule-test-2"],
      addresses: [],
      description: "Test design description that is at least 20 characters long.",
      affected_system: "mcp-tools",
      created_at: "2026-06-06T20:00:00.000Z",
      created_by: "operator",
    });
    await writeTestEntry(root, {
      id: generateId("test-finding"),
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding description that is at least 20 characters long.",
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kinds: ["rule", "loop-design"] });
    assert.equal(result.count, 2);
    assert.ok(result.entries.some((e) => e.entry_kind === "rule"));
    assert.ok(result.entries.some((e) => e.entry_kind === "loop-design"));
    assert.ok(!result.entries.some((e) => e.entry_kind === "finding"));
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kind='finding' returns the same entries as beforeAll(regression)", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: generateId("test-finding"),
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding description that is at least 20 characters long.",
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });
    await writeTestEntry(root, {
      id: generateId("test-change-log"),
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log description that is at least 20 characters.",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "finding" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].entry_kind, "finding");
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kind='change-log' returns the same entries as beforeAll(regression)", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: generateId("test-change-log"),
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log description that is at least 20 characters.",
      status: "active",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "change-log" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].entry_kind, "change-log");
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kind='rule' + include_all_versions returns the full rule history", async () => {
  // Rule history reads (preservation baseline, issue #155): Rule ids must
  // stay stable across append-only versions, and include_all_versions must
  // expose every version line while the default read collapses to the latest.
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: "rule-history",
      entry_kind: "rule",
      origin: "meta-test-origin",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "old-pattern",
      description: "Rule history v0 description that is at least 20 characters long.",
      status: "active",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
      created_at: "2026-06-06T20:00:00.000Z",
    });
    await updateEntry(root, "rule-history", {
      pattern: "new-pattern",
      description: "Rule history v1 description that is at least 20 characters long.",
    });

    const allVersions = await call({ entry_kind: "rule", include_all_versions: true });
    assert.equal(allVersions.count, 2, "both version lines must be returned");
    const versions = allVersions.entries
      .filter((e) => e.id === "rule-history")
      .sort((a, b) => a.version - b.version);
    assert.equal(versions.length, 2);
    assert.equal(versions[0].version, 0);
    assert.equal(versions[0].pattern, "old-pattern");
    assert.equal(versions[1].version, 1);
    assert.equal(versions[1].pattern, "new-pattern");

    const collapsed = await call({ entry_kind: "rule" });
    const latest = collapsed.entries.find((e) => e.id === "rule-history");
    assert.equal(latest.version, 1, "default read must collapse to the latest version");
    assert.equal(latest.pattern, "new-pattern");
  } finally {
    teardown();
  }
});

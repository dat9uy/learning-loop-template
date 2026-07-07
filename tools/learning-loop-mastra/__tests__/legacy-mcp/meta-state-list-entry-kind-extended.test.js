import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";
import { writeEntry, generateId } from "../../core/meta-state.js";

const originalEnv = process.env.GATE_ROOT;

function setupFixture() {
  const root = mkdtempSync(join(tmpdir(), "meta-list-"));
  process.env.GATE_ROOT = root;
  writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");
  return root;
}

function teardown() {
  process.env.GATE_ROOT = originalEnv;
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
      status: "open",
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
      status: "open",
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
      status: "open",
      promoted_at: "2026-06-06T20:00:00.000Z",
      promoted_by: "operator",
    });
    await writeTestEntry(root, {
      id: "loop-design-test-2",
      entry_kind: "loop-design",
      title: "Test design that is at least 10 chars",
      status: "open",
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

test("meta_state_list with entry_kind='finding' returns the same entries as before (regression)", async () => {
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
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "finding" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].entry_kind, "finding");
  } finally {
    teardown();
  }
});

test("meta_state_list with entry_kind='change-log' returns the same entries as before (regression)", async () => {
  const root = setupFixture();
  try {
    await writeTestEntry(root, {
      id: generateId("test-change-log"),
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test change-log description that is at least 20 characters.",
      status: "open",
      created_at: "2026-06-06T20:00:00.000Z",
    });

    const result = await call({ entry_kind: "change-log" });
    assert.equal(result.count, 1);
    assert.equal(result.entries[0].entry_kind, "change-log");
  } finally {
    teardown();
  }
});

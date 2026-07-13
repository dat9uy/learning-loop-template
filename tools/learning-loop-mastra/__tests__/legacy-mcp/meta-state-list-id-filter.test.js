import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "list-id-filter-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

const SEED_ENTRIES = [
  { id: "alpha", entry_kind: "finding", status: "open", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "alpha finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "beta", entry_kind: "finding", status: "open", category: "loop-anti-pattern", severity: "warning", affected_system: "mcp-tools", description: "beta finding for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
  { id: "gamma", entry_kind: "change-log", status: "open", change_dimension: "surface", change_target: "tools/test.js", change_diff: { added: ["id filter"], removed: [], changed: [] }, reason: "gamma change-log for id-filter test (min 20 chars)", created_at: new Date().toISOString() },
];

describe("meta_state_list id filter", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;
    writeRegistry(root, SEED_ENTRIES);
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("id: 'alpha' returns only the alpha entry", async () => {
    const result = await metaStateListTool.handler({ id: "alpha" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
    assert.deepStrictEqual(text.filters_applied.id, ["alpha"]);
  });

  test("id: ['alpha', 'beta'] returns both, no gamma", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "beta"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 2);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, ["alpha", "beta"]);
    assert.deepStrictEqual(text.filters_applied.id, ["alpha", "beta"]);
  });

  test("id: ['nonexistent'] returns empty array", async () => {
    const result = await metaStateListTool.handler({ id: ["nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 0);
    assert.deepStrictEqual(text.entries, []);
  });

  test("id: ['alpha', 'nonexistent'] silently skips missing", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "nonexistent"] });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with status filter (AND)", async () => {
    const resolved = { id: "delta-resolved", entry_kind: "finding", status: "resolved", category: "gate-logic-bug", severity: "warning", affected_system: "gate-logic", description: "resolved entry for compose test (min 20 chars)", created_at: new Date().toISOString(), resolved_at: new Date().toISOString(), resolved_by: "test" };
    writeFileSync(join(root, "meta-state.jsonl"), [...SEED_ENTRIES, resolved].map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    const result = await metaStateListTool.handler({ id: ["alpha", "delta-resolved"], status: "open" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "alpha");
  });

  test("id composes with entry_kind filter (AND)", async () => {
    const result = await metaStateListTool.handler({ id: ["alpha", "gamma"], entry_kind: "change-log" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "gamma");
  });

  test("id with no value (undefined) returns all entries (backward compat)", async () => {
    const result = await metaStateListTool.handler({});
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 3);
  });
});

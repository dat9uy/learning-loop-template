import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "include-archived-test-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

describe("meta_state_list include_archived semantic unification", () => {
  let root;
  let originalGateRoot;

  before(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    writeRegistry(root, [
      {
        id: "archived-active-finding",
        entry_kind: "finding",
        status: "active",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active finding must always be returned (min 20 chars)",
        created_at: new Date().toISOString(),
      },
      {
        id: "archived-superseded-finding",
        entry_kind: "finding",
        status: "superseded",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Superseded finding must be returned with include_archived",
        created_at: new Date().toISOString(),
      },
      {
        id: "archived-resolved-finding",
        entry_kind: "finding",
        status: "resolved",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Resolved finding must be returned with include_archived",
        created_at: new Date().toISOString(),
      },
      {
        id: "archived-auto-resolved-finding",
        entry_kind: "finding",
        status: "auto-resolved",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Auto-resolved finding must be returned with include_archived",
        created_at: new Date().toISOString(),
      },
      {
        id: "archived-archived-finding",
        entry_kind: "finding",
        status: "archived",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Archived finding must be returned with include_archived",
        created_at: new Date().toISOString(),
      },
    ]);
  });

  after(() => {
    process.env.GATE_ROOT = originalGateRoot;
    rmSync(root, { recursive: true, force: true });
  });

  test("default list excludes all 4 terminal statuses", async () => {
    const result = await metaStateListTool.handler({});
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "archived-active-finding");
  });

  test("include_archived: true surfaces all 4 terminal statuses", async () => {
    const result = await metaStateListTool.handler({ include_archived: true });
    const text = JSON.parse(result.content[0].text);
    const ids = text.entries.map((e) => e.id).sort();
    assert.deepStrictEqual(ids, [
      "archived-active-finding",
      "archived-archived-finding",
      "archived-auto-resolved-finding",
      "archived-resolved-finding",
      "archived-superseded-finding",
    ]);
  });

  test("explicit status filter still works for terminal statuses", async () => {
    const result = await metaStateListTool.handler({ status: "superseded" });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.count, 1);
    assert.strictEqual(text.entries[0].id, "archived-superseded-finding");
  });
});

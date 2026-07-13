import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../../tools/handlers/meta-state-relationships-tool.js";

function makeTempRoot() {
  return mkdtempSync(join(tmpdir(), "relationships-test-"));
}

function writeRegistry(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "meta-state.jsonl"), lines, "utf8");
}

describe("meta_state_relationships consolidated_into traversal", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    writeRegistry(root, [
      {
        id: "consolidated-finding",
        entry_kind: "finding",
        status: "superseded",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Finding consolidated into a change-log (min 20 chars)",
        consolidated_into: "consolidating-change-log",
        created_at: new Date().toISOString(),
      },
      {
        id: "consolidating-change-log",
        entry_kind: "change-log",
        status: "active",
        change_dimension: "semantic",
        change_target: "tools/test.js",
        change_diff: { added: [], removed: [], changed: [] },
        consolidates: "consolidated-finding",
        reason: "Change log consolidating the finding (min 20 chars)",
        created_at: new Date().toISOString(),
      },
    ]);
  });

  afterAll(() => {
    if (originalGateRoot === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalGateRoot;
    }
    rmSync(root, { recursive: true, force: true });
  });

  test("inbound direction exposes consolidated_by from change-log consolidates", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidating-change-log",
      direction: "inbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.inbound, "inbound should be present");
    assert.deepStrictEqual(
      text.inbound.consolidated_by,
      ["consolidated-finding"]
    );
  });

  test("outbound direction still exposes consolidated_into from finding", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidated-finding",
      direction: "outbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.outbound, "outbound should be present");
    assert.strictEqual(
      text.outbound.consolidated_into,
      "consolidating-change-log"
    );
  });

  test("both direction exposes consolidated_by and consolidated_into", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidating-change-log",
      direction: "both",
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.inbound, "inbound should be present");
    assert.deepStrictEqual(
      text.inbound.consolidated_by,
      ["consolidated-finding"]
    );
  });
});

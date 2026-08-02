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

function writeCitations(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(join(root, "citations.jsonl"), lines, "utf8");
}

describe("meta_state_relationships consolidated_into traversal", () => {
  let root;
  let originalGateRoot;

  beforeAll(() => {
    root = makeTempRoot();
    originalGateRoot = process.env.GATE_ROOT;
    process.env.GATE_ROOT = root;

    // The consolidated edge (finding → change-log) is now a citation row
    // (source=finding, target=change-log, rationale="consolidated-into").
    // The on-record `consolidated_into` (finding) and `consolidates`
    // (change-log) fields are inert-historical: still on disk, still parse,
    // but de-routed from CROSS_REFS so they are no longer indexed in outbound
    // or the named inverse maps. The canonical edge surfaces via inbound
    // `cited_by` (sourced from `citations_inverse`).
    writeRegistry(root, [
      {
        id: "consolidated-finding",
        entry_kind: "finding",
        status: "resolved",
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
        consolidates: ["consolidated-finding"],
        reason: "Change log consolidating the finding (min 20 chars)",
        created_at: new Date().toISOString(),
      },
    ]);
    writeCitations(root, [
      {
        id: "citation-consolidated-finding-into-change-log",
        entry_kind: "citation",
        source: "consolidated-finding",
        target: "consolidating-change-log",
        rationale: "consolidated-into",
        recorded_at: new Date().toISOString(),
        recorded_by: "operator",
        status: "active",
        version: 0,
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

  test("inbound direction exposes cited_by from the consolidated citation", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidating-change-log",
      direction: "inbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.inbound, "inbound should be present");
    assert.deepStrictEqual(
      text.inbound.cited_by,
      ["consolidated-finding"]
    );
  });

  test("outbound direction no longer exposes inert-historical consolidated_into", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidated-finding",
      direction: "outbound",
    });
    const text = JSON.parse(result.content[0].text);
    // `consolidated_into` is de-routed from CROSS_REFS; the finding has no
    // other forward refs, so outbound is null. The canonical edge is the
    // citation row surfaced via inbound `cited_by`.
    assert.strictEqual(text.outbound, null, "outbound must not surface inert-historical consolidated_into");
  });

  test("both direction exposes cited_by and omits inert-historical outbound", async () => {
    const result = await metaStateRelationshipsTool.handler({
      id: "consolidating-change-log",
      direction: "both",
    });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.inbound, "inbound should be present (cited_by from citation)");
    assert.deepStrictEqual(text.inbound.cited_by, ["consolidated-finding"]);
  });
});

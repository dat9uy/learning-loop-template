import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRelationshipsTool } from "../tools/meta-state-relationships-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

test("meta_state_relationships: inbound for rule origin", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "rule-project-skill-boundary",
    direction: "inbound",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.id, "rule-project-skill-boundary");
  assert.strictEqual(text.direction, "inbound");
  assert.ok(text.inbound, "inbound should be present");
  assert.ok(text.inbound.promoted_from, "inbound should have promoted_from");
  assert.ok(
    text.inbound.promoted_from.includes("meta-260602T1116Z-agent-inside-a-project-that-has-its-own-mcp-json-called-ck-u"),
    "promoted_from should include the originating finding"
  );
});

test("meta_state_relationships: outbound for finding with promoted_to_rule", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "meta-260606T1656Z-cold-session-test-must-pass-before-resolution",
    direction: "outbound",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.direction, "outbound");
  assert.ok(text.outbound, "outbound should be present");
  assert.strictEqual(text.outbound.promoted_to_rule, "rule-cold-session-test-must-pass-before-resolution");
});

test("meta_state_relationships: both directions for entry with refs", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "meta-260606T1656Z-cold-session-test-must-pass-before-resolution",
    direction: "both",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.direction, "both");
  assert.ok(text.outbound, "both should have outbound");
  assert.ok(text.inbound, "both should have inbound");
});

test("meta_state_relationships: inbound reopened_by for finding with reopens", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "meta-state-reopened-by-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const corePath = join(tempRoot, "meta-state.jsonl");
    // Pre-populate: parent expired + child that reopens it
    const parent = {
      id: "meta-parent-expired",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A parent finding that has expired.",
      status: "expired",
    };
    const child = {
      id: "meta-child-reopens",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A child finding that reopens the parent.",
      status: "active",
      reopens: ["meta-parent-expired"],
    };
    const fs = await import("node:fs");
    fs.writeFileSync(corePath, [parent, child].map((e) => JSON.stringify(e)).join("\n") + "\n");

    const result = await metaStateRelationshipsTool.handler({
      id: "meta-parent-expired",
      direction: "inbound",
    });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.id, "meta-parent-expired");
    assert.strictEqual(text.direction, "inbound");
    assert.ok(text.inbound, "inbound should be present");
    assert.ok(text.inbound.reopened_by, "inbound should have reopened_by");
    assert.ok(
      text.inbound.reopened_by.includes("meta-child-reopens"),
      "reopened_by should include the child finding"
    );
  } finally {
    if (originalEnv) process.env.GATE_ROOT = originalEnv;
    else delete process.env.GATE_ROOT;
  }
});

test("meta_state_relationships: missing entry returns error", async () => {
  const result = await metaStateRelationshipsTool.handler({
    id: "non-existent-entry-id",
    direction: "both",
  });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.error, "entry_not_found");
  assert.strictEqual(text.id, "non-existent-entry-id");
});

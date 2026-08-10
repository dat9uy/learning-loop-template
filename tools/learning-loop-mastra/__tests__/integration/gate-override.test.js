import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readGateOverride, writeGateOverride } from "../../core/gate-override.js";
import { applyPromotedRules, loadPromotedRules } from "../../core/gate-logic.js";
import { gateOverrideTool } from "../../tools/handlers/gate-override-tool.js";
import { SURFACES } from "../../core/surfaces.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `gate-override-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  process.env.GATE_ROOT = root;
});

afterEach(() => {
  delete process.env.GATE_ROOT;
  rmSync(root, { recursive: true, force: true });
});

function writeRule(ruleId, pattern) {
  const rule = {
    entry_kind: "rule",
    id: ruleId,
    origin: "meta-test",
    enforcement: "gate",
    pattern_type: "regex",
    pattern,
    description: `Test rule ${ruleId} for gate-override regression coverage`,
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  const path = join(root, "meta-state.jsonl");
  writeFileSync(path, JSON.stringify(rule) + "\n");
}

await test("writeGateOverride creates marker on all surfaces", () => {
  writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "test" });
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", ".gate-override");
    assert.ok(existsSync(path), `expected ${path} to exist`);
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    assert.deepStrictEqual(parsed.rule_ids, ["rule-foo"]);
  }
});

await test("readGateOverride returns null when no marker", () => {
  assert.strictEqual(readGateOverride(root), null);
});

await test("readGateOverride returns marker when valid", () => {
  writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "false positive" });
  const override = readGateOverride(root);
  assert.ok(override);
  assert.deepStrictEqual(override.rule_ids, ["rule-foo"]);
  assert.strictEqual(override.operator_note, "false positive");
});

await test("readGateOverride returns null when expired", () => {
  writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "old" });
  const oldCreatedAt = new Date(Date.now() - 7200 * 1000).toISOString();
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", ".gate-override");
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    parsed.created_at = oldCreatedAt;
    writeFileSync(path, JSON.stringify(parsed));
  }
  assert.strictEqual(readGateOverride(root), null);
});

await test("writeGateOverride merges rule_ids on the same surface", () => {
  writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "first" });
  writeGateOverride(root, { rule_id: "rule-bar", ttl_seconds: 1800, operator_note: "second" });
  const override = readGateOverride(root);
  assert.ok(override);
  assert.deepStrictEqual(override.rule_ids, ["rule-foo", "rule-bar"]);
  assert.strictEqual(override.ttl_seconds, 1800);
  assert.strictEqual(override.operator_note, "second");
});

await test("readGateOverride first-valid-wins prefers .claude over .factory", () => {
  const claudePath = join(root, ".claude", "coordination", ".gate-override");
  const factoryPath = join(root, ".factory", "coordination", ".gate-override");
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  writeFileSync(claudePath, JSON.stringify({ rule_ids: ["rule-claude"], ttl_seconds: 3600, operator_note: "c", created_at: new Date().toISOString() }));
  writeFileSync(factoryPath, JSON.stringify({ rule_ids: ["rule-factory"], ttl_seconds: 3600, operator_note: "f", created_at: new Date().toISOString() }));
  const override = readGateOverride(root);
  assert.deepStrictEqual(override.rule_ids, ["rule-claude"]);
});

await test("readGateOverride falls through to .factory when .claude marker is expired (first-VALID-wins, not first-parsed)", () => {
  // F-1 regression test: an expired marker on .claude must NOT shadow a
  // valid marker on .factory. The old behavior (pre-Step 4 refactor) iterated
  // SURFACES and called validateMarker per surface. The Step 4 refactor
  // accidentally collapsed this to "first-parsed-wins" via readFromAllSurfaces
  // ({ first: true }). This test pins the "first-VALID-wins" contract.
  const claudePath = join(root, ".claude", "coordination", ".gate-override");
  const factoryPath = join(root, ".factory", "coordination", ".gate-override");
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
  // .claude: expired (created 2 hours ago, ttl 1 hour)
  const expiredCreatedAt = new Date(Date.now() - 7200 * 1000).toISOString();
  writeFileSync(
    claudePath,
    JSON.stringify({ rule_ids: ["rule-claude"], ttl_seconds: 3600, operator_note: "c", created_at: expiredCreatedAt }),
  );
  // .factory: valid (fresh)
  writeFileSync(
    factoryPath,
    JSON.stringify({ rule_ids: ["rule-factory"], ttl_seconds: 3600, operator_note: "f", created_at: new Date().toISOString() }),
  );
  const override = readGateOverride(root);
  assert.ok(override, "expected to fall through to valid .factory marker");
  assert.deepStrictEqual(override.rule_ids, ["rule-factory"]);
  assert.strictEqual(override.operator_note, "f");
});

await test("applyPromotedRules skips rule in override set", () => {
  writeRule("rule-foo", "foo-token");
  writeGateOverride(root, { rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "test" });
  const rules = loadPromotedRules(root);
  const result = applyPromotedRules("echo foo-token", null, rules);
  assert.strictEqual(result.decision, "ok");
});

await test("applyPromotedRules does NOT skip rule not in override set", () => {
  writeRule("rule-foo", "foo-token");
  writeGateOverride(root, { rule_id: "rule-bar", ttl_seconds: 3600, operator_note: "test" });
  const rules = loadPromotedRules(root);
  const result = applyPromotedRules("echo foo-token", null, rules);
  assert.strictEqual(result.decision, "escalate");
});

await test("gate_override tool rejects unknown rule_id", async () => {
  writeRule("rule-foo", "foo-token");
  const response = await gateOverrideTool.handler({ rule_id: "rule-unknown", ttl_seconds: 3600, operator_note: "test" });
  assert.strictEqual(response.isError, true);
  assert.ok(response.content[0].text.includes("unknown rule_id"));
});

await test("gate_override tool rejects empty operator_note", async () => {
  writeRule("rule-foo", "foo-token");
  await assert.rejects(async () => {
    await gateOverrideTool.handler({ rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "" });
  }, /operator_note/);
});

await test("gate_override tool rejects ttl_seconds > 86400", async () => {
  writeRule("rule-foo", "foo-token");
  await assert.rejects(async () => {
    await gateOverrideTool.handler({ rule_id: "rule-foo", ttl_seconds: 90000, operator_note: "test" });
  }, /ttl_seconds/);
});

await test("gate_override tool succeeds for valid rule and appends audit", async () => {
  writeRule("rule-foo", "foo-token");
  const response = await gateOverrideTool.handler({ rule_id: "rule-foo", ttl_seconds: 3600, operator_note: "test override" });
  assert.strictEqual(response.isError, undefined);
  const text = JSON.parse(response.content[0].text);
  assert.strictEqual(text.marked, true);
  assert.strictEqual(text.rule_id, "rule-foo");

  const sidecarPath = join(root, "runtime-state.jsonl");
  assert.ok(existsSync(sidecarPath), "audit entry should be appended to runtime-state.jsonl");
  const lines = readFileSync(sidecarPath, "utf8").trim().split("\n");
  const audit = JSON.parse(lines[lines.length - 1]);
  assert.strictEqual(audit.kind, "ledger-event");
  assert.strictEqual(audit.metadata.rule_id, "rule-foo");
});

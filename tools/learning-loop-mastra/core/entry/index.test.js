import { test } from "node:test";
import assert from "node:assert";
import {
  factoryFor, validateCrossRefs, findOrphans, outboundRefsAll, deepFreeze,
  createFinding, createRule, createChangeLog, createLoopDesign,
} from "./index.js";
import {
  metaStateFindingEntrySchema, metaStateRuleEntrySchema,
  metaStateChangeEntrySchema, metaStateLoopDesignSchema,
} from "../meta-state.js";

const FINDING = {
  id: "meta-test-finding", entry_kind: "finding",
  category: "gate-logic-bug", severity: "warning", affected_system: "meta",
  description: "Test finding for index tests.", status: "active",
  consolidated_into: "meta-test-changelog", promoted_to_rule: "rule-test-rule",
  created_at: "2026-06-27T00:00:00Z",
};

const RULE = {
  id: "rule-test-rule", entry_kind: "rule", origin: "meta-test-finding",
  enforcement: "gate", pattern_type: "regex", pattern: "^git push",
  description: "Test rule for index tests.", status: "active",
  promoted_at: "2026-06-27T00:00:00Z", promoted_by: "operator",
  created_at: "2026-06-27T00:00:00Z",
};

const CHANGELOG = {
  id: "meta-test-changelog", entry_kind: "change-log",
  change_dimension: "mechanical", change_target: "core/meta-state.js",
  change_diff: { added: ["x"], removed: [], changed: [] },
  reason: "Test change-log for index tests.",
  status: "active", created_at: "2026-06-27T00:00:00Z",
  consolidates: "meta-test-finding",
};

const LOOPDESIGN = {
  id: "loop-design-test", entry_kind: "loop-design",
  title: "Test loop design for index tests", status: "active",
  proposed_design_for: ["rule-test-rule"], addresses: ["meta-test-finding"],
  description: "Test loop-design for index tests.",
  affected_system: "meta", created_at: "2026-06-27T00:00:00Z", created_by: "operator",
};

const REGISTRY = [FINDING, RULE, CHANGELOG, LOOPDESIGN];

// --- factoryFor ---

test("factoryFor dispatches by entry_kind", () => {
  assert.strictEqual(factoryFor(FINDING).kind, "finding");
  assert.strictEqual(factoryFor(RULE).kind, "rule");
  assert.strictEqual(factoryFor(CHANGELOG).kind, "change-log");
  assert.strictEqual(factoryFor(LOOPDESIGN).kind, "loop-design");
});

test("factoryFor defaults to 'finding' for legacy entries missing entry_kind", () => {
  const legacy = { ...FINDING };
  delete legacy.entry_kind;
  assert.strictEqual(factoryFor(legacy).kind, "finding");
});

test("factoryFor throws on unknown entry_kind", () => {
  assert.throws(() => factoryFor({ entry_kind: "unknown" }), /Unknown entry_kind/);
});

// --- validateCrossRefs ---

test("validateCrossRefs returns empty orphans for a clean registry", () => {
  const { orphans } = validateCrossRefs(REGISTRY);
  assert.deepStrictEqual(orphans, []);
});

test("validateCrossRefs surfaces missing outbound refs", () => {
  // Strip promoted_to_rule so only consolidated_into is an orphan
  const { promoted_to_rule, ...base } = FINDING;
  const orphanFinding = { ...base, consolidated_into: "meta-does-not-exist" };
  const { orphans } = validateCrossRefs([orphanFinding]);
  assert.strictEqual(orphans.length, 1);
  assert.deepStrictEqual(orphans[0], {
    from: orphanFinding.id, to: "meta-does-not-exist", field: "consolidated_into",
  });
});

// --- findOrphans ---

test("findOrphans is an alias for validateCrossRefs.orphans", () => {
  const orphans = findOrphans(REGISTRY);
  assert.deepStrictEqual(orphans, validateCrossRefs(REGISTRY).orphans);
});

// --- outboundRefsAll ---

test("outboundRefsAll returns a Map of id → refs", () => {
  const graph = outboundRefsAll(REGISTRY);
  for (const entry of REGISTRY) {
    assert.ok(graph.has(entry.id));
    assert.ok(Array.isArray(graph.get(entry.id)));
  }
});

// --- deepFreeze ---

test("deepFreeze freezes nested objects", () => {
  const obj = { a: { b: { c: 1 } } };
  deepFreeze(obj);
  assert.ok(Object.isFrozen(obj));
  assert.ok(Object.isFrozen(obj.a));
  assert.ok(Object.isFrozen(obj.a.b));
  assert.throws(() => { obj.a.b.c = 2; }, TypeError);
});

test("deepFreeze handles circular references", () => {
  const obj = { a: 1 };
  obj.self = obj;
  deepFreeze(obj);
  assert.ok(Object.isFrozen(obj));
});

// --- soft-inversion safeguards ---

test("instance.schema === canonical schema (reference equality) for all 4 kinds", () => {
  assert.strictEqual(createFinding(FINDING).schema, metaStateFindingEntrySchema);
  assert.strictEqual(createRule(RULE).schema, metaStateRuleEntrySchema);
  assert.strictEqual(createChangeLog(CHANGELOG).schema, metaStateChangeEntrySchema);
  assert.strictEqual(createLoopDesign(LOOPDESIGN).schema, metaStateLoopDesignSchema);
});

test("factory function has no .schema property (instance does, not factory)", () => {
  assert.strictEqual(createFinding.schema, undefined);
  assert.strictEqual(createRule.schema, undefined);
});

test("core/README.md documents the soft-inversion contract", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const readme = readFileSync(
    join(import.meta.dirname, "..", "README.md"), "utf8",
  );
  assert.match(readme, /Schemas? = validation source/);
  assert.match(readme, /Factories? = ergonomic surface/);
  assert.match(readme, /Soft inversion by operator decision/);
  assert.match(readme, /factoryInstance\.schema/);
});

test("factory outputs are deep-frozen (nested verification frozen)", () => {
  const finding = createFinding({
    ...FINDING,
    verification: { steps: ["check-a"] },
  });
  assert.ok(Object.isFrozen(finding));
  assert.ok(Object.isFrozen(finding.data.verification), "nested verification must be frozen");
  assert.throws(() => { finding.data = null; }, TypeError);
});

import { test } from "node:test";
import assert from "node:assert";
import { metaStateRuleEntrySchema } from "../meta-state.js";
import { createRule } from "./rule.js";

const FIXTURE = {
  id: "rule-test-rule",
  entry_kind: "rule",
  origin: "meta-test-finding",
  enforcement: "gate",
  pattern_type: "regex",
  pattern: "^git push",
  scope_predicate: "none",
  applies_to_resolution: "meta-test-finding",
  supersedes: "rule-old-rule",
  description: "Test rule for factory unit tests.",
  status: "active",
  promoted_at: "2026-06-27T00:00:00Z",
  promoted_by: "operator",
  created_at: "2026-06-27T00:00:00Z",
};

test("createRule returns frozen object", () => {
  const r = createRule(FIXTURE);
  assert.ok(Object.isFrozen(r));
  assert.strictEqual(r.kind, "rule");
});

test("createRule.schema === metaStateRuleEntrySchema (reference equality)", () => {
  const r = createRule(FIXTURE);
  assert.strictEqual(r.schema, metaStateRuleEntrySchema);
});

test("createRule rejects invalid data", () => {
  assert.throws(() => createRule({ id: "bad-id", entry_kind: "rule" }), /pattern_type/);
});

test("createRule.isActive and isConsultChecklist", () => {
  const active = createRule(FIXTURE);
  assert.ok(active.isActive());
  assert.ok(!active.isConsultChecklist());

  const consult = createRule({ ...FIXTURE, pattern_type: "consult-checklist", pattern: "session-123" });
  assert.ok(consult.isConsultChecklist());
});

test("createRule.outboundRefs returns correct refs", () => {
  const r = createRule(FIXTURE);
  const refs = r.outboundRefs();
  const fields = refs.map((f) => f.field).sort();
  assert.ok(fields.includes("origin"));
  assert.ok(fields.includes("supersedes"));
  assert.ok(fields.includes("applies_to_resolution"));

  const originRef = refs.find((f) => f.field === "origin");
  assert.strictEqual(originRef.id, "meta-test-finding");
  assert.strictEqual(originRef.kind, "finding");
});

test("createRule.inboundRefs scans registry", () => {
  const r = createRule(FIXTURE);
  const findingWithPromoted = {
    id: "meta-test-finding",
    entry_kind: "finding",
    promoted_to_rule: "rule-test-rule",
  };
  const root = [FIXTURE, findingWithPromoted];
  const refs = r.inboundRefs(root);
  const promotedRef = refs.find((f) => f.field === "promoted_to_rule");
  assert.ok(promotedRef, "expected inbound ref from finding via promoted_to_rule");
  assert.strictEqual(promotedRef.id, "meta-test-finding");
  assert.strictEqual(promotedRef.kind, "finding");
});

test("createRule.matches regex pattern", () => {
  const r = createRule(FIXTURE);
  assert.ok(r.matches("git push origin main", null));
  assert.ok(!r.matches("npm install", null));
});

test("createRule.matches consult-checklist returns false", () => {
  const r = createRule({ ...FIXTURE, pattern_type: "consult-checklist", pattern: "session-123" });
  assert.ok(!r.matches("anything", null));
});

test("createRule.appliesTo with scope_predicate none", () => {
  const r = createRule(FIXTURE);
  assert.ok(r.appliesTo("/any/root"));
});

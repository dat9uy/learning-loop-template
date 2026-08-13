import { test } from "vitest";
import assert from "node:assert";
import { metaStateRuleEntrySchema } from "../meta-state.js";
import { createRule } from "./rule.js";

const FIXTURE = {
  id: "rule-test-rule",
  entry_kind: "rule",
  origin: "meta-test-finding",
  internalization_level: "I3",
  pattern_type: "regex",
  pattern: "^git push",
  scope_predicate: "none",
  applies_to_resolution: "meta-test-finding",
  supersedes: "rule-old-rule",
  description: "Test rule for factory unit tests.",
  status: "active",
  promoted_at: "2026-06-27T00:00:00Z",
  promoted_by: "operator",
  evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
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

test("createRule.isActive and isAgentChecklist", () => {
  const active = createRule(FIXTURE);
  assert.ok(active.isActive());
  assert.ok(!active.isAgentChecklist());

  const consult = createRule({ ...FIXTURE, pattern_type: "agent-checklist", pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }) });
  assert.ok(consult.isAgentChecklist());
});

test("createRule accepts status:\"archived\" (archived in enum, no parseForRead needed)", () => {
  // deleteEntry appends status:"archived" for non-change-log kinds; createRule
  // must accept the tombstone directly without parseForRead.
  const archived = createRule({ ...FIXTURE, status: "archived" });
  assert.strictEqual(archived.data.status, "archived");
  assert.ok(!archived.isActive());
});

test("createRule.outboundRefs returns correct refs", () => {
  const r = createRule(FIXTURE);
  const refs = r.outboundRefs();
  // `origin` and `supersedes` were de-routed from CROSS_REFS; their canonical
  // edges now live as citation rows. Only `applies_to_resolution` (forwardOnly,
  // RI-exempt) remains as an outbound ref for a rule.
  const fields = refs.map((ref) => ref.field);
  assert.deepStrictEqual(fields, ["applies_to_resolution"]);
  assert.ok(!fields.includes("origin"));
  assert.ok(!fields.includes("supersedes"));

  const appliesRef = refs.find((ref) => ref.field === "applies_to_resolution");
  assert.strictEqual(appliesRef.id, "meta-test-finding");
  assert.strictEqual(appliesRef.kind, "finding");
});

test("createRule.inboundRefs scans registry", () => {
  const r = createRule(FIXTURE);
  // The migrated on-record `finding.promoted_to_rule` field is de-routed from
  // CROSS_REFS, so it no longer produces an inbound ref to the rule. The
  // canonical promotion edge is now a citation (source:rule, target:finding),
  // which surfaces an inbound to the FINDING, not the rule. A rule's inbound
  // edges come from citations whose `target` is the rule id (e.g. a supersedes
  // citation from another rule).
  const findingWithPromoted = {
    id: "meta-test-finding",
    entry_kind: "finding",
    promoted_to_rule: "rule-test-rule",
  };
  const refsFromField = r.inboundRefs([FIXTURE, findingWithPromoted]);
  assert.deepStrictEqual(refsFromField, [],
    "promoted_to_rule on-record field alone must not produce an inbound ref to the rule");

  const supersedesCitation = {
    id: "citation-supersedes-rule-old-rule",
    entry_kind: "citation",
    source: "rule-new-rule",
    target: "rule-test-rule",
    rationale: "supersedes",
    recorded_at: "2026-06-27T00:00:00Z",
    recorded_by: "operator",
    status: "active",
    version: 0,
  };
  const refs = r.inboundRefs([FIXTURE, findingWithPromoted, supersedesCitation]);
  const citedBy = refs.find((ref) => ref.field === "target");
  assert.ok(citedBy, "expected a cited_by inbound ref from the supersedes citation");
  assert.strictEqual(citedBy.id, "rule-new-rule");
  assert.strictEqual(citedBy.kind, "rule");
});

test("createRule.matches regex pattern", () => {
  const r = createRule(FIXTURE);
  assert.ok(r.matches("git push origin main", null));
  assert.ok(!r.matches("npm install", null));
});

test("createRule.matches agent-checklist returns false", () => {
  const r = createRule({ ...FIXTURE, pattern_type: "agent-checklist", pattern: JSON.stringify({ version: 1, items: [{ id: "x", description: "y" }] }) });
  assert.ok(!r.matches("anything", null));
});

test("createRule.matches glob returns false (handled by gate-logic.globMatch)", () => {
  const r = createRule({ ...FIXTURE, pattern_type: "glob", pattern: "**/*.test.js" });
  assert.strictEqual(r.matches("git push", "tools/foo.test.js"), false,
    "factory.matches() must not handle glob; glob matching lives in gate-logic.globMatch");
  assert.strictEqual(r.matches("git push", "tools/foo.js"), false);
});

test("createRule.matches determinism-checklist returns false", () => {
  const r = createRule({ ...FIXTURE, pattern_type: "determinism-checklist", pattern: "session-123" });
  assert.ok(!r.matches("anything", null));
});

test("createRule.appliesTo with scope_predicate none", () => {
  const r = createRule(FIXTURE);
  assert.ok(r.appliesTo("/any/root"));
});

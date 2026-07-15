import { test } from "vitest";
import assert from "node:assert";
import { metaStateFindingEntrySchema } from "../meta-state.js";
import { createFinding } from "./finding.js";

const FIXTURE = {
  id: "meta-test-finding",
  entry_kind: "finding",
  category: "gate-logic-bug",
  severity: "warning",
  affected_system: "meta",
  description: "Test finding for factory unit tests.",
  // Plan 260707-0812 Phase 2: enum collapsed to {open, resolved, superseded}.
  status: "open",
  consolidated_into: "meta-test-changelog",
  reopens: ["meta-stale-parent"],
  promoted_to_rule: "rule-test-rule",
  created_at: "2026-06-27T00:00:00Z",
};

test("createFinding returns frozen object", () => {
  const f = createFinding(FIXTURE);
  assert.ok(Object.isFrozen(f));
  assert.strictEqual(f.kind, "finding");
});

test("createFinding.schema === metaStateFindingEntrySchema (reference equality)", () => {
  const f = createFinding(FIXTURE);
  assert.strictEqual(f.schema, metaStateFindingEntrySchema);
});

test("createFinding parses via canonical Zod schema", () => {
  const f = createFinding(FIXTURE);
  assert.strictEqual(f.data.id, "meta-test-finding");
  assert.strictEqual(f.data.category, "gate-logic-bug");
  assert.strictEqual(f.data.severity, "warning");
});

test("createFinding rejects invalid data", () => {
  assert.throws(() => createFinding({ id: "test", entry_kind: "finding" }), /category/);
});

test("createFinding.outboundRefs returns correct refs", () => {
  const f = createFinding(FIXTURE);
  const refs = f.outboundRefs();
  const fields = refs.map((r) => r.field).sort();
  assert.ok(fields.includes("consolidated_into"));
  assert.ok(fields.includes("promoted_to_rule"));
  assert.ok(fields.includes("reopens"));

  const consolidatedRef = refs.find((r) => r.field === "consolidated_into");
  assert.strictEqual(consolidatedRef.id, "meta-test-changelog");
  assert.strictEqual(consolidatedRef.kind, "change-log");

  const reopensRef = refs.find((r) => r.field === "reopens");
  assert.strictEqual(reopensRef.id, "meta-stale-parent");
  assert.strictEqual(reopensRef.kind, "finding");
});

test("createFinding status helpers (isOpen / isStaleView)", () => {
  // Plan 260707-0812 Phase 2: predicates reworked to isOpen/isStaleView.
  // The canonical status is now `open`. The enum no longer accepts
  // `active`/`stale` directly (those were removed); the `isOpen` tolerance
  // is exercised at the predicate level in stale-view.test.js (the entry
  // helper cannot construct them anymore — the schema blocks them).
  const RECENT = new Date().toISOString();
  const open   = createFinding({ ...FIXTURE, status: "open",   created_at: RECENT });
  assert.ok(open.isOpen());
  assert.ok(!open.isStaleView());
  assert.ok(!open.isBlocking());

  const resolved = createFinding({ ...FIXTURE, status: "resolved" });
  assert.ok(!resolved.isOpen());
  assert.ok(!resolved.isStaleView());

  const blocking = createFinding({ ...FIXTURE, severity: "escalate" });
  assert.ok(blocking.isBlocking());
});

test("createFinding.inboundRefs scans registry for refs to this finding", () => {
  const f = createFinding(FIXTURE);
  const ruleThatOriginates = {
    id: "rule-test-rule",
    entry_kind: "rule",
    origin: "meta-test-finding",
  };
  const changelogThatConsolidates = {
    id: "meta-test-changelog",
    entry_kind: "change-log",
    consolidates: ["meta-test-finding"],
  };
  const root = [FIXTURE, ruleThatOriginates, changelogThatConsolidates];
  const refs = f.inboundRefs(root);
  // Should find the rule via origin
  const originRef = refs.find((r) => r.field === "origin");
  assert.ok(originRef, "expected an inbound ref from rule via origin");
  assert.strictEqual(originRef.id, "rule-test-rule");
  assert.strictEqual(originRef.kind, "rule");
});

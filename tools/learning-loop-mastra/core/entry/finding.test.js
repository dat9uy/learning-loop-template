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
  // The migrated fields (consolidated_into, promoted_to_rule) are de-routed
  // from CROSS_REFS; their canonical edges now live as citation rows. Only
  // `reopens` remains as an outbound ref for a finding.
  const fields = refs.map((r) => r.field);
  assert.deepStrictEqual(fields, ["reopens"]);
  assert.ok(!fields.includes("consolidated_into"));
  assert.ok(!fields.includes("promoted_to_rule"));

  const reopensRef = refs.find((r) => r.field === "reopens");
  assert.strictEqual(reopensRef.id, "meta-stale-parent");
  assert.strictEqual(reopensRef.kind, "finding");
});

test("createFinding status helpers (isOpen / isStaleView)", () => {
  // The canonical status is `open`. The enum no longer accepts
  // `active`/`stale` directly; the `isOpen` tolerance is exercised at the
  // predicate level in stale-view.test.js (the entry helper cannot construct
  // them anymore — the schema blocks them).
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

test("createFinding accepts status:\"archived\" (archived in enum, no parseForRead needed)", () => {
  // deleteEntry appends status:"archived" for non-change-log kinds;
  // createFinding must accept the tombstone directly without parseForRead.
  const archived = createFinding({ ...FIXTURE, status: "archived" });
  assert.strictEqual(archived.data.status, "archived");
  assert.ok(!archived.isOpen());
});

test("createFinding.inboundRefs scans registry for refs to this finding", () => {
  const f = createFinding(FIXTURE);
  // The migrated on-record fields (rule.origin, change-log.consolidates) are
  // de-routed from CROSS_REFS, so they no longer produce inbound refs. The
  // canonical promotion edge is now a citation row (source:rule,
  // target:finding, rationale:"origin"); inverseRefs surfaces it via the
  // citation's `target` field substitution (cited_by).
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

  // On-record fields alone: no inbound refs (origin/consolidates de-routed).
  const refsFromFields = f.inboundRefs([FIXTURE, ruleThatOriginates, changelogThatConsolidates]);
  assert.deepStrictEqual(refsFromFields, []);

  // Seed the canonical promotion citation; the finding is the citation's
  // target, so inverseRefs reports the citation's source as the inbound ref.
  const originCitation = {
    id: "citation-origin-rule-test-rule",
    entry_kind: "citation",
    source: "rule-test-rule",
    target: "meta-test-finding",
    rationale: "origin",
    recorded_at: "2026-06-27T00:00:00Z",
    recorded_by: "operator",
    status: "active",
    version: 0,
  };
  const refs = f.inboundRefs([FIXTURE, ruleThatOriginates, changelogThatConsolidates, originCitation]);
  const citedBy = refs.find((r) => r.field === "target");
  assert.ok(citedBy, "expected a cited_by inbound ref from the origin citation");
  assert.strictEqual(citedBy.id, "rule-test-rule");
  assert.strictEqual(citedBy.kind, "rule");
});

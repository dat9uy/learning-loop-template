import { test } from "vitest";
import assert from "node:assert";
import { metaStateChangeEntrySchema } from "../meta-state.js";
import { createChangeLog } from "./change-log.js";

const FIXTURE = {
  id: "meta-test-changelog",
  entry_kind: "change-log",
  change_dimension: "mechanical",
  change_target: "core/meta-state.js",
  change_diff: { added: ["field-x"], removed: [], changed: [] },
  reason: "Test change-log for factory unit tests.",
  status: "active",
  created_at: "2026-06-27T00:00:00Z",
  supersedes: "meta-old-changelog",
  consolidates: ["meta-finding-a", "meta-finding-b"],
};

test("createChangeLog returns frozen object", () => {
  const c = createChangeLog(FIXTURE);
  assert.ok(Object.isFrozen(c));
  assert.strictEqual(c.kind, "change-log");
});

test("createChangeLog.schema === metaStateChangeEntrySchema (reference equality)", () => {
  const c = createChangeLog(FIXTURE);
  assert.strictEqual(c.schema, metaStateChangeEntrySchema);
});

test("createChangeLog rejects invalid data", () => {
  assert.throws(() => createChangeLog({ entry_kind: "change-log" }), /change_dimension/);
});

test("createChangeLog.outboundRefs returns correct refs", () => {
  const c = createChangeLog(FIXTURE);
  const refs = c.outboundRefs();
  // Both `supersedes` and `consolidates` were de-routed from CROSS_REFS; their
  // canonical edges now live as citation rows. A change-log has no remaining
  // outbound cross-ref fields.
  assert.deepStrictEqual(refs, []);
});

test("createChangeLog.inboundRefs scans registry", () => {
  const c = createChangeLog(FIXTURE);
  // The migrated on-record `finding.consolidated_into` field is de-routed
  // from CROSS_REFS, so it no longer produces an inbound ref to the change-log.
  // The canonical consolidated edge is now a citation (source:finding,
  // target:change-log, rationale:"consolidated into"); inverseRefs surfaces it
  // via the citation's `target` field substitution (cited_by).
  const findingWithConsolidated = {
    id: "meta-finding-a",
    entry_kind: "finding",
    consolidated_into: "meta-test-changelog",
  };
  const refsFromField = c.inboundRefs([FIXTURE, findingWithConsolidated]);
  assert.deepStrictEqual(refsFromField, [],
    "consolidated_into on-record field alone must not produce an inbound ref to the change-log");

  const consolidatedCitation = {
    id: "citation-consolidated-meta-finding-a",
    entry_kind: "citation",
    source: "meta-finding-a",
    target: "meta-test-changelog",
    rationale: "consolidated into",
    recorded_at: "2026-06-27T00:00:00Z",
    recorded_by: "operator",
    status: "active",
    version: 0,
  };
  const refs = c.inboundRefs([FIXTURE, findingWithConsolidated, consolidatedCitation]);
  const citedBy = refs.find((ref) => ref.field === "target");
  assert.ok(citedBy, "expected a cited_by inbound ref from the consolidated citation");
  assert.strictEqual(citedBy.id, "meta-finding-a");
  assert.strictEqual(citedBy.kind, "finding");
});

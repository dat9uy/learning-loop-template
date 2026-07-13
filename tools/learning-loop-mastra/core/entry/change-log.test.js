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
  consolidates: "meta-finding-a,meta-finding-b",
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
  const fields = refs.map((f) => f.field).sort();
  assert.ok(fields.includes("supersedes"));
  assert.ok(fields.includes("consolidates"));

  const supersedesRef = refs.find((f) => f.field === "supersedes");
  assert.strictEqual(supersedesRef.id, "meta-old-changelog");
  assert.strictEqual(supersedesRef.kind, "change-log");

  const consolidateRefs = refs.filter((f) => f.field === "consolidates");
  assert.strictEqual(consolidateRefs.length, 2);
  assert.strictEqual(consolidateRefs[0].id, "meta-finding-a");
  assert.strictEqual(consolidateRefs[0].kind, "finding");
});

test("createChangeLog.inboundRefs scans registry", () => {
  const c = createChangeLog(FIXTURE);
  const findingWithConsolidated = {
    id: "meta-finding-a",
    entry_kind: "finding",
    consolidated_into: "meta-test-changelog",
  };
  const root = [FIXTURE, findingWithConsolidated];
  const refs = c.inboundRefs(root);
  const consolidatedRef = refs.find((f) => f.field === "consolidated_into");
  assert.ok(consolidatedRef, "expected inbound ref from finding via consolidated_into");
  assert.strictEqual(consolidatedRef.id, "meta-finding-a");
  assert.strictEqual(consolidatedRef.kind, "finding");
});

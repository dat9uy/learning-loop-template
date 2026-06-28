import { test } from "node:test";
import assert from "node:assert";
import { metaStateLoopDesignSchema } from "../meta-state.js";
import { createLoopDesign } from "./loop-design.js";

const FIXTURE = {
  id: "loop-design-test",
  entry_kind: "loop-design",
  title: "Test loop design for factory unit tests",
  status: "active",
  proposed_design_for: ["rule-test-rule", "meta-test-finding"],
  addresses: ["meta-motivation-finding"],
  description: "Test loop-design for factory unit tests.",
  affected_system: "meta",
  created_at: "2026-06-27T00:00:00Z",
  created_by: "operator",
};

test("createLoopDesign returns frozen object", () => {
  const d = createLoopDesign(FIXTURE);
  assert.ok(Object.isFrozen(d));
  assert.strictEqual(d.kind, "loop-design");
});

test("createLoopDesign.schema === metaStateLoopDesignSchema (reference equality)", () => {
  const d = createLoopDesign(FIXTURE);
  assert.strictEqual(d.schema, metaStateLoopDesignSchema);
});

test("createLoopDesign rejects invalid data", () => {
  assert.throws(() => createLoopDesign({ entry_kind: "loop-design" }), /title/);
});

test("createLoopDesign.outboundRefs returns correct refs", () => {
  const d = createLoopDesign(FIXTURE);
  const refs = d.outboundRefs();
  const fields = refs.map((f) => f.field).sort();
  assert.ok(fields.includes("proposed_design_for"));
  assert.ok(fields.includes("addresses"));

  const designRefs = refs.filter((f) => f.field === "proposed_design_for");
  assert.strictEqual(designRefs.length, 2);
  assert.strictEqual(designRefs[0].id, "rule-test-rule");
  assert.strictEqual(designRefs[0].kind, "rule");

  const addressRef = refs.find((f) => f.field === "addresses");
  assert.strictEqual(addressRef.id, "meta-motivation-finding");
  assert.strictEqual(addressRef.kind, "finding");
});

test("createLoopDesign.inboundRefs is always empty (leaf node)", () => {
  const d = createLoopDesign(FIXTURE);
  const refs = d.inboundRefs([FIXTURE]);
  assert.deepStrictEqual(refs, []);
});

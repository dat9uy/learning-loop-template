/**
 * Bug #1 regression-prevention test: forward `reopens` AND inverse `reopened_by`
 * must both be derivable for the same child/parent pair.
 *
 * Plan: plans/260730-0240-relationship-model-centralize-defer-drop/plan.md, Phase 1.
 *
 * Why this test exists: `buildInverseIndexes` (`core/loop-introspect.js`) builds only
 * the inverse `reopens_inverse` map; the forward `reopens` direction is supplied by the
 * factory's `outboundRefs()`. A centralized module that naively mirrored
 * `buildInverseIndexes` (inverse-only) would regress `outbound.reopens` to null —
 * reintroducing the asymmetry that finding meta-260623T1126Z captured.
 *
 * Invariant under test: for any finding with `reopens: [parentId]`:
 *   (a) `factory.outboundRefs()` emits `{kind:"finding", id:parentId, field:"reopens"}` (forward)
 *   (b) `factory.inboundRefs(root)` emits the child via `reopens` (inverse)
 *   (c) `buildInverseIndexes(entries).reopens_inverse.get(parentId)` includes the child
 * All three come from one logical source. Whichever module produces them later must
 * preserve this symmetry — the test is the regression gate.
 */

import { test } from "vitest";
import assert from "node:assert";
import { factoryFor } from "../../core/entry/index.js";
import { buildInverseIndexes } from "../../core/loop-introspect.js";

function makeFinding(overrides = {}) {
  return {
    id: "meta-f1",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "meta",
    description: "Reopens symmetry regression-prevention test fixture for Phase 1.",
    ...overrides,
  };
}

test("reopens symmetry: child forward + parent inverse + index inverse all derive the same pair", () => {
  const parent = makeFinding({ id: "meta-stale-parent", status: "resolved" });
  const child = makeFinding({ id: "meta-child-reopens", status: "open", reopens: ["meta-stale-parent"] });
  const entries = [parent, child];

  // (a) Forward — factory.outboundRefs reads entry.reopens.
  const childFactory = factoryFor(child);
  const forward = childFactory.outboundRefs();
  assert.ok(
    forward.some(
      (r) => r.kind === "finding" && r.id === "meta-stale-parent" && r.field === "reopens"
    ),
    "child.outboundRefs must include the reopens edge"
  );

  // (b) Inverse — parent.inboundRefs scans root for findings whose reopens include parent.
  const parentFactory = factoryFor(parent);
  const inverseRefs = parentFactory.inboundRefs(entries);
  assert.ok(
    inverseRefs.some(
      (r) => r.kind === "finding" && r.id === "meta-child-reopens" && r.field === "reopens"
    ),
    "parent.inboundRefs must include the child via reopens"
  );

  // (c) Index layer inverse — buildInverseIndexes builds reopens_inverse keyed by parent.
  const indexes = buildInverseIndexes(entries);
  const reopenedBy = indexes.reopens_inverse.get("meta-stale-parent");
  assert.ok(Array.isArray(reopenedBy), "reopens_inverse must be a Map<id, id[]>");
  assert.ok(
    reopenedBy.includes("meta-child-reopens"),
    "reopens_inverse must include the child keyed by the parent"
  );
});

test("reopens symmetry: multi-reopens child emits N forward edges + N inverse index entries", () => {
  const parentA = makeFinding({ id: "meta-stale-a" });
  const parentB = makeFinding({ id: "meta-stale-b" });
  const child = makeFinding({ id: "meta-child-multi", reopens: ["meta-stale-a", "meta-stale-b"] });
  const entries = [parentA, parentB, child];

  const childFactory = factoryFor(child);
  const forward = childFactory.outboundRefs();
  const reopensEdges = forward.filter((r) => r.field === "reopens");
  assert.strictEqual(reopensEdges.length, 2, "child reopens array emits N forward edges");

  const indexes = buildInverseIndexes(entries);
  assert.deepStrictEqual(
    indexes.reopens_inverse.get("meta-stale-a"),
    ["meta-child-multi"]
  );
  assert.deepStrictEqual(
    indexes.reopens_inverse.get("meta-stale-b"),
    ["meta-child-multi"]
  );
});
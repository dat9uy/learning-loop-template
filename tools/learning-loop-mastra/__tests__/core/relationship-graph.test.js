/**
 * Module unit tests for `core/entry/relationship-graph.js`.
 *
 * Plan: plans/260730-0240-relationship-model-centralize-defer-drop/plan.md, Phase 2.
 *
 * Verifies the contract declared in Phase 2's "Architecture" block:
 *   - forwardRefs per kind emits the declared edges with correct kind/field
 *   - inverseRefs returns entries whose forwardRefs point at targetId
 *   - buildInverseIndexes returns the 6 named Maps; promoted_to_rule_inverse
 *     is 1 ref (canonical rule.origin); reopens_inverse keyed by parent
 *   - resolveStructuralRI is id-existence only; applies_to_resolution exempt;
 *     "*" + empty fields exempt; tombstones count as present
 *   - diffChangedRefs returns only introduced/repointed refs; excludes
 *     applies_to_resolution; array-reorder/dedup does not spuriously flag
 */

import { test } from "vitest";
import assert from "node:assert";
import {
  forwardRefs, inverseRefs, buildInverseIndexes,
  resolveStructuralRI, diffChangedRefs, parseConsolidates, inboundFromLoopDesign,
  _internal,
} from "../../core/entry/relationship-graph.js";

// ---- forwardRefs per kind ----

test("forwardRefs.finding: reopens (multi) + consolidated_into + promoted_to_rule", () => {
  const entry = {
    id: "meta-f1",
    entry_kind: "finding",
    reopens: ["meta-stale-a", "meta-stale-b"],
    consolidated_into: "meta-cl-1",
    promoted_to_rule: "rule-r1",
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "consolidated_into:meta-cl-1",
    "promoted_to_rule:rule-r1",
    "reopens:meta-stale-a",
    "reopens:meta-stale-b",
  ]);
});

test("forwardRefs.finding: empty/null/[] fields omitted; absent fields omitted", () => {
  const entry = { id: "meta-f1", entry_kind: "finding", reopens: [], consolidated_into: null, promoted_to_rule: "" };
  assert.deepStrictEqual(forwardRefs(entry), []);
});

test("forwardRefs.change-log: supersedes + consolidates (multi)", () => {
  const entry = {
    id: "meta-cl-1",
    entry_kind: "change-log",
    supersedes: "meta-cl-0",
    consolidates: ["meta-f-a", "meta-f-b"],
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "consolidates:meta-f-a",
    "consolidates:meta-f-b",
    "supersedes:meta-cl-0",
  ]);
});

test("forwardRefs.rule: origin + supersedes + applies_to_resolution", () => {
  const entry = {
    id: "rule-r1",
    entry_kind: "rule",
    origin: "meta-f1",
    supersedes: "rule-r0",
    applies_to_resolution: "meta-f-x",
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
    "origin:meta-f1",
    "supersedes:rule-r0",
  ]);
});

test("forwardRefs.rule: applies_to_resolution='*' NOT emitted as edge", () => {
  const entry = {
    id: "rule-r1",
    entry_kind: "rule",
    applies_to_resolution: "*",
  };
  const refs = forwardRefs(entry);
  assert.deepStrictEqual(refs, []);
});

test("forwardRefs.loop-design: kindForId fallback returns `finding` (not `meta`) for meta-…", () => {
  // Red-team R3 / validator kind-"meta" bug fix.
  const entry = {
    id: "loop-design-1",
    entry_kind: "loop-design",
    proposed_design_for: ["meta-f1"], // dangling → no entries provided
    addresses: ["meta-f2"],
  };
  const refs = forwardRefs(entry);
  for (const r of refs) {
    assert.strictEqual(r.kind, "finding", `kindForId fallback must be "finding", got "${r.kind}"`);
  }
});

test("forwardRefs.loop-design: kindForId lookup-first when entries provided", () => {
  const entries = [
    { id: "rule-r1", entry_kind: "rule" },
    { id: "meta-f1", entry_kind: "finding" },
  ];
  const entry = {
    id: "loop-design-1",
    entry_kind: "loop-design",
    proposed_design_for: ["rule-r1", "meta-f1"],
  };
  const refs = forwardRefs(entry, entries);
  const kinds = Object.fromEntries(refs.map((r) => [r.id, r.kind]));
  assert.strictEqual(kinds["rule-r1"], "rule");
  assert.strictEqual(kinds["meta-f1"], "finding");
});

// ---- inverseRefs ----

test("inverseRefs: returns refs from entries whose forwardRefs point at targetId", () => {
  const entries = [
    { id: "meta-f1", entry_kind: "finding", consolidated_into: "meta-cl-1", reopens: ["meta-stale"] },
    { id: "meta-cl-1", entry_kind: "change-log", consolidates: ["meta-f1"] },
    { id: "meta-stale", entry_kind: "finding" },
  ];
  // meta-f1 → consolidated_into:meta-cl-1 — meta-f1 is the inbound source for meta-cl-1
  const inbound = inverseRefs("meta-cl-1", entries);
  assert.ok(inbound.some((r) => r.id === "meta-f1" && r.kind === "finding" && r.field === "consolidated_into"),
    "meta-f1 is the inbound source for meta-cl-1");
  // meta-stale is reopens'd by meta-f1 — meta-f1 is the inbound source for meta-stale
  const inboundStale = inverseRefs("meta-stale", entries);
  assert.ok(inboundStale.some((r) => r.id === "meta-f1" && r.field === "reopens"),
    "meta-f1 is the inbound source for meta-stale via reopens");
});

test("inverseRefs: finding's promoted_to_rule IS an inbound source (entry points at rule)", () => {
  // `inverseRefs(targetId)` returns refs from entries whose forward refs
  // POINT AT targetId. Each ref describes the SOURCE entry: id = source
  // entry id, kind = source entry kind. The finding's
  // `promoted_to_rule: "rule-r1"` IS an outbound ref to rule-r1, so the
  // finding appears as the inbound source. The dedup of the dual-field
  // 2-ref artifact is handled in `buildInverseIndexes` (not in `inverseRefs`).
  const entries = [
    { id: "meta-f1", entry_kind: "finding", promoted_to_rule: "rule-r1" },
    { id: "rule-r1", entry_kind: "rule", origin: "meta-f1" },
  ];
  const inverse = inverseRefs("rule-r1", entries);
  assert.strictEqual(inverse.length, 1);
  assert.strictEqual(inverse[0].id, "meta-f1", "ref id is the SOURCE (meta-f1)");
  assert.strictEqual(inverse[0].kind, "finding");
  assert.strictEqual(inverse[0].field, "promoted_to_rule");
});

// ---- buildInverseIndexes (6-map shape + dedup) ----

test("buildInverseIndexes: returns the 6 named Maps", () => {
  const r = buildInverseIndexes([]);
  for (const k of [
    "addresses_inverse", "supersedes_inverse", "origin_inverse",
    "promoted_to_rule_inverse", "reopens_inverse", "consolidated_into_inverse",
  ]) {
    assert.ok(r[k] instanceof Map, `${k} must be a Map`);
  }
});

test("buildInverseIndexes: dual-field promoted_to_rule → 1 ref (canonical rule.origin)", () => {
  // Phase 2 ships the canonical 1-ref behavior; Phase 1 characterization
  // tests pin the CURRENT 2-ref behavior on the legacy `loop-introspect.js`
  // implementation. This test locks the new module's 1-ref output.
  const entries = [
    { id: "rule-r1", entry_kind: "rule", origin: "meta-f1" },
    { id: "meta-f1", entry_kind: "finding", promoted_to_rule: "rule-r1" },
  ];
  const r = buildInverseIndexes(entries);
  const ptr = r.promoted_to_rule_inverse.get("rule-r1");
  assert.strictEqual(ptr.length, 1, "canonical rule.origin → 1 ref");
  assert.strictEqual(ptr[0], "meta-f1");
});

test("buildInverseIndexes: reopens_inverse keyed by parent (stale)", () => {
  const entries = [
    { id: "meta-stale-parent", entry_kind: "finding" },
    { id: "meta-child", entry_kind: "finding", reopens: ["meta-stale-parent"] },
  ];
  const r = buildInverseIndexes(entries);
  assert.deepStrictEqual(r.reopens_inverse.get("meta-stale-parent"), ["meta-child"]);
});

test("buildInverseIndexes: forward reopens ALSO derivable from `entry.reopens` (bug #1 regression prevention)", () => {
  // The index layer historically lacked a forward `reopens` index. The graph
  // closes the asymmetry by reading `entry.reopens` directly via `forwardRefs`.
  const entries = [
    { id: "meta-stale-parent", entry_kind: "finding" },
    { id: "meta-child", entry_kind: "finding", reopens: ["meta-stale-parent"] },
  ];
  // forward edge from meta-child:
  const fwd = forwardRefs(entries[1]);
  assert.ok(fwd.some((r) => r.id === "meta-stale-parent" && r.field === "reopens"));
  // inverse edge from meta-stale-parent (keyed by parent, values are source entry IDs):
  const inv = buildInverseIndexes(entries).reopens_inverse.get("meta-stale-parent");
  assert.ok(inv.includes("meta-child"));
});

// ---- resolveStructuralRI (id-existence only) ----

test("resolveStructuralRI: all targets present → ok=true, dangling=[]", () => {
  const entry = { id: "meta-f1", entry_kind: "finding", reopens: ["meta-stale"] };
  const existenceSet = new Set(["meta-f1", "meta-stale"]);
  const r = resolveStructuralRI(entry, existenceSet);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.dangling, []);
});

test("resolveStructuralRI: missing target → ok=false with field+id", () => {
  const entry = { id: "meta-f1", entry_kind: "finding", reopens: ["meta-missing"] };
  const existenceSet = new Set(["meta-f1"]);
  const r = resolveStructuralRI(entry, existenceSet);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.dangling, [{ field: "reopens", id: "meta-missing" }]);
});

test("resolveStructuralRI: applies_to_resolution RI-EXEMPT (red-team R4)", () => {
  // `applies_to_resolution` is `z.string().optional()`, not an entry-id ref;
  // a determinism-checklist pattern like `test-session-123` is valid.
  const entry = {
    id: "rule-r1",
    entry_kind: "rule",
    origin: "meta-f1",
    applies_to_resolution: "test-session-123",
  };
  const existenceSet = new Set(["meta-f1"]); // test-session-123 NOT in registry
  const r = resolveStructuralRI(entry, existenceSet);
  assert.strictEqual(r.ok, true, "applies_to_resolution must be RI-exempt");
});

test("resolveStructuralRI: applies_to_resolution='*' RI-EXEMPT", () => {
  const entry = {
    id: "rule-r1",
    entry_kind: "rule",
    applies_to_resolution: "*",
  };
  const existenceSet = new Set([]);
  const r = resolveStructuralRI(entry, existenceSet);
  assert.strictEqual(r.ok, true);
});

test("resolveStructuralRI: tombstone id (still in projection) → ok=true (red-team R8)", () => {
  // Liveness out of scope; deleted ids remain in the projection, so a ref
  // to a tombstone passes RI. The derived `dangling_refs` view surfaces it
  // post-hoc.
  const entry = {
    id: "meta-f1",
    entry_kind: "finding",
    reopens: ["meta-deleted"],
  };
  const existenceSet = new Set(["meta-f1", "meta-deleted"]); // tombstone still in projection
  const r = resolveStructuralRI(entry, existenceSet);
  assert.strictEqual(r.ok, true, "tombstone id counts as present (id-existence only)");
});

// ---- diffChangedRefs ----

test("diffChangedRefs: returns only introduced/repointed refs", () => {
  const newRefs = [
    { kind: "finding", id: "meta-new", field: "reopens" },
    { kind: "finding", id: "meta-stale", field: "reopens" }, // unchanged
  ];
  const oldRefs = [
    { kind: "finding", id: "meta-stale", field: "reopens" },
  ];
  const changed = diffChangedRefs(newRefs, oldRefs);
  assert.deepStrictEqual(changed, [{ kind: "finding", id: "meta-new", field: "reopens" }]);
});

test("diffChangedRefs: excludes applies_to_resolution (RI-exempt)", () => {
  const newRefs = [{ kind: "finding", id: "test-session-123", field: "applies_to_resolution" }];
  const oldRefs = [];
  const changed = diffChangedRefs(newRefs, oldRefs);
  assert.deepStrictEqual(changed, [], "applies_to_resolution excluded");
});

test("diffChangedRefs: array-reorder/dedup of consolidates does NOT spuriously flag", () => {
  // [b, a] vs [a, b] — same set, different order. diffChangedRefs is order-
  // agnostic (Set-based), so no spurious "changed" ref.
  const newRefs = [
    { kind: "finding", id: "meta-b", field: "consolidates" },
    { kind: "finding", id: "meta-a", field: "consolidates" },
  ];
  const oldRefs = [
    { kind: "finding", id: "meta-a", field: "consolidates" },
    { kind: "finding", id: "meta-b", field: "consolidates" },
  ];
  const changed = diffChangedRefs(newRefs, oldRefs);
  assert.deepStrictEqual(changed, []);
});

// ---- folded leaf helpers ----

test("parseConsolidates: array pass-through", () => {
  assert.deepStrictEqual(parseConsolidates(["a", "b"]), ["a", "b"]);
});

test("parseConsolidates: legacy CSV-string tolerated", () => {
  assert.deepStrictEqual(parseConsolidates("a,b,c"), ["a", "b", "c"]);
});

test("inboundFromLoopDesign: emits addresses + proposed_design_for edges", () => {
  const entry = {
    id: "loop-design-1",
    entry_kind: "loop-design",
    addresses: ["meta-f1"],
    proposed_design_for: ["rule-r1"],
  };
  const parsed = { id: "meta-f1" };
  const refs = inboundFromLoopDesign(entry, parsed);
  // Only the matching addresses edge; rule-r1 doesn't match.
  assert.deepStrictEqual(refs, [{ kind: "loop-design", id: "loop-design-1", field: "addresses" }]);
});

// ---- CROSS_REFS table integrity (sanity) ----

test("CROSS_REFS table exposes the expected fields per kind", () => {
  const { CROSS_REFS } = _internal;
  const fields = (kind) => CROSS_REFS[kind].map((s) => s.field);
  // Field order matches the legacy finding.js outbound order
  // (consolidated_into first, then reopens multi-valued, then promoted_to_rule).
  assert.deepStrictEqual(fields("finding"), ["consolidated_into", "reopens", "promoted_to_rule"]);
  assert.deepStrictEqual(fields("change-log"), ["supersedes", "consolidates"]);
  assert.deepStrictEqual(fields("rule"), ["origin", "supersedes", "applies_to_resolution"]);
  assert.deepStrictEqual(fields("loop-design"), ["proposed_design_for", "addresses"]);
});
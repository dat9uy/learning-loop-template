/**
 * Module unit tests for `core/entry/relationship-graph.js`.
 *
 * Plan: plans/260730-0240-relationship-model-centralize-defer-drop/plan.md, Phase 2.
 * Updated for Phase 3 of meta-state-lifecycle-migration:
 *   - `consolidated_into`/`consolidates` de-routed from `CROSS_REFS`
 *     (the live consolidated edge is a citation row)
 *   - 7th inverse map `citations_inverse` added
 *
 * Verifies the contract declared in Phase 2's "Architecture" block:
 *   - forwardRefs per kind emits the declared edges with correct kind/field
 *   - inverseRefs returns entries whose forwardRefs point at targetId
 *   - buildInverseIndexes returns the 7 named Maps; promoted_to_rule_inverse
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

test("forwardRefs.finding: reopens (multi) only (Phase 3+4 dropped consolidated_into, promoted_to_rule)", () => {
  // Phase 3: `consolidated_into` was de-routed from `CROSS_REFS`; the live
  // consolidated edge is a citation row. Phase 4: `promoted_to_rule` was
  // retired (canonical promotion edge is the origin citation). Old version
  // lines still carry both fields (the schema accepts them), but
  // `forwardRefs` no longer emits either.
  const entry = {
    id: "meta-f1",
    entry_kind: "finding",
    reopens: ["meta-stale-a", "meta-stale-b"],
    consolidated_into: "meta-cl-1", // inert-historical; ignored
    promoted_to_rule: "rule-r1", // inert-historical; ignored
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "reopens:meta-stale-a",
    "reopens:meta-stale-b",
  ]);
});

test("forwardRefs.finding: empty/null/[] fields omitted; absent fields omitted", () => {
  const entry = { id: "meta-f1", entry_kind: "finding", reopens: [], promoted_to_rule: "" };
  assert.deepStrictEqual(forwardRefs(entry), []);
});

test("forwardRefs.change-log: empty (Phase 3+4 dropped consolidates + supersedes)", () => {
  // Phase 3: `consolidates` de-routed from `CROSS_REFS`.
  // Phase 4: `supersedes` de-routed from `CROSS_REFS`. Old version
  // lines still carry both fields (the schema accepts them), but
  // `forwardRefs` no longer emits either.
  const entry = {
    id: "meta-cl-1",
    entry_kind: "change-log",
    supersedes: "meta-cl-0", // inert-historical (Phase 4); ignored
    consolidates: ["meta-f-a", "meta-f-b"], // inert-historical; ignored
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, []);
});

test("forwardRefs.rule: applies_to_resolution only (Phase 4 dropped origin + supersedes)", () => {
  // Phase 4: `origin` + `supersedes` de-routed from `CROSS_REFS`; the
  // canonical edges are citation rows. Old version lines still carry
  // both fields (the schema accepts them), but `forwardRefs` no longer
  // emits them. Only `applies_to_resolution` remains as a forwardOnly
  // field (RI-EXEMPT, no inverse map).
  const entry = {
    id: "rule-r1",
    entry_kind: "rule",
    origin: "meta-f1", // inert-historical; ignored
    supersedes: "rule-r0", // inert-historical; ignored
    applies_to_resolution: "meta-f-x",
  };
  const refs = forwardRefs(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
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

test("inverseRefs: returns refs from entries whose forwardRefs point at targetId (Phase 3 citation)", () => {
  // Phase 3: the consolidated edge is sourced from a citation row, not
  // from on-record `consolidated_into`/`consolidates` fields. The
  // citation's `target` field carries the edge into the inbound set;
  // `inverseRefs` substitutes the citation's `source` (the citing
  // finding) for the inbound id, so the wire shape reports who cited
  // the target rather than the audit row's id.
  const entries = [
    { id: "meta-f1", entry_kind: "finding", reopens: ["meta-stale"] },
    { id: "meta-stale", entry_kind: "finding" },
    {
      id: "citation-1",
      entry_kind: "citation",
      source: "meta-f1",
      target: "meta-cl-1",
      rationale: "consolidated into meta-cl-1",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  // citation.target = meta-cl-1 — meta-f1 (the citation's source) is the
  // inbound source for meta-cl-1.
  const inbound = inverseRefs("meta-cl-1", entries);
  assert.ok(
    inbound.some((r) => r.id === "meta-f1" && r.kind === "finding" && r.field === "target"),
    "citation source (the citing finding) is the inbound source for the change-log via target field",
  );
  // meta-stale is reopens'd by meta-f1 — meta-f1 is the inbound source for meta-stale
  const inboundStale = inverseRefs("meta-stale", entries);
  assert.ok(inboundStale.some((r) => r.id === "meta-f1" && r.field === "reopens"),
    "meta-f1 is the inbound source for meta-stale via reopens");
});

test("inverseRefs: origin citation row surfaces as inbound source for finding (Phase 4)", () => {
  // Phase 4: the canonical promotion edge is a citation row
  // (`source:rule, target:finding, rationale:"origin"`). The on-record
  // `rule.origin` + `finding.promoted_to_rule` fields are
  // inert-historical. `inverseRefs(findingId, entries)` returns the
  // citing rule via the citation's `target` field substitution.
  const entries = [
    { id: "meta-f1", entry_kind: "finding" },
    { id: "rule-r1", entry_kind: "rule" },
    {
      id: "citation-origin",
      entry_kind: "citation",
      source: "rule-r1",
      target: "meta-f1",
      rationale: "origin",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  const inverse = inverseRefs("meta-f1", entries);
  // The citation's source (rule-r1) is the inbound source for meta-f1.
  assert.ok(
    inverse.some((r) => r.id === "rule-r1" && r.kind === "rule" && r.field === "target"),
    "rule-r1 is the inbound source for meta-f1 via the origin citation",
  );
});

// ---- buildInverseIndexes (4-map shape + dedup) ----

test("buildInverseIndexes: returns the named Maps (Phase 3+4 collapsed shape)", () => {
  // Phase 3: `consolidated_into_inverse` stays in the named-maps shape
  // but is sourced from citations (kept empty for on-record; populated
  // by Phase 3+4 citation emissions).
  // Phase 4: `origin_inverse` / `supersedes_inverse` /
  // `promoted_to_rule_inverse` collapsed into `citations_inverse`.
  // Final shape: addresses_inverse + reopens_inverse (named) +
  // consolidated_into_inverse (kept for backward compat) +
  // citations_inverse (generic carrier).
  const r = buildInverseIndexes([]);
  for (const k of [
    "addresses_inverse",
    "reopens_inverse",
    "consolidated_into_inverse",
    "citations_inverse",
  ]) {
    assert.ok(r[k] instanceof Map, `${k} must be a Map`);
  }
});

test("buildInverseIndexes: origin citation surfaces as inbound via citations_inverse (Phase 4)", () => {
  // Phase 4: `meta-f1` is the citation's target; the inverse map surfaces
  // the citing rule (`rule-r1`) under `meta-f1`'s key.
  const entries = [
    { id: "meta-f1", entry_kind: "finding" },
    { id: "rule-r1", entry_kind: "rule" },
    {
      id: "citation-origin",
      entry_kind: "citation",
      source: "rule-r1",
      target: "meta-f1",
      rationale: "origin",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  const r = buildInverseIndexes(entries);
  assert.deepStrictEqual(r.citations_inverse.get("meta-f1"), ["rule-r1"]);
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

test("buildInverseIndexes: citations_inverse keyed by target id with source ids", () => {
  // Phase 2 added citations_inverse (target→sources); Phase 3 routes the
  // consolidated edge through it.
  const entries = [
    { id: "meta-f1", entry_kind: "finding" },
    { id: "meta-f2", entry_kind: "finding" },
    { id: "meta-cl-1", entry_kind: "change-log" },
    {
      id: "citation-1",
      entry_kind: "citation",
      source: "meta-f1",
      target: "meta-cl-1",
      rationale: "consolidated into meta-cl-1",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-2",
      entry_kind: "citation",
      source: "meta-f2",
      target: "meta-cl-1",
      rationale: "consolidated into meta-cl-1",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  const r = buildInverseIndexes(entries);
  assert.deepStrictEqual(r.citations_inverse.get("meta-cl-1"), ["meta-f1", "meta-f2"]);
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

test("diffChangedRefs: array-reorder/dedup of reopens does NOT spuriously flag", () => {
  // [b, a] vs [a, b] — same set, different order. diffChangedRefs is order-
  // agnostic (Set-based), so no spurious "changed" ref.
  const newRefs = [
    { kind: "finding", id: "meta-b", field: "reopens" },
    { kind: "finding", id: "meta-a", field: "reopens" },
  ];
  const oldRefs = [
    { kind: "finding", id: "meta-a", field: "reopens" },
    { kind: "finding", id: "meta-b", field: "reopens" },
  ];
  const changed = diffChangedRefs(newRefs, oldRefs);
  assert.deepStrictEqual(changed, []);
});

// ---- folded leaf helpers ----

test("parseConsolidates: array pass-through", () => {
  assert.deepStrictEqual(parseConsolidates(["a", "b"]), ["a", "b"]);
});

test("parseConsolidates: legacy CSV-string tolerated (inert-historical)", () => {
  // Phase 3: `consolidates` is inert-historical on disk but the leaf
  // helper is retained for legacy-version-line parsing.
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

test("CROSS_REFS table exposes the expected fields per kind (Phase 3+4 shape)", () => {
  const { CROSS_REFS } = _internal;
  const fields = (kind) => CROSS_REFS[kind].map((s) => s.field);
  // Phase 3: `consolidated_into` + `consolidates` de-routed.
  // Phase 4: `promoted_to_rule` retired (origin citation is canonical).
  // Finding field order: reopens only.
  // Phase 3+4: change-log has no on-record cross-ref fields (both
  // `consolidates` and `supersedes` de-routed). Rule field order:
  // applies_to_resolution only (origin + supersedes de-routed).
  assert.deepStrictEqual(fields("finding"), ["reopens"]);
  assert.deepStrictEqual(fields("change-log"), []);
  assert.deepStrictEqual(fields("rule"), ["applies_to_resolution"]);
  assert.deepStrictEqual(fields("loop-design"), ["proposed_design_for", "addresses"]);
  // Citation kind carries source + target.
  assert.deepStrictEqual(fields("citation"), ["source", "target"]);
});
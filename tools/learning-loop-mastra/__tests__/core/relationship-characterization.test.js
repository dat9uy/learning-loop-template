/**
 * Characterization oracle for the centralized relationship model.
 *
 * Locks the centralized (post-refactor) behavior produced by the
 * relationship-model centralization:
 *   - the 4 factories' `outboundRefs` / `inboundRefs` (finding/rule/change-log/loop-design),
 *     now delegating to `core/entry/relationship-graph.js`
 *   - `core/loop-introspect.js#buildInverseIndexes` (the 6 named maps), now a
 *     thin re-export of the graph
 *   - the canonical 1-ref `promoted_to_rule_inverse` (sourced from `rule.origin`
 *     alone — the pre-centralization 2-ref artifact double-counted one relationship)
 *   - the CI validator's `forwardRefs` (loop-design kind-"meta"→"finding" fix +
 *     emitted rule `supersedes`/`applies_to_resolution`), now delegating to the graph
 *   - `computeTopReferences` / `top_references` citation counts at the canonical
 *     1-ref values
 *
 * These assertions are integration-level (factories + loop-introspect + validator),
 * complementing the unit-level `relationship-graph.test.js`. Where a test documents
 * a deliberate change from the pre-centralization behavior, the comment says so.
 */

import { test } from "vitest";
import assert from "node:assert";
import { factoryFor } from "../../core/entry/index.js";
import { buildInverseIndexes, buildRegistrySummary } from "../../core/loop-introspect.js";
import { outboundRefsOf } from "../../scripts/validate-registry-refs.js";

// --- Minimal schema-valid entry helpers ---
// The factories call `schema.parse(data)` so each entry must satisfy its schema's
// required fields. We use the smallest valid payload per kind.

function makeFinding(overrides = {}) {
  return {
    id: "meta-f1",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "meta",
    description: "Characterization test finding fixture used by Phase 1 oracle.",
    ...overrides,
  };
}

function makeRule(overrides = {}) {
  return {
    id: "rule-r1",
    entry_kind: "rule",
    internalization_level: "I3",
    evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    pattern_type: "regex",
    pattern: "^git push",
    description: "Characterization test rule fixture used by Phase 1 oracle.",
    promoted_at: "2026-07-30T00:00:00Z",
    promoted_by: "operator",
    ...overrides,
  };
}

function makeChangeLog(overrides = {}) {
  return {
    id: "meta-cl-1",
    entry_kind: "change-log",
    change_dimension: "mechanical",
    change_target: "core/meta-state.js",
    change_diff: { added: [], removed: [], changed: [] },
    reason: "Characterization test change-log fixture used by Phase 1 oracle.",
    created_at: "2026-07-30T00:00:00Z",
    ...overrides,
  };
}

function makeLoopDesign(overrides = {}) {
  return {
    id: "loop-design-1",
    entry_kind: "loop-design",
    title: "Characterization test loop design fixture for Phase 1 oracle.",
    status: "active",
    proposed_design_for: ["rule-r1"],
    addresses: ["meta-f1"],
    description: "Characterization test loop design description for Phase 1 oracle.",
    affected_system: "meta",
    created_at: "2026-07-30T00:00:00Z",
    created_by: "operator",
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Section 1: factories — forward `outboundRefs` per kind
// -----------------------------------------------------------------------------

test("finding.outboundRefs: reopens (multi) only (Phase 3+4 dropped consolidated_into + promoted_to_rule)", () => {
  // Phase 3: `consolidated_into` was de-routed from `CROSS_REFS`; the live
  // consolidated edge is a citation row. Phase 4: `promoted_to_rule` was
  // retired (canonical promotion edge is the origin citation). Old version
  // lines still carry both fields (the schema accepts them), but
  // `outboundRefs` no longer emits either.
  const entry = makeFinding({
    consolidated_into: "meta-cl-1", // inert-historical; ignored
    reopens: ["meta-stale-a", "meta-stale-b"],
    promoted_to_rule: "rule-r1", // inert-historical; ignored
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "reopens:meta-stale-a",
    "reopens:meta-stale-b",
  ]);
});

test("finding.outboundRefs: omit absent multi/single fields", () => {
  const entry = makeFinding({ id: "meta-f2" });
  const factory = factoryFor(entry);
  assert.deepStrictEqual(factory.outboundRefs(), []);
});

test("change-log.outboundRefs: supersedes only (Phase 3 dropped consolidates)", () => {
  // Phase 3: `consolidates` was de-routed from `CROSS_REFS`; the live
  // consolidated edge is sourced from `citations_inverse`. Old version
  // lines still carry the field (the schema accepts it), but
  // `outboundRefs` no longer emits it. Phase 4: `supersedes` itself
  // was de-routed too — outbound for change-log is empty unless the
  // entry sets `applies_to_resolution` or other fields.
  const entry = makeChangeLog({
    supersedes: "meta-cl-0", // inert-historical (Phase 4); ignored
    consolidates: ["meta-f-a", "meta-f-b"], // inert-historical; ignored
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, []);
});

test("rule.outboundRefs: applies_to_resolution only (Phase 4 dropped origin + supersedes)", () => {
  // Phase 4: `origin` + `supersedes` de-routed from `CROSS_REFS`; the
  // canonical edges are citation rows. Old version lines still carry
  // both fields (the schema accepts them), but `outboundRefs` no
  // longer emits them. Only `applies_to_resolution` remains as a
  // forwardOnly field.
  const entry = makeRule({
    origin: "meta-f1", // inert-historical; ignored
    supersedes: "rule-r0", // inert-historical; ignored
    applies_to_resolution: "meta-f-x",
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
  ]);
});

test("loop-design.outboundRefs: proposed_design_for (multi) + addresses (multi) — kind lookup-first then prefix fallback", () => {
  const entries = [
    makeRule({ id: "rule-r1" }),
    makeFinding({ id: "meta-f1" }),
    { id: "meta-f-missing", entry_kind: undefined },
  ];
  const entry = makeLoopDesign({
    proposed_design_for: ["rule-r1", "meta-f1"],
    addresses: ["meta-f1", "meta-f-missing"],
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs(entries);
  const pdf = refs.filter((r) => r.field === "proposed_design_for");
  assert.deepStrictEqual(pdf.map((r) => `${r.kind}:${r.id}`).sort(), [
    "finding:meta-f1",
    "rule:rule-r1",
  ]);
  const addr = refs.filter((r) => r.field === "addresses");
  assert.deepStrictEqual(addr.map((r) => `${r.kind}:${r.id}`).sort(), [
    "finding:meta-f-missing",
    "finding:meta-f1",
  ]);
});

// -----------------------------------------------------------------------------
// Section 2: factories — inverse `inboundRefs` per kind (the 2 inverse implementations)
// -----------------------------------------------------------------------------

test("finding.inboundRefs: reopens inverse from `entry.reopens` (forward source-of-truth)", () => {
  const parent = makeFinding({ id: "meta-stale-parent" });
  const child = makeFinding({ id: "meta-child", reopens: ["meta-stale-parent"] });
  const factory = factoryFor(parent);
  const refs = factory.inboundRefs([parent, child]);
  const reopensRefs = refs.filter((r) => r.field === "reopens");
  assert.deepStrictEqual(reopensRefs, [{ kind: "finding", id: "meta-child", field: "reopens" }]);
});

test("rule.inboundRefs: dual-field promoted_to_rule is retired (Phase 4 ghost-ref removed)", () => {
  // Phase 4 retired the dual-field ghost-ref: rule.origin + finding.promoted_to_rule
  // are both inert-historical. The canonical promotion edge is the origin
  // citation row. Without a citation row, the inbound set is empty.
  const finding = makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" });
  const rule = makeRule({ id: "rule-r1", origin: "meta-f1" });
  const factory = factoryFor(rule);
  const refs = factory.inboundRefs([finding, rule]);
  const ptr = refs.filter((r) => r.field === "promoted_to_rule");
  assert.strictEqual(ptr.length, 0, "Phase 4: dual-field promoted_to_rule retired; inbound is empty without citation row");
});

test("finding.inboundRefs: origin citation row surfaces via citations_inverse (Phase 4)", () => {
  // Phase 4: the canonical promotion edge is a citation row
  // (`source:rule, target:finding, rationale:"origin"`). `inverseRefs`
  // surfaces the citing rule via the citation's `target` field
  // substitution — emitted as `cited_by` (Phase 4 generic wire shape).
  const finding = makeFinding({ id: "meta-legacy" });
  const rule = makeRule({ id: "rule-r1" });
  const citation = {
    id: "citation-test-rule-inbound",
    entry_kind: "citation",
    source: "rule-r1",
    target: "meta-legacy",
    rationale: "origin",
    recorded_at: "2026-08-02T00:00:00.000Z",
    recorded_by: "operator",
    status: "active",
  };
  const factory = factoryFor(finding);
  const refs = factory.inboundRefs([finding, rule, citation]);
  // The citation's source (rule-r1) becomes the inbound; we filter on
  // the target-substitution field. groupInbound maps this to
  // `cited_by`.
  const cites = refs.filter((r) => r.field === "target");
  assert.ok(cites.length > 0, "Phase 4: origin citation surfaces inbound for the finding");
  assert.strictEqual(cites[0].id, "rule-r1");
});

// -----------------------------------------------------------------------------
// Section 3: `buildInverseIndexes` — the 6 named maps + dual-source 2-ref artifact
// -----------------------------------------------------------------------------

test("buildInverseIndexes returns the 7 named Maps", () => {
  const result = buildInverseIndexes([]);
  assert.ok(result.addresses_inverse instanceof Map);
  assert.ok(result.supersedes_inverse instanceof Map);
  assert.ok(result.origin_inverse instanceof Map);
  assert.ok(result.promoted_to_rule_inverse instanceof Map);
  assert.ok(result.reopens_inverse instanceof Map);
  assert.ok(result.consolidated_into_inverse instanceof Map); // empty post-Phase 3
  assert.ok(result.citations_inverse instanceof Map); // 7th map
});

test("buildInverseIndexes: dual-field promoted_to_rule → 0 refs (Phase 4 retired; origin is now a citation)", () => {
  // Phase 4: the canonical promotion edge is the origin citation row;
  // `promoted_to_rule_inverse` is empty (no on-record source). The
  // canonical 1-ref behavior (Phase 2 / centralization) was achieved by
  // indexing only rule.origin; Phase 4 retires rule.origin as well.
  const entries = [
    makeRule({ id: "rule-r1", origin: "meta-f1" }),
    makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" }),
  ];
  const result = buildInverseIndexes(entries);
  const ptr = result.promoted_to_rule_inverse.get("rule-r1");
  assert.strictEqual(ptr, undefined, "Phase 4: promoted_to_rule_inverse is empty (origin is now a citation)");
});

test("buildInverseIndexes: reopens_inverse keyed by the parent (stale)", () => {
  const entries = [
    makeFinding({ id: "meta-stale-parent" }),
    makeFinding({ id: "meta-child", reopens: ["meta-stale-parent"] }),
  ];
  const result = buildInverseIndexes(entries);
  assert.deepStrictEqual(result.reopens_inverse.get("meta-stale-parent"), ["meta-child"]);
});

test("buildInverseIndexes: consolidated edge sourced from citations_inverse (Phase 3)", () => {
  // Phase 3 collapsed `consolidated_into` + `consolidates` into citation rows.
  // The live consolidated edge is sourced from `citations_inverse`
  // (target=change-log, source=finding). `consolidated_into_inverse` is
  // empty post-Phase 3 — readers iterate `citations_inverse`.
  const entries = [
    makeFinding({ id: "meta-f-a" }),
    makeFinding({ id: "meta-f-b" }),
    makeChangeLog({ id: "meta-cl-1" }),
    {
      id: "citation-c1",
      entry_kind: "citation",
      source: "meta-f-a",
      target: "meta-cl-1",
      rationale: "consolidated into meta-cl-1",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-c2",
      entry_kind: "citation",
      source: "meta-f-b",
      target: "meta-cl-1",
      rationale: "consolidated into meta-cl-1",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  const result = buildInverseIndexes(entries);
  const ids = result.citations_inverse.get("meta-cl-1");
  assert.ok(ids && ids.includes("meta-f-a"), `expected meta-f-a in citations_inverse for meta-cl-1, got ${JSON.stringify(ids)}`);
  assert.ok(ids && ids.includes("meta-f-b"), `expected meta-f-b in citations_inverse for meta-cl-1, got ${JSON.stringify(ids)}`);
  // consolidated_into_inverse is empty (no on-record field source).
  assert.strictEqual(result.consolidated_into_inverse.get("meta-cl-1"), undefined);
});

// -----------------------------------------------------------------------------
// Section 4: validator OUTBOUND_EXTRACTORS — pin CURRENT divergences (bugs)
// -----------------------------------------------------------------------------

test("validator forwardRefs.rule: emits applies_to_resolution only (Phase 4 dropped origin + supersedes)", () => {
  // Phase 4: `origin` + `supersedes` de-routed from `CROSS_REFS`; the
  // canonical edges are citation rows. The validator delegates to
  // `graph.forwardRefs`, which emits only the declared cross-ref fields
  // per kind.
  const entry = makeRule({
    origin: "meta-f1", // inert-historical; ignored
    supersedes: "rule-r0", // inert-historical; ignored
    applies_to_resolution: "meta-f-x",
  });
  const refs = outboundRefsOf(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
  ]);
});

test("validator forwardRefs.loop-design: classifies non-rule target as kind `finding`", () => {
  // Phase 3 fix: the validator's kindForId fallback now returns `finding`
  // for the meta-… prefix (previously returned the literal string `meta`).
  const entry = makeLoopDesign({
    proposed_design_for: ["meta-f1"],
  });
  const refs = outboundRefsOf(entry);
  assert.strictEqual(refs[0].kind, "finding", "Phase 3 fix: kindForId returns `finding` for meta-…");
});

// -----------------------------------------------------------------------------
// Section 5: `computeTopReferences` / `top_references` characterization (red-team R6)
// -----------------------------------------------------------------------------

test("computeTopReferences: dual-field artifact → citations_inverse (Phase 4)", () => {
  // Phase 4: `origin` + `supersedes` de-routed from `CROSS_REFS`; the
  // canonical promotion edge is the origin citation row. Without a
  // citation row, neither rule-r1 nor meta-f1 appears in top_references.
  const entries = [
    makeRule({ id: "rule-r1", origin: "meta-f1" }),
    makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" }),
  ];
  const summary = buildRegistrySummary(entries, new Map());
  const ruleR1 = summary.top_references.find((r) => r.id === "rule-r1");
  const metaF1 = summary.top_references.find((r) => r.id === "meta-f1");
  assert.strictEqual(ruleR1, undefined, "Phase 4: rule-r1 not in top_references without origin citation");
  assert.strictEqual(metaF1, undefined, "Phase 4: meta-f1 not in top_references without origin citation");
});

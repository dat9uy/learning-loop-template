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
    enforcement: "gate",
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

test("finding.outboundRefs: consolidated_into + reopens (multi) + promoted_to_rule", () => {
  const entry = makeFinding({
    consolidated_into: "meta-cl-1",
    reopens: ["meta-stale-a", "meta-stale-b"],
    promoted_to_rule: "rule-r1",
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "consolidated_into:meta-cl-1",
    "promoted_to_rule:rule-r1",
    "reopens:meta-stale-a",
    "reopens:meta-stale-b",
  ]);
});

test("finding.outboundRefs: omit absent multi/single fields", () => {
  const entry = makeFinding({ id: "meta-f2" });
  const factory = factoryFor(entry);
  assert.deepStrictEqual(factory.outboundRefs(), []);
});

test("change-log.outboundRefs: supersedes + consolidates (multi)", () => {
  const entry = makeChangeLog({
    supersedes: "meta-cl-0",
    consolidates: ["meta-f-a", "meta-f-b"],
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "consolidates:meta-f-a",
    "consolidates:meta-f-b",
    "supersedes:meta-cl-0",
  ]);
});

test("rule.outboundRefs: origin + supersedes + applies_to_resolution", () => {
  const entry = makeRule({
    origin: "meta-f1",
    supersedes: "rule-r0",
    applies_to_resolution: "meta-f-x",
  });
  const factory = factoryFor(entry);
  const refs = factory.outboundRefs();
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
    "origin:meta-f1",
    "supersedes:rule-r0",
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

test("rule.inboundRefs: dual-field promoted_to_rule dedups to 1 ref (canonical rule.origin)", () => {
  // CURRENT: rule.js dedups rule.origin vs finding.promoted_to_rule via `seenPromotedFrom` Set.
  // A dual-field finding (has promoted_to_rule AND a rule whose origin points at it)
  // yields 1 ref here (rule.js dedups).
  const finding = makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" });
  const rule = makeRule({ id: "rule-r1", origin: "meta-f1" });
  const factory = factoryFor(rule);
  const refs = factory.inboundRefs([finding, rule]);
  const ptr = refs.filter((r) => r.field === "promoted_to_rule");
  assert.strictEqual(ptr.length, 1, "rule.js dual-field dedup yields 1 ref");
  assert.strictEqual(ptr[0].id, "meta-f1");
  assert.strictEqual(ptr[0].kind, "finding");
});

test("rule.inboundRefs: rule.origin present even when finding.promoted_to_rule absent", () => {
  const finding = makeFinding({ id: "meta-legacy" });
  const rule = makeRule({ id: "rule-r1", origin: "meta-legacy" });
  const factory = factoryFor(rule);
  const refs = factory.inboundRefs([finding, rule]);
  const ptr = refs.filter((r) => r.field === "promoted_to_rule");
  assert.strictEqual(ptr.length, 1);
  assert.strictEqual(ptr[0].id, "meta-legacy");
});

// -----------------------------------------------------------------------------
// Section 3: `buildInverseIndexes` — the 6 named maps + dual-source 2-ref artifact
// -----------------------------------------------------------------------------

test("buildInverseIndexes returns the 6 named Maps", () => {
  const result = buildInverseIndexes([]);
  assert.ok(result.addresses_inverse instanceof Map);
  assert.ok(result.supersedes_inverse instanceof Map);
  assert.ok(result.origin_inverse instanceof Map);
  assert.ok(result.promoted_to_rule_inverse instanceof Map);
  assert.ok(result.reopens_inverse instanceof Map);
  assert.ok(result.consolidated_into_inverse instanceof Map);
});

test("buildInverseIndexes: dual-field promoted_to_rule yields 1 ref (canonical rule.origin — was 2 pre-centralization)", () => {
  // CURRENT (buggy) behavior pinned: rule.origin (pushUnique) + finding.promoted_to_rule
  // (pushToIndex) both contribute → 2 refs for a single relationship.
  // Phase 3 changes this to 1 (canonical rule.origin).
  // Phase 3 fix (canonical): the centralization dedups the dual-field 2-ref
  // artifact to 1 ref (sourced from rule.origin alone). The legacy
  // `finding.promoted_to_rule` field is preserved on disk but no longer
  // contributes to the inverse — fixes the dual-source double-count bug.
  const entries = [
    makeRule({ id: "rule-r1", origin: "meta-f1" }),
    makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" }),
  ];
  const result = buildInverseIndexes(entries);
  const ptr = result.promoted_to_rule_inverse.get("rule-r1");
  assert.strictEqual(ptr.length, 1, "Phase 3: canonical rule.origin → 1 ref (was 2)");
  assert.ok(ptr.includes("meta-f1"));
});

test("buildInverseIndexes: reopens_inverse keyed by the parent (stale)", () => {
  const entries = [
    makeFinding({ id: "meta-stale-parent" }),
    makeFinding({ id: "meta-child", reopens: ["meta-stale-parent"] }),
  ];
  const result = buildInverseIndexes(entries);
  assert.deepStrictEqual(result.reopens_inverse.get("meta-stale-parent"), ["meta-child"]);
});

test("buildInverseIndexes: consolidated_into_inverse keyed by change-log id", () => {
  const entries = [
    makeChangeLog({ consolidates: ["meta-f-a", "meta-f-b"] }),
  ];
  const result = buildInverseIndexes(entries);
  const ids = result.consolidated_into_inverse.get("meta-cl-1");
  // After Phase 3 centralization: the graph's buildInverseIndexes populates
  // consolidated_into_inverse from the change-log's `consolidates` field
  // (the legacy loop-introspect did the same via indexConsolidatedInto).
  assert.ok(ids && ids.includes("meta-f-a"), `expected meta-f-a in ${JSON.stringify(ids)}`);
  assert.ok(ids && ids.includes("meta-f-b"), `expected meta-f-b in ${JSON.stringify(ids)}`);
});

// -----------------------------------------------------------------------------
// Section 4: validator OUTBOUND_EXTRACTORS — pin CURRENT divergences (bugs)
// -----------------------------------------------------------------------------

test("validator forwardRefs.rule: emits origin + supersedes + applies_to_resolution", () => {
  // Phase 3 fix: the validator delegates to `graph.forwardRefs`, which emits
  // all declared cross-ref fields per kind (rule.supersedes +
  // rule.applies_to_resolution were previously omitted by the standalone
  // `OUTBOUND_EXTRACTORS.rule` body — Phase 1 pinned the bug, Phase 3 fixed it).
  const entry = makeRule({
    origin: "meta-f1",
    supersedes: "rule-r0",
    applies_to_resolution: "meta-f-x",
  });
  const refs = outboundRefsOf(entry);
  const fields = refs.map((r) => `${r.field}:${r.id}`).sort();
  assert.deepStrictEqual(fields, [
    "applies_to_resolution:meta-f-x",
    "origin:meta-f1",
    "supersedes:rule-r0",
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

test("computeTopReferences: dual-field artifact deduped — rule-r1 cited once (canonical rule.origin)", () => {
  // After Phase 3 centralization: `rule-r1` is a KEY of `promoted_to_rule_inverse`
  // with 1 ref (canonical rule.origin). meta-f1 is a KEY of `origin_inverse`
  // with 1 ref. Both are correctly cited exactly once.
  const entries = [
    makeRule({ id: "rule-r1", origin: "meta-f1" }),
    makeFinding({ id: "meta-f1", promoted_to_rule: "rule-r1" }),
  ];
  const summary = buildRegistrySummary(entries, new Map());
  const ruleR1 = summary.top_references.find((r) => r.id === "rule-r1");
  const metaF1 = summary.top_references.find((r) => r.id === "meta-f1");
  assert.ok(ruleR1, "top_references should include rule-r1");
  assert.ok(metaF1, "top_references should include meta-f1");
  assert.strictEqual(ruleR1.count, 1, "Phase 3: rule-r1 cited 1× (was 2)");
  assert.strictEqual(metaF1.count, 1, "meta-f1 cited 1× via origin_inverse");
});
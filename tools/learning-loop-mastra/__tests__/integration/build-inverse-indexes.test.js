import { test } from "vitest";
import assert from "node:assert";
import { buildInverseIndexes } from "../../core/loop-introspect.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

test("buildInverseIndexes on empty entries returns empty maps", () => {
  const result = buildInverseIndexes([]);
  assert.strictEqual(result.addresses_inverse.size, 0);
  assert.strictEqual(result.supersedes_inverse.size, 0);
  assert.strictEqual(result.origin_inverse.size, 0);
  assert.strictEqual(result.promoted_to_rule_inverse.size, 0);
  assert.strictEqual(result.reopens_inverse.size, 0);
  // Phase 3: collapsed_into_inverse is empty (no on-record source);
  // citations_inverse is also empty (no citation rows).
  assert.strictEqual(result.consolidated_into_inverse.size, 0);
  assert.strictEqual(result.citations_inverse.size, 0);
});

test("buildInverseIndexes on single-edge entries (Phase 4: origin collapses to citations_inverse)", () => {
  // Phase 4 collapsed `origin` + `supersedes` + `promoted_to_rule` into
  // citation rows. `origin_inverse` and `promoted_to_rule_inverse` are
  // empty (no on-record source); the edge is sourced from
  // `citations_inverse`. Use a citation row to exercise the canonical
  // shape.
  const entries = [
    {
      id: "finding-a",
      entry_kind: "finding",
      status: "open",
    },
    {
      id: "rule-a",
      entry_kind: "rule",
      status: "active",
    },
    {
      id: "citation-a",
      entry_kind: "citation",
      source: "rule-a",
      target: "finding-a",
      rationale: "origin",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];
  const result = buildInverseIndexes(entries);
  // origin_inverse / promoted_to_rule_inverse are empty (Phase 4).
  assert.strictEqual(result.origin_inverse.get("finding-a"), undefined);
  assert.strictEqual(result.promoted_to_rule_inverse.get("rule-a"), undefined);
  // The canonical edge is sourced from citations_inverse.
  assert.deepStrictEqual(result.citations_inverse.get("finding-a"), ["rule-a"]);
});

test("buildInverseIndexes structural contract on synthetic fixture (Phase 4 shape)", () => {
  // Use a synthetic multi-kind fixture so all the named inverse keys
  // are present (Red-team F11 precondition). Phase 4 collapsed
  // origin/supersedes/promoted_to_rule into citations_inverse; the
  // named maps stay in the shape for backward compat (kept empty).
  const fixture = [
    { id: "rule-xxx", entry_kind: "rule", status: "active" },
    { id: "meta-finding-1", entry_kind: "finding", status: "open" },
    { id: "loop-design-yyy", entry_kind: "loop-design", status: "open", addresses: ["meta-finding-1"] },
    { id: "meta-change-1", entry_kind: "change-log", status: "open" },
    { id: "meta-finding-2", entry_kind: "finding", status: "open", reopens: ["meta-finding-1"] },
    {
      id: "citation-origin",
      entry_kind: "citation",
      source: "rule-xxx",
      target: "meta-finding-1",
      rationale: "origin",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
    {
      id: "citation-supersedes",
      entry_kind: "citation",
      source: "meta-change-1",
      target: "meta-change-0",
      rationale: "supersedes",
      recorded_at: "2026-08-02T00:00:00.000Z",
      recorded_by: "operator",
      status: "active",
    },
  ];

  const inverse = buildInverseIndexes(fixture);
  assert.ok(inverse instanceof Object, "inverse indexes is an object");
  assert.ok("addresses_inverse" in inverse, "missing addresses_inverse");
  assert.ok("reopens_inverse" in inverse, "missing reopens_inverse");
  assert.ok("consolidated_into_inverse" in inverse, "missing consolidated_into_inverse");
  assert.ok("citations_inverse" in inverse, "missing citations_inverse (Phase 3+4 generic carrier)");

  for (const key of ["addresses_inverse", "reopens_inverse", "consolidated_into_inverse", "citations_inverse"]) {
    assert.ok(inverse[key] instanceof Map, `${key} must be a Map`);
  }

  // Verify population
  assert.deepStrictEqual(inverse.addresses_inverse.get("meta-finding-1"), ["loop-design-yyy"]);
  // reopens_inverse: keys on the EXPIRED PARENT, values are REOPEN CHILDREN
  assert.deepStrictEqual(inverse.reopens_inverse.get("meta-finding-1"), ["meta-finding-2"]);
  // Phase 4: origin + supersedes populate citations_inverse.
  assert.deepStrictEqual(inverse.citations_inverse.get("meta-finding-1"), ["rule-xxx"]);
  assert.deepStrictEqual(inverse.citations_inverse.get("meta-change-0"), ["meta-change-1"]);
  // origin_inverse / supersedes_inverse / promoted_to_rule_inverse are
  // empty post-Phase 4.
  assert.strictEqual(inverse.origin_inverse.get("meta-finding-1"), undefined);
  assert.strictEqual(inverse.supersedes_inverse.get("meta-change-0"), undefined);
});

test("buildInverseIndexes on live registry returns 7 expected keys", async () => {
  const entries = readRegistry(root);
  const result = buildInverseIndexes(entries);

  // Structural assertion: the 7 keys exist regardless of registry size.
  // The LRU cache ensures readRegistry is fast enough that this test
  // runs in <100ms; the structural assertion locks the contract across
  // refactors that change the registry size.
  assert.ok(result.addresses_inverse instanceof Map, "addresses_inverse must be a Map");
  assert.ok(result.supersedes_inverse instanceof Map, "supersedes_inverse must be a Map");
  assert.ok(result.origin_inverse instanceof Map, "origin_inverse must be a Map");
  assert.ok(result.promoted_to_rule_inverse instanceof Map, "promoted_to_rule_inverse must be a Map");
  assert.ok(result.reopens_inverse instanceof Map, "reopens_inverse must be a Map");
  assert.ok(result.consolidated_into_inverse instanceof Map, "consolidated_into_inverse must be a Map (empty post-Phase 3)");
  assert.ok(result.citations_inverse instanceof Map, "citations_inverse must be a Map (Phase 3)");

  // Soft assertion: any entry with addresses should produce a mapping
  for (const entry of entries) {
    if (Array.isArray(entry.addresses) && entry.addresses.length > 0) {
      for (const target of entry.addresses) {
        const ids = result.addresses_inverse.get(target) || [];
        assert.ok(ids.includes(entry.id), `addresses_inverse missing ${entry.id} for target ${target}`);
      }
    }
  }

  // Verify inverse_indexes field on cold tier
  const { loopDescribeTool } = await import("../../tools/handlers/loop-describe-tool.js");
  const coldResult = await loopDescribeTool.handler({ tier: "cold" });
  const cold = JSON.parse(coldResult.content[0].text);
  assert.ok(cold.inverse_indexes, "cold tier should have inverse_indexes");
  assert.ok(cold.inverse_indexes.addresses_inverse, "should have addresses_inverse");
  assert.ok(cold.inverse_indexes.supersedes_inverse, "should have supersedes_inverse");
  assert.ok(cold.inverse_indexes.origin_inverse, "should have origin_inverse");
  assert.ok(cold.inverse_indexes.promoted_to_rule_inverse, "should have promoted_to_rule_inverse");
  assert.ok(cold.inverse_indexes.reopens_inverse, "should have reopens_inverse");
  assert.ok(cold.inverse_indexes.consolidated_into_inverse, "should have consolidated_into_inverse");
  assert.ok(cold.inverse_indexes.citations_inverse, "should have citations_inverse (Phase 3)");
});

import { test } from "node:test";
import assert from "node:assert";
import { buildInverseIndexes } from "../core/loop-introspect.js";
import { readRegistry } from "../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const root = resolveRoot();

test("buildInverseIndexes on empty entries returns empty maps", () => {
  const result = buildInverseIndexes([]);
  assert.strictEqual(result.addresses_inverse.size, 0);
  assert.strictEqual(result.supersedes_inverse.size, 0);
  assert.strictEqual(result.origin_inverse.size, 0);
  assert.strictEqual(result.promoted_to_rule_inverse.size, 0);
  assert.strictEqual(result.reopens_inverse.size, 0);
});

test("buildInverseIndexes on single-edge entries", () => {
  const entries = [
    {
      id: "finding-a",
      entry_kind: "finding",
      status: "active",
      promoted_to_rule: "rule-a",
    },
    {
      id: "rule-a",
      entry_kind: "rule",
      status: "active",
      origin: "finding-a",
    },
  ];
  const result = buildInverseIndexes(entries);
  assert.deepStrictEqual(result.origin_inverse.get("finding-a"), ["rule-a"]);
  assert.deepStrictEqual(result.promoted_to_rule_inverse.get("rule-a"), ["finding-a"]);
});

test("buildInverseIndexes structural contract on synthetic fixture", () => {
  // Use a synthetic multi-kind fixture so all 5 inverse keys are
  // guaranteed non-empty Maps (Red-team F11 precondition).
  const fixture = [
    { id: "rule-xxx", entry_kind: "rule", status: "active", origin: "meta-finding-1" },
    { id: "meta-finding-1", entry_kind: "finding", status: "active", promoted_to_rule: "rule-xxx" },
    { id: "loop-design-yyy", entry_kind: "loop-design", status: "active", addresses: ["meta-finding-1"] },
    { id: "meta-change-1", entry_kind: "change-log", status: "active", supersedes: "meta-change-0" },
    { id: "meta-finding-2", entry_kind: "finding", status: "active", reopens: ["meta-finding-1"] },
  ];

  const inverse = buildInverseIndexes(fixture);
  assert.ok(inverse instanceof Object, "inverse indexes is an object");
  assert.ok("addresses_inverse" in inverse, "missing addresses_inverse");
  assert.ok("supersedes_inverse" in inverse, "missing supersedes_inverse");
  assert.ok("origin_inverse" in inverse, "missing origin_inverse");
  assert.ok("promoted_to_rule_inverse" in inverse, "missing promoted_to_rule_inverse");
  assert.ok("reopens_inverse" in inverse, "missing reopens_inverse");

  for (const key of ["addresses_inverse", "supersedes_inverse", "origin_inverse", "promoted_to_rule_inverse", "reopens_inverse"]) {
    assert.ok(inverse[key] instanceof Map, `${key} must be a Map`);
  }

  // Verify population
  assert.deepStrictEqual(inverse.origin_inverse.get("meta-finding-1"), ["rule-xxx"]);
  // promoted_to_rule_inverse is populated from BOTH the finding.promoted_to_rule
  // side AND the rule.origin side (dual-field unification during migration).
  const ptrIds = inverse.promoted_to_rule_inverse.get("rule-xxx");
  assert.ok(ptrIds.includes("meta-finding-1"), "promoted_to_rule_inverse must include meta-finding-1");
  assert.equal(ptrIds.length, 2, "dual-field unification populates from both sides");
  assert.deepStrictEqual(inverse.addresses_inverse.get("meta-finding-1"), ["loop-design-yyy"]);
  assert.deepStrictEqual(inverse.supersedes_inverse.get("meta-change-0"), ["meta-change-1"]);
  // reopens_inverse: keys on the EXPIRED PARENT, values are REOPEN CHILDREN
  assert.deepStrictEqual(inverse.reopens_inverse.get("meta-finding-1"), ["meta-finding-2"]);
});

test("buildInverseIndexes on live registry returns 5 expected keys", async () => {
  const entries = readRegistry(root);
  const result = buildInverseIndexes(entries);

  // Structural assertion: the 5 keys exist regardless of registry size.
  // The LRU cache ensures readRegistry is fast enough that this test
  // runs in <100ms; the structural assertion locks the contract across
  // refactors that change the registry size.
  assert.ok(result.addresses_inverse instanceof Map, "addresses_inverse must be a Map");
  assert.ok(result.supersedes_inverse instanceof Map, "supersedes_inverse must be a Map");
  assert.ok(result.origin_inverse instanceof Map, "origin_inverse must be a Map");
  assert.ok(result.promoted_to_rule_inverse instanceof Map, "promoted_to_rule_inverse must be a Map");
  assert.ok(result.reopens_inverse instanceof Map, "reopens_inverse must be a Map");

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
  const { loopDescribeTool } = await import("../tools/loop-describe-tool.js");
  const coldResult = await loopDescribeTool.handler({ tier: "cold" });
  const cold = JSON.parse(coldResult.content[0].text);
  assert.ok(cold.inverse_indexes, "cold tier should have inverse_indexes");
  assert.ok(cold.inverse_indexes.addresses_inverse, "should have addresses_inverse");
  assert.ok(cold.inverse_indexes.supersedes_inverse, "should have supersedes_inverse");
  assert.ok(cold.inverse_indexes.origin_inverse, "should have origin_inverse");
  assert.ok(cold.inverse_indexes.promoted_to_rule_inverse, "should have promoted_to_rule_inverse");
  assert.ok(cold.inverse_indexes.reopens_inverse, "should have reopens_inverse");
});

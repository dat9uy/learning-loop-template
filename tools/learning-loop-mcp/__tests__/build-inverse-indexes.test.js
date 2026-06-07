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

test("buildInverseIndexes on real registry", async () => {
  const entries = readRegistry(root);
  const result = buildInverseIndexes(entries);

  // origin_inverse: the rule "rule-short-slug-for-risk-records" originated from finding
  const origin = result.origin_inverse.get("meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug");
  assert.ok(origin, "origin_inverse should have entry for slug sanitization finding");
  assert.ok(origin.includes("rule-short-slug-for-risk-records"), "origin should include the rule");

  // promoted_to_rule_inverse: the finding promoted_to_rule points to the rule
  const promoted = result.promoted_to_rule_inverse.get("rule-short-slug-for-risk-records");
  assert.ok(promoted, "promoted_to_rule_inverse should have entry for rule-short-slug-for-risk-records");
  assert.ok(
    promoted.includes("meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug"),
    "promoted should include the originating finding"
  );

  // addresses_inverse: loop-designs with addresses
  const loopDesigns = entries.filter((e) => e.entry_kind === "loop-design");
  for (const design of loopDesigns) {
    if (design.addresses && design.addresses.length > 0) {
      for (const findingId of design.addresses) {
        const inv = result.addresses_inverse.get(findingId);
        assert.ok(inv, `addresses_inverse should have entry for ${findingId}`);
        assert.ok(inv.includes(design.id), `addresses_inverse[${findingId}] should include ${design.id}`);
      }
    }
  }

  // supersedes_inverse: change-log entries with supersedes
  const changeLogs = entries.filter((e) => e.entry_kind === "change-log" && e.supersedes);
  for (const cl of changeLogs) {
    const inv = result.supersedes_inverse.get(cl.supersedes);
    assert.ok(inv, `supersedes_inverse should have entry for ${cl.supersedes}`);
    assert.ok(inv.includes(cl.id), `supersedes_inverse[${cl.supersedes}] should include ${cl.id}`);
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
});

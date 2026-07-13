import { describe, test } from "vitest";
import assert from "node:assert";
import { evaluateTriggers, WORKFLOW_REGISTRY } from "./workflow-registry.js";

describe("workflow-registry", () => {
  test("matches evidence file changes", () => {
    const result = evaluateTriggers("records/product/evidence/foo.md", "updated");
    assert.deepStrictEqual(result.matched, ["evidence-changed"]);
    assert.ok(result.recommendations.includes("index_extract"));
    assert.ok(result.recommendations.includes("index_validate"));
  });

  test("does not match observation file changes (removed)", () => {
    const result = evaluateTriggers("records/observations/obs-001.yaml", "created");
    assert.deepStrictEqual(result.matched, []);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("matches capability file changes", () => {
    const result = evaluateTriggers("records/meta/capabilities/api.yaml", "updated");
    assert.deepStrictEqual(result.matched, ["capability-changed"]);
    assert.ok(result.recommendations.includes("index_validate"));
    assert.ok(result.recommendations.includes("capability_generate"));
  });

  test("matches index file changes", () => {
    const result = evaluateTriggers("records/product/index/decisions.yaml", "created");
    assert.deepStrictEqual(result.matched, ["index-changed"]);
    assert.deepStrictEqual(result.recommendations, ["index_validate"]);
  });

  test("returns empty for unrelated paths", () => {
    const result = evaluateTriggers("docs/journals/foo.md", "updated");
    assert.deepStrictEqual(result.matched, []);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("returns empty for deleted files on non-deleted triggers", () => {
    const result = evaluateTriggers("records/product/evidence/foo.md", "deleted");
    assert.deepStrictEqual(result.matched, []);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("deduplicates recommendations when multiple workflows match", () => {
    // Verify dedup logic directly:
    const result = evaluateTriggers("records/product/evidence/foo.md", "created");
    const unique = [...new Set(result.recommendations)];
    assert.strictEqual(result.recommendations.length, unique.length);
  });

  test("normalizes leading ./ in path", () => {
    const withDot = evaluateTriggers("./records/product/evidence/foo.md", "updated");
    const withoutDot = evaluateTriggers("records/product/evidence/foo.md", "updated");
    assert.deepStrictEqual(withDot.matched, withoutDot.matched);
    assert.deepStrictEqual(withDot.recommendations, withoutDot.recommendations);
  });

  test("WORKFLOW_REGISTRY has 3 workflows (observation-changed removed)", () => {
    assert.ok(WORKFLOW_REGISTRY["evidence-changed"]);
    assert.ok(!WORKFLOW_REGISTRY["observation-changed"]);
    assert.ok(WORKFLOW_REGISTRY["capability-changed"]);
    assert.ok(WORKFLOW_REGISTRY["index-changed"]);
  });

  test("each workflow has triggers, change_types, and recommended_tools", () => {
    for (const [name, def] of Object.entries(WORKFLOW_REGISTRY)) {
      assert.ok(Array.isArray(def.triggers), `${name}: triggers should be array`);
      assert.ok(Array.isArray(def.change_types), `${name}: change_types should be array`);
      assert.ok(Array.isArray(def.recommended_tools), `${name}: recommended_tools should be array`);
      assert.ok(def.recommended_tools.length > 0, `${name}: should have at least one recommended tool`);
    }
  });
});

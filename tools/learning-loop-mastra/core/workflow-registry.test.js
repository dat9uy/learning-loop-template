import { describe, test } from "vitest";
import assert from "node:assert";
import { evaluateTriggers, WORKFLOW_REGISTRY } from "./workflow-registry.js";

// Phase 5 of plans/260722-2147: `recommended_tools` is vacated pending a
// real index/capability subsystem (the previous values — index_extract,
// index_validate, capability_generate — referenced tools deleted in plan
// 260612-1700-meta-surface-re-debate or never shipped). The tests assert
// the empty-recommendations contract so future re-population is a
// deliberate registry edit, not a silent drift.

describe("workflow-registry", () => {
  test("matches evidence file changes (recommendations are vacated)", () => {
    const result = evaluateTriggers("records/product/evidence/foo.md", "updated");
    assert.deepStrictEqual(result.matched, ["evidence-changed"]);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("does not match observation file changes (removed)", () => {
    const result = evaluateTriggers("records/observations/obs-001.yaml", "created");
    assert.deepStrictEqual(result.matched, []);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("matches capability file changes (recommendations are vacated)", () => {
    const result = evaluateTriggers("records/meta/capabilities/api.yaml", "updated");
    assert.deepStrictEqual(result.matched, ["capability-changed"]);
    assert.deepStrictEqual(result.recommendations, []);
  });

  test("matches index file changes (recommendations are vacated)", () => {
    const result = evaluateTriggers("records/product/index/decisions.yaml", "created");
    assert.deepStrictEqual(result.matched, ["index-changed"]);
    assert.deepStrictEqual(result.recommendations, []);
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

  test("each workflow declares triggers, change_types, and recommended_tools (vacated to [])", () => {
    for (const [name, def] of Object.entries(WORKFLOW_REGISTRY)) {
      assert.ok(Array.isArray(def.triggers), `${name}: triggers should be array`);
      assert.ok(Array.isArray(def.change_types), `${name}: change_types should be array`);
      // Field is REQUIRED but may be empty. Removing the field entirely
      // would crash the handlers' `def.recommended_tools.join(...)`.
      assert.ok(
        Array.isArray(def.recommended_tools),
        `${name}: recommended_tools should be array (field may be empty, NOT missing)`,
      );
      assert.deepStrictEqual(
        def.recommended_tools,
        [],
        `${name}: recommended_tools is currently vacated pending an index/capability subsystem; repopulate via a deliberate registry edit`,
      );
    }
  });
});

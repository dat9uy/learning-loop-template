import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTemplate, applyTemplate, listDimensions } from "#mcp/core/candidate-to-experiment/template-registry.js";
import { buildExperimentDraft } from "#mcp/core/candidate-to-experiment/experiment-draft-builder.js";

function createCandidateFile(root, assertionId, status, dimension) {
  const content = `id: ${assertionId}
schema_version: "1.0"
type: extracted-assertion
status: ${status}
assertion: "Test assertion"
capability: test-cap
dimension: ${dimension}
scope: sandbox
topic_tag: test-topic
n_count: 1
superseded_by: null
supersedes: []
source_refs: []
experiment_refs: []
extraction:
  agent_run: "test"
  first_extracted_at: "2026-06-01T00:00:00Z"
  last_updated_at: "2026-06-01T00:00:00Z"
  evidence_immutable_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
`;
  const dir = join(root, "records", "vnstock", "index");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${assertionId}.yaml`), content);
}

describe("template-registry", () => {
  test("listDimensions returns all 4 dimensions", () => {
    const dims = listDimensions();
    assert.deepStrictEqual(dims.sort(), ["install", "product", "runtime", "static"]);
  });

  test("getTemplate returns a function for known dimensions", () => {
    for (const dim of listDimensions()) {
      const tmpl = getTemplate(dim);
      assert.ok(typeof tmpl === "function", `dimension ${dim} should have a template function`);
    }
  });

  test("getTemplate returns null for unknown dimension", () => {
    assert.strictEqual(getTemplate("unknown"), null);
    assert.strictEqual(getTemplate(""), null);
  });

  test("applyTemplate returns null for unknown dimension", () => {
    const result = applyTemplate({ dimension: "unknown" });
    assert.strictEqual(result, null);
  });

  test("install template substitutes fields", () => {
    const candidate = {
      assertion: "vnstock_data installs successfully",
      capability: "vnstock-data",
      dimension: "install",
      topic_tag: "fresh-install",
      scope: "sandbox",
    };
    const result = applyTemplate(candidate);
    assert.ok(result.goal.includes("vnstock_data installs successfully"));
    assert.ok(result.hypothesis.includes("exit 0"));
    assert.strictEqual(result.scope, "install");
    assert.strictEqual(result.output_level, "metadata-only");
    assert.ok(result.method.length >= 4);
    assert.ok(result.success_metrics.length >= 4);
  });

  test("runtime template substitutes fields", () => {
    const candidate = {
      assertion: "vnstock_data returns valid data",
      capability: "vnstock-data",
      dimension: "runtime",
      topic_tag: "api-data",
      scope: "sandbox",
    };
    const result = applyTemplate(candidate);
    assert.ok(result.goal.includes("returns expected shape"));
    assert.strictEqual(result.scope, "runtime");
    assert.strictEqual(result.output_level, "runtime-captured");
  });

  test("static template substitutes fields", () => {
    const candidate = {
      assertion: "vnstock_data API is documented",
      capability: "vnstock-data",
      dimension: "static",
      topic_tag: "api-docs",
      scope: "sandbox",
    };
    const result = applyTemplate(candidate);
    assert.ok(result.goal.includes("documented and consistent"));
    assert.strictEqual(result.scope, "schema-improvement");
    assert.strictEqual(result.output_level, "docs-only");
  });

  test("product template substitutes fields", () => {
    const candidate = {
      assertion: "vnstock_data is safe for product",
      capability: "vnstock-data",
      dimension: "product",
      topic_tag: "product-safe",
      scope: "production",
    };
    const result = applyTemplate(candidate);
    assert.ok(result.goal.includes("safe for product consumption"));
    assert.strictEqual(result.scope, "product");
    assert.strictEqual(result.output_level, "metadata-only");
  });
});

describe("experiment-draft-builder", () => {
  test("buildExperimentDraft returns error for missing candidate", () => {
    const result = buildExperimentDraft({
      root: "/tmp/nonexistent",
      surface: "vnstock",
      assertionId: "assertion-missing",
    });
    assert.strictEqual(result.error, true);
    assert.ok(result.message.includes("not found"));
  });

  test("buildExperimentDraft returns error for non-candidate status", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bridge2-unit-test-"));
    createCandidateFile(tempDir, "assertion-active", "active", "install");
    const result = buildExperimentDraft({
      root: tempDir,
      surface: "vnstock",
      assertionId: "assertion-active",
    });
    assert.strictEqual(result.error, true);
    assert.ok(result.message.includes("not a candidate"));
  });

  test("buildExperimentDraft returns draft for valid candidate", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bridge2-unit-test-"));
    createCandidateFile(tempDir, "assertion-valid", "candidate", "install");
    const result = buildExperimentDraft({
      root: tempDir,
      surface: "vnstock",
      assertionId: "assertion-valid",
    });
    assert.strictEqual(result.error, undefined);
    assert.ok(result.draft);
    assert.strictEqual(result.template_used, "install");
    assert.strictEqual(result.overrides_applied, false);
    assert.deepStrictEqual(result.draft.source_refs, ["record:assertion-valid"]);
    assert.deepStrictEqual(result.draft.assertion_refs, ["record:assertion-valid"]);
    assert.deepStrictEqual(result.draft.verification.assertion_refs, ["record:assertion-valid"]);
    assert.strictEqual(result.draft.verification.requires_human_approval, true);
  });

  test("buildExperimentDraft applies overrides", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bridge2-unit-test-"));
    createCandidateFile(tempDir, "assertion-override", "candidate", "runtime");
    const result = buildExperimentDraft({
      root: tempDir,
      surface: "vnstock",
      assertionId: "assertion-override",
      overrides: { goal: "Custom goal", hypothesis: "Custom hypothesis" },
    });
    assert.strictEqual(result.draft.goal, "Custom goal");
    assert.strictEqual(result.draft.hypothesis, "Custom hypothesis");
    assert.strictEqual(result.overrides_applied, true);
  });
});

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workflowCandidateToExperimentTool } from "./workflow-candidate-to-experiment-tool.js";

const { handler } = workflowCandidateToExperimentTool;

describe("workflow_candidate_to_experiment", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  function setupTemp() {
    tempDir = mkdtempSync(join(tmpdir(), "candidate-to-experiment-test-"));
    process.env.GATE_ROOT = tempDir;

    // Create the directory structure for a candidate assertion
    mkdirSync(join(tempDir, "records", "vnstock", "index"), { recursive: true });
    mkdirSync(join(tempDir, "records", "vnstock", "experiments"), { recursive: true });
  }

  function createCandidateFile(assertionId, status, dimension, assertion) {
    const content = `id: ${assertionId}
schema_version: "1.0"
type: extracted-assertion
status: ${status}
assertion: ${assertion}
capability: vnstock-data
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
    const path = join(tempDir, "records", "vnstock", "index", `${assertionId}.yaml`);
    writeFileSync(path, content);
  }

  function cleanup() {
    process.env.GATE_ROOT = originalEnv;
  }

  test("returns draft for auto_create=false", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-install-test-topic",
      "candidate",
      "install",
      "vnstock_data installs successfully in a fresh container"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-install-test-topic",
      surface: "vnstock",
      auto_create: false,
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.created, false);
    assert.strictEqual(parsed.template_used, "install");
    assert.strictEqual(parsed.overrides_applied, false);
    assert.ok(parsed.experiment_draft.goal.includes("vnstock_data installs successfully"));
    assert.deepStrictEqual(parsed.experiment_draft.assertion_refs, [
      "record:assertion-vnstock-data-install-test-topic",
    ]);
    assert.strictEqual(parsed.experiment_draft.verification.requires_human_approval, true);
    cleanup();
  });

  test("returns error for non-candidate assertion", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-runtime-active-thing",
      "active",
      "runtime",
      "vnstock_data returns data"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-runtime-active-thing",
      surface: "vnstock",
      auto_create: false,
    });

    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, true);
    assert.ok(parsed.message.includes("not a candidate"));
    cleanup();
  });

  test("returns error for missing candidate", async () => {
    setupTemp();

    const result = await handler({
      assertion_id: "assertion-vnstock-data-install-missing",
      surface: "vnstock",
      auto_create: false,
    });

    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, true);
    assert.ok(parsed.message.includes("not found"));
    cleanup();
  });

  test("returns error for unsupported dimension", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-unknown-thing",
      "candidate",
      "unknown-dimension",
      "something unsupported"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-unknown-thing",
      surface: "vnstock",
      auto_create: false,
    });

    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, true);
    assert.ok(parsed.message.includes("No template available"));
    cleanup();
  });

  test("applies template overrides", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-runtime-override",
      "candidate",
      "runtime",
      "vnstock_data returns macro data"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-runtime-override",
      surface: "vnstock",
      auto_create: false,
      template_override: {
        goal: "Custom override goal",
        success_metrics: ["custom-metric-a", "custom-metric-b"],
      },
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.overrides_applied, true);
    assert.strictEqual(parsed.experiment_draft.goal, "Custom override goal");
    assert.deepStrictEqual(parsed.experiment_draft.success_metrics, [
      "custom-metric-a",
      "custom-metric-b",
    ]);
    cleanup();
  });

  test("creates experiment for auto_create=true", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-product-test",
      "candidate",
      "product",
      "vnstock_data is safe for product"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-product-test",
      surface: "vnstock",
      auto_create: true,
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.created, true);
    assert.ok(parsed.id);
    assert.ok(parsed.path);
    assert.strictEqual(parsed.template_used, "product");
    cleanup();
  });

  test("uses runtime template for runtime dimension", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-runtime-test",
      "candidate",
      "runtime",
      "vnstock_data returns valid data"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-runtime-test",
      surface: "vnstock",
      auto_create: false,
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.template_used, "runtime");
    assert.ok(parsed.experiment_draft.goal.includes("returns expected shape"));
    assert.deepStrictEqual(parsed.experiment_draft.verification.proves, [
      { dimension: "runtime", scope: "sandbox", output_level: "runtime-captured" },
    ]);
    cleanup();
  });

  test("uses static template for static dimension", async () => {
    setupTemp();
    createCandidateFile(
      "assertion-vnstock-data-static-test",
      "candidate",
      "static",
      "vnstock_data API is documented"
    );

    const result = await handler({
      assertion_id: "assertion-vnstock-data-static-test",
      surface: "vnstock",
      auto_create: false,
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.template_used, "static");
    assert.ok(parsed.experiment_draft.goal.includes("documented and consistent"));
    assert.strictEqual(parsed.experiment_draft.scope, "schema-improvement");
    cleanup();
  });
});

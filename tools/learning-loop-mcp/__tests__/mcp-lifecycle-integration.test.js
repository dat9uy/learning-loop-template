import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { createDecision } from "#mcp/core/decision-writer.js";
import { updateDecision } from "#mcp/core/decision-writer.js";
import { createExperiment } from "#mcp/core/experiment-writer.js";
import { updateExperiment } from "#mcp/core/experiment-writer.js";
import { recordDeleteTool } from "../tools/delete-record-tool.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";
import { loadRecords } from "../../validate-records/record-loader.js";
import { loadSchemas } from "../../validate-records/schema-loader.js";
import { validateRecords } from "../../validate-records/record-validation-rules.js";
import { stringify as stringifyYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REAL_ROOT = join(__dirname, "..", "..", "..");

function setupTempProject() {
  const tempDir = mkdtempSync(join(tmpdir(), "loop-test-"));
  mkdirSync(join(tempDir, "records", "meta", "decisions"), { recursive: true });
  mkdirSync(join(tempDir, "records", "meta", "experiments"), { recursive: true });
  mkdirSync(join(tempDir, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempDir, "records", "meta", "claims"), { recursive: true });
  writeFileSync(join(tempDir, "records", "meta", "evidence", "test.md"), "# Test");
  // Create a dummy claim record for experiment validation
  writeFileSync(join(tempDir, "records", "meta", "claims", "claim-meta-test.yaml"), stringifyYaml({
    id: "claim-meta-test",
    schema_version: "1.0",
    type: "claim",
    status: "draft",
    created_at: "2026-05-23T12:00:00Z",
    updated_at: "2026-05-23T12:00:00Z",
    source_refs: [],
    subject: "Test claim",
    claim: "Test",
    scope: "sandbox",
    evidence_refs: [],
    confidence: "medium",
    limitations: [],
    approval: { status: "draft", reviewer: "", reviewed_at: "2026-05-23T12:00:00Z" },
    verification: {
      static: { status: "claimed", proof_refs: [] },
      install: { status: "claimed", scope: "sandbox", proof_refs: [] },
      runtime: { status: "claimed", scope: "sandbox", output: "metadata-only", proof_refs: [] },
      product: { status: "claimed", decision_refs: [] },
    },
  }));
  // Copy schemas into temp dir for validation
  cpSync(join(REAL_ROOT, "schemas"), join(tempDir, "schemas"), { recursive: true });
  return tempDir;
}

describe("MCP lifecycle integration", () => {
  test("full decision lifecycle: create → update source_refs → validate → delete", async () => {
    const tempDir = setupTempProject();
    process.env.GATE_ROOT = tempDir;

    try {
      // 1. Create decision
      const createResult = createDecision({
        root: tempDir,
        surface: "meta",
        question: "Test decision?",
        decision: "Yes",
        rationale: "Test rationale",
      });
      assert.strictEqual(createResult.created, true);
      assert.ok(createResult.id);

      // 2. Validate
      const records = loadRecords(tempDir);
      const schemas = loadSchemas(tempDir);
      const errors = validateRecords(records, schemas, tempDir);
      assert.strictEqual(errors.length, 0, `Validation errors: ${errors.join(", ")}`);

      // 3. Update source_refs (append-only)
      const updateResult = updateDecision({
        root: tempDir,
        surface: "meta",
        decision_id: createResult.id,
        updates: {
          source_refs: ["local:records/meta/evidence/test.md"],
        },
      });
      assert.strictEqual(updateResult.updated, true);

      // 4. Validate again
      const records2 = loadRecords(tempDir);
      const errors2 = validateRecords(records2, schemas, tempDir);
      assert.strictEqual(errors2.length, 0, `Post-update validation errors: ${errors2.join(", ")}`);

      // 5. Delete
      const deleteResult = await recordDeleteTool.handler({
        surface: "meta",
        record_id: createResult.id,
        record_type: "decision",
        reason: "Test cleanup of draft decision",
        operator_confirmation: true,
      });
      const deleteParsed = JSON.parse(deleteResult.content[0].text);
      assert.strictEqual(deleteParsed.deleted, true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("experiment lifecycle with verification update", () => {
    const tempDir = setupTempProject();
    process.env.GATE_ROOT = tempDir;

    try {
      // 1. Create experiment
      const createResult = createExperiment({
        root: tempDir,
        surface: "meta",
        goal: "Test experiment goal",
        hypothesis: "Test hypothesis",
        method: ["step1", "step2"],
        success_metrics: ["metric1"],
        claim_refs: ["record:claim-meta-test"],
      });
      assert.strictEqual(createResult.created, true);

      // 2. Update verification block
      const updateResult = updateExperiment({
        root: tempDir,
        surface: "meta",
        experiment_id: createResult.id,
        updates: {
          verification: {
            claim_refs: ["record:claim-meta-test"],
            proves: [{ dimension: "static", output_level: "metadata-only" }],
            requires_human_approval: true,
            approval_status: "approved",
          },
        },
      });
      assert.strictEqual(updateResult.updated, true);

      // 3. Validate
      const records = loadRecords(tempDir);
      const schemas = loadSchemas(tempDir);
      const errors = validateRecords(records, schemas, tempDir);
      assert.strictEqual(errors.length, 0, `Validation errors: ${errors.join(", ")}`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("source ref validation rejects invalid refs at creation", () => {
    const tempDir = setupTempProject();
    process.env.GATE_ROOT = tempDir;

    try {
      const validation = validateSourceRefs(
        ["local:product/api/src/main.py"],
        "decision",
        tempDir
      );
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.length > 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("source ref validation accepts valid refs", () => {
    const tempDir = setupTempProject();
    process.env.GATE_ROOT = tempDir;

    try {
      const validation = validateSourceRefs(
        ["local:records/meta/evidence/test.md"],
        "decision",
        tempDir
      );
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

import { describe, test } from "node:test";
import assert from "node:assert";
import { recordDeleteTool } from "./delete-record-tool.js";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";

function createTempRecord(tempDir, surface, type, id, status) {
  const dir = join(tempDir, "records", surface, `${type}s`);
  mkdirSync(dir, { recursive: true });
  const record = {
    id,
    schema_version: "1.0",
    type,
    status,
    created_at: "2026-05-23T12:00:00Z",
    updated_at: "2026-05-23T12:00:00Z",
    source_refs: [],
  };
  if (type === "decision") {
    record.question = "Test?";
    record.decision = "Yes";
    record.rationale = "";
    record.alternatives = [];
    record.tradeoffs = [];
    record.supersedes = [];
  } else if (type === "experiment") {
    record.goal = "Test goal";
    record.hypothesis = "";
    record.method = [];
    record.success_metrics = [];
    record.result = "";
    record.agent_outcome = "";
    record.product_outcome = "";
    record.observations = [];
    record.promotion_review = [];
    record.verification = { claim_refs: [], proves: [], requires_human_approval: true, approval_status: "not-required" };
  } else if (type === "risk") {
    record.risk_statement = "Test risk";
    record.category = "other";
    record.severity = "medium";
    record.likelihood = "medium";
    record.confidence = "medium";
  }
  const filename = `${id}.yaml`;
  writeFileSync(join(dir, filename), stringifyYaml(record));
  return join(dir, filename);
}

describe("record_delete tool", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test.beforeEach = () => {};
  test.afterEach = () => {};

  test("deletes draft decision record", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    const recordPath = createTempRecord(tempDir, "meta", "decision", "decision-meta-260524T0000Z-test", "draft");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "decision-meta-260524T0000Z-test",
      record_type: "decision",
      reason: "Test cleanup of draft record",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, true);
    assert.strictEqual(existsSync(recordPath), false);
    assert.ok(text.audit_path.includes(".deleted"));
    process.env.GATE_ROOT = originalEnv;
  });

  test("blocks deletion of approved records", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    createTempRecord(tempDir, "meta", "decision", "decision-meta-260524T0000Z-approved", "approved");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "decision-meta-260524T0000Z-approved",
      record_type: "decision",
      reason: "Test cleanup of approved record",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, false);
    assert.strictEqual(text.reason, "status_not_deletable");
    process.env.GATE_ROOT = originalEnv;
  });

  test("blocks deletion without operator_confirmation", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    createTempRecord(tempDir, "meta", "decision", "decision-meta-260524T0000Z-test", "draft");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "decision-meta-260524T0000Z-test",
      record_type: "decision",
      reason: "Test cleanup",
      operator_confirmation: false,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, false);
    assert.strictEqual(text.reason, "operator_confirmation_required");
    process.env.GATE_ROOT = originalEnv;
  });

  test("blocks deletion with short reason", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    createTempRecord(tempDir, "meta", "decision", "decision-meta-260524T0000Z-test", "draft");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "decision-meta-260524T0000Z-test",
      record_type: "decision",
      reason: "Short",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, false);
    assert.strictEqual(text.reason, "reason_too_short");
    process.env.GATE_ROOT = originalEnv;
  });

  test("soft-deleted record exists in .deleted/ audit dir", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    createTempRecord(tempDir, "meta", "experiment", "experiment-meta-260524T0000Z-test", "draft");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "experiment-meta-260524T0000Z-test",
      record_type: "experiment",
      reason: "Test cleanup of draft experiment",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, true);
    assert.ok(existsSync(text.audit_path));
    process.env.GATE_ROOT = originalEnv;
  });

  test("blocks deletion of not-found record", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "decision-meta-260524T0000Z-missing",
      record_type: "decision",
      reason: "Test cleanup of missing record",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, false);
    assert.strictEqual(text.reason, "not_found");
    process.env.GATE_ROOT = originalEnv;
  });

  test("hard-deletes evidence file", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    const dir = join(tempDir, "records", "meta", "evidence");
    mkdirSync(dir, { recursive: true });
    const evidencePath = join(dir, "test-evidence.md");
    writeFileSync(evidencePath, "# Test evidence");

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "test-evidence",
      record_type: "evidence",
      reason: "Test cleanup of evidence file",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, true);
    assert.strictEqual(existsSync(evidencePath), false);
    assert.strictEqual(text.audit_path, undefined);
    process.env.GATE_ROOT = originalEnv;
  });

  test("hard-deletes claim file", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;
    const dir = join(tempDir, "records", "meta", "claims");
    mkdirSync(dir, { recursive: true });
    const record = {
      id: "claim-meta-test",
      schema_version: "1.0",
      type: "claim",
      status: "draft",
      created_at: "2026-05-23T12:00:00Z",
      updated_at: "2026-05-23T12:00:00Z",
      source_refs: [],
      subject: "Test",
      claim: "Test claim",
      scope: "test",
      evidence_refs: [],
      confidence: "low",
      limitations: [],
      approval: { status: "draft", reviewer: "", reviewed_at: "" },
      verification: {},
    };
    const claimPath = join(dir, "claim-meta-test.yaml");
    writeFileSync(claimPath, stringifyYaml(record));

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "claim-meta-test",
      record_type: "claim",
      reason: "Test cleanup of claim record",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, true);
    assert.strictEqual(existsSync(claimPath), false);
    assert.strictEqual(text.audit_path, undefined);
    process.env.GATE_ROOT = originalEnv;
  });

  test("blocks deletion of not-found evidence file", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "del-test-"));
    process.env.GATE_ROOT = tempDir;

    const result = await recordDeleteTool.handler({
      surface: "meta",
      record_id: "missing-evidence",
      record_type: "evidence",
      reason: "Test cleanup of missing evidence",
      operator_confirmation: true,
    });

    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.deleted, false);
    assert.strictEqual(text.reason, "not_found");
    process.env.GATE_ROOT = originalEnv;
  });
});

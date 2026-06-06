import { describe, test } from "node:test";
import assert from "node:assert";
import { validateRecords } from "./record-validation-rules.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function buildDecisionRecord(sourceRefs) {
  return {
    id: "decision-test-001",
    type: "decision",
    schema_version: "1.0",
    status: "draft",
    question: "Test?",
    decision: "Yes",
    rationale: "Because test.",
    source_refs: sourceRefs,
    __file: "records/test/decisions/decision-test-001.yaml",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function writeMetaStateEntry(root, entry) {
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(entry) + "\n", "utf8");
}

describe("validateRecords local:meta-state:<id> branch", () => {
  test("accepts local:meta-state:<id> when entry exists", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rvr-test-"));
    const entryId = "meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internaliz";
    writeMetaStateEntry(tempDir, {
      id: entryId,
      entry_kind: "finding",
      status: "active",
      created_at: "2026-06-01T13:39:00Z",
    });

    const schemas = {
      decision: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { const: "decision" },
          schema_version: { type: "string" },
          status: { type: "string" },
          question: { type: "string" },
          decision: { type: "string" },
          rationale: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "schema_version", "status", "question", "decision", "rationale"],
      },
    };

    const record = buildDecisionRecord([`local:meta-state:${entryId}`]);
    const errors = validateRecords([record], schemas, tempDir);
    assert.deepStrictEqual(errors, []);
  });

  test("rejects local:meta-state:<id> when entry not found", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rvr-test-"));
    writeMetaStateEntry(tempDir, {
      id: "meta-260601T1339Z-existing-entry",
      entry_kind: "finding",
      status: "active",
      created_at: "2026-06-01T13:39:00Z",
    });

    const schemas = {
      decision: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { const: "decision" },
          schema_version: { type: "string" },
          status: { type: "string" },
          question: { type: "string" },
          decision: { type: "string" },
          rationale: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "schema_version", "status", "question", "decision", "rationale"],
      },
    };

    const record = buildDecisionRecord(["local:meta-state:meta-260601T1339Z-missing-entry"]);
    const errors = validateRecords([record], schemas, tempDir);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("not found in registry"));
  });

  test("rejects local:meta-state: with path traversal", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rvr-test-"));

    const schemas = {
      decision: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { const: "decision" },
          schema_version: { type: "string" },
          status: { type: "string" },
          question: { type: "string" },
          decision: { type: "string" },
          rationale: { type: "string" },
          source_refs: { type: "array", items: { type: "string" } },
        },
        required: ["id", "type", "schema_version", "status", "question", "decision", "rationale"],
      },
    };

    const record = buildDecisionRecord(["local:meta-state:meta-../../etc/passwd"]);
    const errors = validateRecords([record], schemas, tempDir);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("path-traversal"));
  });
});

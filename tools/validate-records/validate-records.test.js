import assert from "node:assert";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchemas } from "./schema-loader.js";
import { loadRecords } from "./record-loader.js";
import { validateRecords } from "./record-validation-rules.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("schema-loader", () => {
  it("loads extracted-assertion schema without error", () => {
    const schemas = loadSchemas(root);
    assert.ok(schemas["extracted-assertion"], "extracted-assertion schema should be loaded");
    assert.ok(schemas.claim, "claim schema should still be loaded");
  });
});

describe("record-loader", () => {
  it("discovers records/index/ directory", () => {
    const records = loadRecords(root);
    const indexRecords = records.filter((r) => r.type === "extracted-assertion");
    assert.ok(indexRecords.length >= 5, `expected at least 5 index records, got: ${indexRecords.length}`);
  });
});

describe("validateRecords", () => {
  it("validates a minimal extracted-assertion fixture with zero errors", () => {
    const schemas = loadSchemas(root);
    const fixture = {
      __file: "records/index/assertion-test-capability-runtime-test-topic.yaml",
      id: "assertion-test-capability-runtime-test-topic",
      schema_version: "1.0",
      type: "extracted-assertion",
      status: "active",
      assertion: "Test assertion for validation.",
      capability: "test-capability",
      dimension: "runtime",
      scope: "sandbox",
      topic_tag: "test-topic",
      n_count: 1,
      superseded_by: null,
      supersedes: [],
      source_refs: [],
      experiment_refs: [],
      extraction: {
        agent_run: "test-run",
        first_extracted_at: "2026-05-19T14:00:00Z",
        last_updated_at: "2026-05-19T14:00:00Z",
        evidence_immutable_hash: "sha256:abc123",
      },
    };
    const errors = validateRecords([fixture], schemas, root);
    assert.deepStrictEqual(errors, [], `expected zero errors, got: ${errors.join(", ")}`);
  });
});

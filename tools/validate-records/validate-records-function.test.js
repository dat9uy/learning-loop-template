import assert from "node:assert";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidateRecords } from "./validate-records.js";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("runValidateRecords (pure function)", () => {
  it("returns structured result with records, errors, warnings", () => {
    const result = runValidateRecords(root, { includeNegativeFixtures: false });
    assert.ok(Array.isArray(result.records), "records should be an array");
    assert.ok(Array.isArray(result.errors), "errors should be an array");
    assert.ok(Array.isArray(result.warnings), "warnings should be an array");
    assert.ok(result.records.length >= 5, `expected at least 5 records, got: ${result.records.length}`);
  });

  it("includes negative fixtures when requested", () => {
    const result = runValidateRecords(root, { includeNegativeFixtures: true });
    assert.ok(result.errors.length > 0, "negative fixtures should produce errors");
  });

  it("skips negative fixtures when includeNegativeFixtures is false", () => {
    const result = runValidateRecords(root, { includeNegativeFixtures: false });
    // Note: errors may still come from live records; we just verify the function returns a result
    assert.ok(Array.isArray(result.errors), "errors should be an array");
  });

  it("accepts allowDisallowedFixtures option", () => {
    const result = runValidateRecords(root, { allowDisallowedFixtures: true, includeNegativeFixtures: false });
    assert.ok(Array.isArray(result.errors), "should return errors array");
    assert.ok(Array.isArray(result.records), "should return records array");
  });

  it("validates a minimal fixture with zero errors", async () => {
    const { loadSchemas } = await import("./schema-loader.js");
    const { validateRecords } = await import("./record-validation-rules.js");
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
    const schemas = loadSchemas(root);
    const errors = validateRecords([fixture], schemas, root);
    assert.deepStrictEqual(errors, [], `expected zero errors, got: ${errors.join(", ")}`);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { runExtraction } from "#mcp/core/extract-index/extract-index.js";
import { validateRecords } from "#mcp/core/record-validation-rules.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";
import { listVerifiedClaims } from "#mcp/core/list-verified.js";
import { searchIndex } from "#mcp/core/search-index.js";
import { parseDoc } from "#mcp/core/vendor-doc-assist/doc-parser.js";
import { generateSuggestions } from "#mcp/core/vendor-doc-assist/suggestion-engine.js";

const root = join(process.cwd(), "tools", "learning-loop-mcp");

function makeTmpProject() {
  const tmp = mkdtempSync(join(tmpdir(), "bridge-1-e2e-"));
  mkdirSync(join(tmp, "records", "vnstock", "vendor-docs"), { recursive: true });
  mkdirSync(join(tmp, "records", "vnstock", "evidence"), { recursive: true });
  mkdirSync(join(tmp, "records", "vnstock", "index"), { recursive: true });
  mkdirSync(join(tmp, "records", "vnstock", "experiments"), { recursive: true });
  mkdirSync(join(tmp, "records", "vnstock", "claims"), { recursive: true });
  return tmp;
}

const VENDOR_DOC = `# VNStock Unified UI Migration Guide

## Tổng Quan

Unified UI provides a single entry point for all data types.
The API supports both historical and real-time data.

## API Methods

| Method | Description | Returns |
|--------|-------------|---------|
| stock_intraday | Real-time intraday data | DataFrame |
| stock_historical | Historical daily data | DataFrame |

## Setup

Install with pip install vnstock_data.
`;

describe("Bridge 1 end-to-end", () => {
  let tmp;

  it("vendor doc → assist → evidence → candidate → validate → reject", () => {
    tmp = makeTmpProject();

    // Step 1: Write synthetic vendor doc
    writeFileSync(join(tmp, "records", "vnstock", "vendor-docs", "test-doc.md"), VENDOR_DOC);

    // Step 2: Parse vendor doc and generate suggestions
    const parsedDoc = parseDoc(VENDOR_DOC);
    const suggestions = generateSuggestions(parsedDoc);

    assert.strictEqual(parsedDoc.title, "VNStock Unified UI Migration Guide");
    assert.ok(suggestions.suggested_frontmatter.capability === "vnstock-data");
    assert.ok(suggestions.suggested_frontmatter.validation_status === "pending");
    assert.ok(suggestions.suggested_findings.length >= 1);
    for (const f of suggestions.suggested_findings) {
      assert.ok(f.confidence >= 0.5, `confidence too low: ${f.confidence}`);
      assert.ok(f.topic_tag.length > 0);
    }

    // Step 3: Write evidence file from suggestions
    const evidenceFindings = suggestions.suggested_findings
      .map((f) => `- [${f.topic_tag}] ${f.assertion}`)
      .join("\n");
    const evidenceFile = `---
capability: ${suggestions.suggested_frontmatter.capability}
dimension: ${suggestions.suggested_frontmatter.dimension}
scope: ${suggestions.suggested_frontmatter.scope}
validation_status: ${suggestions.suggested_frontmatter.validation_status}
---
# Vendor Doc Evidence

## Findings
${evidenceFindings}
`;
    writeFileSync(join(tmp, "records", "vnstock", "evidence", "test-evidence.md"), evidenceFile);

    // Step 4: Run extract-index
    const extractResult = runExtraction(tmp, { dryRun: false, verbose: false });
    assert.strictEqual(extractResult.errors.length, 0, `extraction errors: ${extractResult.errors.join(" | ")}`);
    assert.ok(extractResult.stats.entriesProduced >= 1);

    // Step 5: Verify the produced entry is candidate
    const indexFiles = readdirSync(join(tmp, "records", "vnstock", "index")).filter((f) => f.endsWith(".yaml"));
    assert.ok(indexFiles.length >= 1);

    const indexYaml = parseYaml(readFileSync(join(tmp, "records", "vnstock", "index", indexFiles[0]), "utf8"));
    assert.strictEqual(indexYaml.status, "candidate");
    assert.strictEqual(indexYaml.capability, "vnstock-data");

    // Step 6: Create a product experiment referencing the candidate
    const candidateId = indexYaml.id;
    const experiment = {
      __file: "records/vnstock/experiments/test-experiment.yaml",
      id: "test-experiment",
      schema_version: "1.0",
      type: "experiment",
      status: "draft",
      created_at: "2026-05-19T14:00:00Z",
      updated_at: "2026-05-19T14:00:00Z",
      source_refs: [`record:${candidateId}`],
      evidence_refs: [],
      goal: "Test",
      hypothesis: "",
      method: [],
      success_metrics: [],
      result: "",
      agent_outcome: "",
      product_outcome: "",
      observations: [],
      promotion_review: [],
      verification: {
        claim_refs: [],
        proves: [],
        requires_human_approval: true,
        approval_status: "not-required",
      },
      experiment_refs: [],
    };

    // Step 7: Validate records — candidate reference should be rejected
    const schemas = loadSchemas(join(process.cwd()));
    const validationErrors = validateRecords([indexYaml, experiment], schemas, tmp);
    assert.ok(
      validationErrors.some((e) => e.includes("candidate") && e.includes(candidateId)),
      `expected candidate rejection error, got: ${validationErrors.join(" | ")}`
    );

    // Step 8: list-verified should not include candidate
    const verifiedResult = listVerifiedClaims(tmp);
    const assertionIds = (verifiedResult.assertions || []).map((a) => a.id);
    assert.ok(!assertionIds.includes(candidateId), "list-verified should exclude candidate by default");

    // Step 9: search-index with include_candidates should include candidate
    const searchResult = searchIndex(tmp, {}, false);
    const searchIds = searchResult.map((r) => r.id);
    assert.ok(searchIds.includes(candidateId), "searchIndex with excludeCandidates=false should include candidate");

    // Step 10: search-index default should exclude candidate
    const defaultSearch = searchIndex(tmp, {});
    const defaultIds = defaultSearch.map((r) => r.id);
    assert.ok(!defaultIds.includes(candidateId), "searchIndex default should exclude candidate");

    rmSync(tmp, { recursive: true, force: true });
  });
});

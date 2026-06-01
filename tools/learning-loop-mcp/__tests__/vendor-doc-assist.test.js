import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseDoc } from "#mcp/core/vendor-doc-assist/doc-parser.js";
import { generateSuggestions, detectCapability, detectDimension, computeConfidence, generateTopicTag } from "#mcp/core/vendor-doc-assist/suggestion-engine.js";
import { workflowVendorDocAssistTool } from "#mcp/tools/workflow-vendor-doc-assist-tool.js";

describe("doc-parser", () => {
  test("parses headings and sections", () => {
    const text = `# Title
## Section A
Some text.
## Section B
More text.
`;
    const doc = parseDoc(text);
    assert.strictEqual(doc.title, "Title");
    assert.strictEqual(doc.sections.length, 2);
    assert.strictEqual(doc.sections[0].heading, "Section A");
    assert.strictEqual(doc.sections[0].level, 2);
    assert.strictEqual(doc.sections[1].heading, "Section B");
  });

  test("detects tables in sections", () => {
    const text = `# Doc
## API
| Method | Description |
|--------|-------------|
| get()  | Returns data |
`;
    const doc = parseDoc(text);
    assert.strictEqual(doc.sections[0].hasTable, true);
  });

  test("detects code blocks in sections", () => {
    const text = `# Doc
## Setup
\`\`\`python
pip install foo
\`\`\`
`;
    const doc = parseDoc(text);
    assert.strictEqual(doc.sections[0].hasCode, true);
  });

  test("handles empty document", () => {
    const doc = parseDoc("");
    assert.strictEqual(doc.title, "Untitled");
    assert.strictEqual(doc.sections.length, 0);
  });

  test("ignores headings inside code blocks", () => {
    const text = `# Title
## Section
\`\`\`
# This is not a heading
\`\`\`
`;
    const doc = parseDoc(text);
    assert.strictEqual(doc.sections.length, 1);
  });
});

describe("suggestion-engine", () => {
  test("detects vnstock-data from title", () => {
    const cap = detectCapability("VNStock Data API Guide", []);
    assert.strictEqual(cap, "vnstock-data");
  });

  test("detects fastapi from heading", () => {
    const cap = detectCapability("Some Title", [{ heading: "FastAPI Setup", level: 2, lines: [], hasTable: false, hasCode: false }]);
    assert.strictEqual(cap, "fastapi");
  });

  test("falls back to meta", () => {
    const cap = detectCapability("Unknown Title", [{ heading: "Introduction", level: 2, lines: [], hasTable: false, hasCode: false }]);
    assert.strictEqual(cap, "meta");
  });

  test("detects install dimension from setup keywords", () => {
    const dim = detectDimension([
      { heading: "Setup", level: 2, lines: ["pip install vnstock_data"], hasTable: false, hasCode: false },
    ]);
    assert.strictEqual(dim, "install");
  });

  test("detects runtime dimension from api keywords", () => {
    const dim = detectDimension([
      { heading: "API Methods", level: 2, lines: ["Returns DataFrame"], hasTable: true, hasCode: false },
    ]);
    assert.strictEqual(dim, "runtime");
  });

  test("defaults to static when no keywords match", () => {
    const dim = detectDimension([
      { heading: "Overview", level: 2, lines: ["General info"], hasTable: false, hasCode: false },
    ]);
    assert.strictEqual(dim, "static");
  });

  test("computeConfidence returns 0.5 for plain text", () => {
    const score = computeConfidence({ heading: "Foo", lines: ["Some text."], hasTable: false, hasCode: false });
    assert.strictEqual(score, 0.5);
  });

  test("computeConfidence boosts for tables and code", () => {
    const score = computeConfidence({ heading: "Foo", lines: ["Some text."], hasTable: true, hasCode: true });
    assert.ok(score > 0.5);
    assert.ok(score <= 0.95);
  });

  test("generateTopicTag normalizes heading", () => {
    assert.strictEqual(generateTopicTag("API Methods"), "api-methods");
    assert.strictEqual(generateTopicTag("  Setup & Install!  "), "setup-install");
    assert.strictEqual(generateTopicTag("A"), "a");
  });

  test("generateSuggestions produces findings with confidence > 0.5", () => {
    const doc = parseDoc(`# VNStock Unified UI Migration Guide

## Tổng Quan

Unified UI provides a single entry point for all data types.

## API Methods

| Method | Description | Returns |
|--------|-------------|---------|
| stock_intraday | Real-time intraday data | DataFrame |
| stock_historical | Historical daily data | DataFrame |

## Setup

Install with pip install vnstock_data.
`);

    const result = generateSuggestions(doc);
    assert.strictEqual(result.suggested_frontmatter.capability, "vnstock-data");
    // The doc has "pip install" in Setup section, so install wins over runtime
    assert.strictEqual(result.suggested_frontmatter.dimension, "install");
    assert.strictEqual(result.suggested_frontmatter.scope, "sandbox");
    assert.strictEqual(result.suggested_frontmatter.validation_status, "pending");
    assert.ok(result.suggested_findings.length >= 1);
    for (const f of result.suggested_findings) {
      assert.ok(f.confidence >= 0.5, `confidence too low: ${f.confidence}`);
      assert.ok(f.topic_tag.length > 0);
      assert.ok(f.assertion.length > 0);
    }
  });

  test("generateSuggestions with API-only doc produces runtime dimension", () => {
    const doc = parseDoc(`# VNStock API
## API Methods
| Method | Description |
| stock_intraday | Real-time data |

## Data Format
Returns DataFrame.
`);
    const result = generateSuggestions(doc);
    assert.strictEqual(result.suggested_frontmatter.dimension, "runtime");
    assert.strictEqual(result.suggested_frontmatter.scope, "sandbox");
    assert.strictEqual(result.suggested_frontmatter.validation_status, "pending");
    assert.ok(result.suggested_findings.length >= 1);
    for (const f of result.suggested_findings) {
      assert.ok(f.confidence >= 0.5, `confidence too low: ${f.confidence}`);
      assert.ok(f.topic_tag.length > 0);
      assert.ok(f.assertion.length > 0);
    }
  });

  test("generateSuggestions skips overview/setup sections", () => {
    const doc = parseDoc(`# Guide
## Overview
General info.
## Setup
Install it.
## API Methods
Returns data.
`);
    const result = generateSuggestions(doc);
    const tags = result.suggested_findings.map((f) => f.topic_tag);
    assert.ok(!tags.includes("overview"));
    assert.ok(!tags.includes("setup"));
    assert.ok(tags.includes("api-methods"));
  });

  test("generateSuggestions with capabilityFilter overrides detection", () => {
    const doc = parseDoc(`# Generic Title
## API
Some method.
`);
    const result = generateSuggestions(doc, { capabilityFilter: "fastapi" });
    assert.strictEqual(result.suggested_frontmatter.capability, "fastapi");
  });

  test("generateSuggestions flags cross-references", () => {
    const doc = parseDoc(`# VNStock
## API Methods
Returns data.
`);
    const existing = [
      { id: "assertion-vnstock-data-runtime-api-methods", capability: "vnstock-data", dimension: "runtime", topic_tag: "api-methods", status: "active" },
    ];
    const result = generateSuggestions(doc, { existingIndex: existing });
    assert.ok(result.cross_references.length >= 1);
    assert.strictEqual(result.cross_references[0].type, "possibly-superseded");
  });

  test("generateSuggestions notes when no findings", () => {
    const doc = parseDoc(`# Title
## Overview
Only overview text.
`);
    const result = generateSuggestions(doc);
    assert.ok(result.notes.length > 0);
  });
});

describe("workflow_vendor_doc_assist handler", () => {
  test("returns error for missing file", async () => {
    const result = await workflowVendorDocAssistTool.handler({
      surface: "vnstock",
      vendor_doc_path: "records/vnstock/vendor-docs/nonexistent.md",
    });
    assert.strictEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, true);
  });
});

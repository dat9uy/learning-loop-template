import { test } from "vitest";
import assert from "node:assert/strict";
import { z } from "zod";
import { getFieldGlossaryEntry, listFieldGlossary } from "../core/field-glossary.js";
import { describeField } from "../core/schema-glossary.js";
import { loopDescribeTool } from "../tools/handlers/loop-describe-tool.js";
import { metaStateListTool } from "../tools/handlers/meta-state-list-tool.js";
import { metaStateReportTool } from "../tools/handlers/meta-state-report-tool.js";
import { metaStateProposeDesignTool } from "../tools/handlers/meta-state-propose-design-tool.js";
import { metaStateLogChangeTool } from "../tools/handlers/meta-state-log-change-tool.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalRoot = process.env.GATE_ROOT;

// The allowlist of (tool, field) pairs whose schema descriptions are
// glossary refs. Semantics-based: a field converts only when its description
// prose duplicates the glossary entry's `meaning` (entry-field semantics).
// Filter/query/op-input params that share a glossary name are excluded —
// their prose carries tool-specific behavior the glossary does not capture.
// Extend this allowlist only for new entry-field semantic matches.
const GLOSSARY_REF_ALLOWLIST = [
  ["meta_state_report", ["category", "subtype", "severity", "affected_system", "description",
    "evidence_journal", "evidence_code_ref", "evidence_test", "mechanism_check", "session_id"]],
  ["meta_state_log_change", ["change_dimension", "change_target", "change_diff", "reason",
    "applies_to", "supersedes", "consolidates", "evidence_code_ref", "evidence_journal",
    "operation_envelope"]],
  ["meta_state_propose_design", ["title", "description", "proposed_design_for", "addresses",
    "affected_system", "severity_hint", "loop_design_id"]],
];

function schemaShape(tool) {
  return tool.schema.shape ?? tool.schema;
}

function descOf(node) {
  if (typeof node?.description === "string") return node.description;
  if (typeof node?._zod?.description === "string") return node._zod.description;
  return null;
}

test("field glossary exposes stable entries for deduplicated contract fields", () => {
  const glossary = listFieldGlossary();
  const expected = [
    "id", "status", "evidence_code_ref", "evidence_journal", "evidence_test",
    "operation_envelope", "source_ref", "ledger_ref", "applies_to",
    "proposed_design_for", "addresses", "reopens",
  ];
  for (const field of expected) {
    const entry = getFieldGlossaryEntry(field);
    assert.deepEqual(entry, glossary[field]);
    assert.equal(typeof entry?.meaning, "string");
    assert.equal(typeof entry?.format, "string");
    assert.equal(typeof entry?.example, "string");
  }
  assert.ok(Object.keys(glossary).length >= expected.length);
});

test("loop_describe cold tier carries the field glossary", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "field-glossary-test-"));
  process.env.GATE_ROOT = tempRoot;
  try {
    const result = JSON.parse((await loopDescribeTool.handler({ tier: "cold" })).content[0].text);
    assert.ok(result.field_glossary);
    assert.ok(result.field_glossary.operation_envelope);
  } finally {
    if (originalRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalRoot;
  }
});

// ── shared describeField helper ──

test("describeField produces a glossary ref and preserves the node type", () => {
  const node = z.string().min(1);
  const described = describeField("evidence_code_ref", node);
  assert.strictEqual(descOf(described), "See field_glossary.evidence_code_ref");
  assert.ok(described instanceof z.ZodString, "describeField must return a Zod node, not a string");
});

test("allowlisted handler+field pairs use glossary refs", () => {
  const tools = {
    meta_state_report: metaStateReportTool,
    meta_state_log_change: metaStateLogChangeTool,
    meta_state_propose_design: metaStateProposeDesignTool,
  };
  for (const [name, fields] of GLOSSARY_REF_ALLOWLIST) {
    const shape = schemaShape(tools[name]);
    for (const field of fields) {
      const node = shape[field];
      assert.ok(node, `${name}.${field} must exist in the schema`);
      const d = descOf(node);
      assert.ok(
        d?.includes("field_glossary."),
        `${name}.${field} must be a glossary ref; got: ${JSON.stringify(d)}`,
      );
    }
  }
});

test("meta_state_list filter fields are NOT glossary refs", () => {
  // Filter/query params share glossary names but carry tool-specific filter
  // behavior (default-exclusion defaults, excluded_ids notice, ref_by
  // pairing) that the glossary entry does not capture. Name→ref swap would
  // delete behavioral hints.
  const shape = schemaShape(metaStateListTool);
  for (const field of ["id", "status", "affected_system", "session_id", "entry_kind", "ref_by", "ref_field"]) {
    const d = descOf(shape[field]);
    assert.ok(
      !d?.includes("field_glossary."),
      `${field} filter field must keep its filter prose; got: ${JSON.stringify(d)}`,
    );
  }
});

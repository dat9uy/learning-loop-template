import { test } from "vitest";
import assert from "node:assert/strict";
import { getFieldGlossaryEntry, listFieldGlossary } from "../core/field-glossary.js";
import { loopDescribeTool } from "../tools/handlers/loop-describe-tool.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalRoot = process.env.GATE_ROOT;

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

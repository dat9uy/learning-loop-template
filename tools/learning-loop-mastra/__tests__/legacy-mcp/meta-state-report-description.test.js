import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";

describe("metaStateReportTool description", () => {
  test("mentions evidence_code_ref and meta_state_derive_status", () => {
    assert.ok(metaStateReportTool.description.includes("evidence_code_ref"));
    assert.ok(metaStateReportTool.description.includes("meta_state_derive_status"));
  });

  test("does NOT contain the old 'Prefer' wording", () => {
    assert.ok(!metaStateReportTool.description.includes("Prefer `evidence_code_ref`"));
  });

  test("warns that markdown paths are deprecated", () => {
    assert.ok(metaStateReportTool.description.includes("Markdown paths in `source_refs` are deprecated"));
  });
});

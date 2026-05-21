import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowVerifyEvidenceTool } from "./workflow-verify-evidence-tool.js";

const EVIDENCE_PATH = "records/evidence/meta/install-experiment-template-candidate.md";

describe("workflowVerifyEvidenceTool", () => {
  it("shallow depth returns symbol-exists and import-succeeds classes", async () => {
    const result = await workflowVerifyEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      verification_depth: "shallow",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.assertion_matrix));
    assert.ok(Array.isArray(parsed.skipped_snippets));
    assert.ok(typeof parsed.counts === "object");
    const classes = parsed.assertion_matrix.map((a) => a.execution_class);
    assert.ok(classes.every((c) => c === "symbol-exists" || c === "import-succeeds" || c === "unclassified"));
  });

  it("deep depth includes full-runtime where applicable", async () => {
    const result = await workflowVerifyEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      verification_depth: "deep",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.assertion_matrix));
    const classes = parsed.assertion_matrix.map((a) => a.execution_class);
    assert.ok(classes.includes("full-runtime") || classes.includes("sample-output") || classes.includes("method-callable"));
  });

  it("missing file returns error", async () => {
    const result = await workflowVerifyEvidenceTool.handler({
      evidence_path: "records/evidence/meta/non-existent.md",
      verification_depth: "shallow",
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
  });

  it("counts match matrix length", async () => {
    const result = await workflowVerifyEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      verification_depth: "deep",
    });
    const parsed = JSON.parse(result.content[0].text);
    const total = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
    assert.equal(total, parsed.assertion_matrix.length);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowConvertEvidenceTool } from "./workflow-convert-evidence-tool.js";

const EVIDENCE_PATH = "records/evidence/meta/capability-allowlist-deferred-axes.md";

describe("workflowConvertEvidenceTool", () => {
  it("dry_run returns preview status and valid yaml", async () => {
    const result = await workflowConvertEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      mode: "dry_run",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "preview");
    assert.ok(typeof parsed.experiment_yaml === "string");
    assert.ok(parsed.experiment_yaml.length > 0);
    assert.ok(Array.isArray(parsed.source_refs_linked));
    assert.ok(parsed.source_refs_linked.some((r) => r.includes(EVIDENCE_PATH)));
    assert.ok(Array.isArray(parsed.validation_errors));
  });

  it("migration mode sets reviewed status", async () => {
    const result = await workflowConvertEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      mode: "migration",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "converted");
    assert.ok(parsed.experiment_yaml.includes("reviewed"));
    assert.ok(Array.isArray(parsed.source_refs_linked));
  });

  it("structuring mode sets draft status and post-hoc note", async () => {
    const result = await workflowConvertEvidenceTool.handler({
      evidence_path: EVIDENCE_PATH,
      mode: "structuring",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "converted");
    assert.ok(parsed.experiment_yaml.includes("draft"));
    assert.ok(parsed.experiment_yaml.includes("post-hoc structuring"));
  });

  it("missing file returns error", async () => {
    const result = await workflowConvertEvidenceTool.handler({
      evidence_path: "records/evidence/meta/non-existent.md",
      mode: "dry_run",
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("not found") || parsed.message.includes("missing"));
  });
});

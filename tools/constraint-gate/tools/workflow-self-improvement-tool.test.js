import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowSelfImprovementTool } from "./workflow-self-improvement-tool.js";

describe("workflowSelfImprovementTool", () => {
  it("schema-change returns correct candidate and adoption path", async () => {
    const result = await workflowSelfImprovementTool.handler({
      improvement_type: "schema-change",
      description: "Add enum constraint to stack field",
      proposed_changes: ["update schema", "migrate records"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.experiment_candidate.includes("schema"));
    assert.equal(parsed.decision_required, true);
    assert.ok(Array.isArray(parsed.risks));
    assert.ok(Array.isArray(parsed.next_steps));
    assert.ok(typeof parsed.canonical_adoption_path === "string");
    assert.ok(parsed.canonical_adoption_path.includes("operator-approval"));
  });

  it("workflow-gap returns correct candidate and adoption path", async () => {
    const result = await workflowSelfImprovementTool.handler({
      improvement_type: "workflow-gap",
      description: "Missing tool for budget check",
      proposed_changes: ["implement tool", "add tests"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.experiment_candidate.includes("workflow"));
    assert.equal(parsed.decision_required, true);
    assert.ok(Array.isArray(parsed.risks));
    assert.ok(Array.isArray(parsed.next_steps));
    assert.ok(parsed.canonical_adoption_path.includes("operator-approval"));
  });

  it("returns experiment candidate for heuristic-tune", async () => {
    const result = await workflowSelfImprovementTool.handler({
      improvement_type: "heuristic-tune",
      description: "Tune classification thresholds",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.experiment_candidate === "string");
    assert.equal(parsed.decision_required, true);
  });
});

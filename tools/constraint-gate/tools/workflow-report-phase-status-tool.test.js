import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowReportPhaseStatusTool } from "./workflow-report-phase-status-tool.js";

describe("workflowReportPhaseStatusTool", () => {
  it("returns complete when all steps done and result conclusive", async () => {
    const result = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 5,
      process_steps_complete: 5,
      experiment_result: "success",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.lifecycle_complete, true);
    assert.ok(parsed.status.includes("Process: 5/5"));
    assert.ok(parsed.status.includes("Experiment: success"));
  });

  it("returns incomplete when steps remain", async () => {
    const result = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 5,
      process_steps_complete: 3,
      experiment_result: "inconclusive",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.lifecycle_complete, false);
    assert.ok(parsed.status.includes("Process: 3/5"));
    assert.ok(parsed.status.includes("Experiment: inconclusive"));
  });

  it("returns incomplete when result inconclusive even with all steps done", async () => {
    const result = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 4,
      process_steps_complete: 4,
      experiment_result: "inconclusive",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.lifecycle_complete, false);
    assert.ok(parsed.status.includes("inconclusive"));
  });

  it("returns incomplete when blocker reason present", async () => {
    const result = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 4,
      process_steps_complete: 4,
      experiment_result: "success",
      blocker_reason: "pending operator approval",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.lifecycle_complete, false);
    assert.ok(parsed.status.includes("pending operator approval"));
  });

  it("returns complete for failure result when all steps done and no blocker", async () => {
    const result = await workflowReportPhaseStatusTool.handler({
      process_steps_total: 3,
      process_steps_complete: 3,
      experiment_result: "failure",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.lifecycle_complete, true);
    assert.ok(parsed.status.includes("failure"));
  });
});

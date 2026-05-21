import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowPrepareRuntimeRequestTool } from "./workflow-prepare-runtime-request-tool.js";

describe("workflowPrepareRuntimeRequestTool", () => {
  it("sandbox install checklist passes", async () => {
    const result = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "install",
      scope: "sandbox",
      output_level: "pass/fail",
      command_class: "setup",
      temp_root_class: "disposable",
      evidence_missing: false,
      why_local_insufficient: "Sandbox required for clean install verification",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.approval_request === "string");
    assert.ok(parsed.approval_request.length > 0);
    assert.ok(Array.isArray(parsed.pre_conditions));
    const allPass = parsed.pre_conditions.every((c) => c.pass === true);
    assert.ok(allPass);
  });

  it("production without observation flags missing", async () => {
    const result = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "runtime",
      scope: "production",
      output_level: "full",
      command_class: "deploy",
      temp_root_class: "persistent",
      evidence_missing: false,
      why_local_insufficient: "Production deploy needs runtime gate",
    });
    const parsed = JSON.parse(result.content[0].text);
    const obsCheck = parsed.pre_conditions.find((c) => c.name === "observation_active");
    assert.ok(obsCheck);
    assert.equal(obsCheck.pass, false);
    assert.ok(obsCheck.reason.includes("production"));
  });

  it("missing evidence flags missing", async () => {
    const result = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "runtime",
      scope: "local",
      output_level: "summary",
      command_class: "test",
      temp_root_class: "ephemeral",
      evidence_missing: true,
      why_local_insufficient: "Need runtime evidence",
    });
    const parsed = JSON.parse(result.content[0].text);
    const evCheck = parsed.pre_conditions.find((c) => c.name === "evidence_present");
    assert.ok(evCheck);
    assert.equal(evCheck.pass, false);
    assert.ok(evCheck.reason.includes("evidence"));
  });

  it("returns error for missing required fields", async () => {
    const result = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "",
      scope: "",
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("dimension") || parsed.message.includes("scope"));
  });

  it("approval request includes safety disclaimer", async () => {
    const result = await workflowPrepareRuntimeRequestTool.handler({
      dimension: "runtime",
      scope: "sandbox",
      output_level: "pass/fail",
      command_class: "setup",
      temp_root_class: "disposable",
      evidence_missing: false,
      why_local_insufficient: "Test",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.approval_request.includes("check_gate") || parsed.approval_request.includes("does NOT approve"));
  });
});

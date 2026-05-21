import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowExternalDecisionTool } from "./workflow-external-decision-tool.js";

describe("workflowExternalDecisionTool", () => {
  it("returns full acceptance when no remaining blocks and scope matches", async () => {
    const result = await workflowExternalDecisionTool.handler({
      source: "stakeholder-meeting-2026-05-21",
      authority_scope: "product/api/auth",
      confirmed_scope: "product/api/auth",
      remaining_blocks: [],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.acceptance, "full");
    assert.ok(Array.isArray(parsed.records_required));
    assert.ok(Array.isArray(parsed.risks));
    assert.ok(Array.isArray(parsed.capability_boundaries));
    assert.ok(typeof parsed.rationale === "string");
  });

  it("returns partial acceptance when remaining blocks exist", async () => {
    const result = await workflowExternalDecisionTool.handler({
      source: "stakeholder-meeting-2026-05-21",
      authority_scope: "product/api",
      confirmed_scope: "product/api/auth",
      remaining_blocks: ["product/web/auth"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.acceptance, "partial");
    assert.ok(Array.isArray(parsed.records_required));
    assert.ok(parsed.risks.length > 0);
  });

  it("returns rejected when confirmed scope exceeds authority", async () => {
    const result = await workflowExternalDecisionTool.handler({
      source: "stakeholder-meeting-2026-05-21",
      authority_scope: "product/api",
      confirmed_scope: "product/web",
      remaining_blocks: [],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.acceptance, "rejected");
    assert.ok(parsed.risks.length > 0);
    assert.ok(parsed.rationale.includes("exceeds"));
  });
});

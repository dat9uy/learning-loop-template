import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowIntentionalSkipTool } from "./workflow-intentional-skip-tool.js";

describe("workflowIntentionalSkipTool", () => {
  it("returns blocked for critical security scope", async () => {
    const result = await workflowIntentionalSkipTool.handler({
      assertion_id: "auth-mfa-required",
      skip_reason: "too hard",
      scope: "security-critical",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "blocked");
    assert.ok(Array.isArray(parsed.records_required));
    assert.ok(parsed.records_required.length > 0);
    assert.ok(Array.isArray(parsed.blocked_work));
    assert.ok(parsed.blocked_work.length > 0);
    assert.ok(typeof parsed.rationale === "string");
  });

  it("returns narrowed for minor docs scope", async () => {
    const result = await workflowIntentionalSkipTool.handler({
      assertion_id: "docs-typo-fix",
      skip_reason: "defer to next sprint",
      scope: "docs-minor",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "narrowed");
    assert.ok(Array.isArray(parsed.allowed_work));
    assert.ok(parsed.allowed_work.length > 0);
    assert.ok(Array.isArray(parsed.records_required));
    assert.ok(parsed.records_required.length > 0);
  });

  it("returns accepted for low-risk scope", async () => {
    const result = await workflowIntentionalSkipTool.handler({
      assertion_id: "style-lint-rule",
      skip_reason: "not relevant to current dimension",
      scope: "style-cosmetic",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "accepted");
    assert.ok(Array.isArray(parsed.allowed_work));
    assert.ok(Array.isArray(parsed.records_required));
  });

  it("returns blocked for empty reason", async () => {
    const result = await workflowIntentionalSkipTool.handler({
      assertion_id: "x",
      skip_reason: "",
      scope: "any",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "blocked");
  });
});

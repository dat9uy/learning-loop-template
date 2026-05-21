import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowProductBuildTool } from "./workflow-product-build-tool.js";

describe("workflowProductBuildTool", () => {
  it("expands minimal request into structured artifacts", async () => {
    const result = await workflowProductBuildTool.handler({
      request_description: "Add a user profile page",
      scope: "frontend",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.assertions));
    assert.ok(Array.isArray(parsed.risks));
    assert.ok(Array.isArray(parsed.experiments));
    assert.ok(Array.isArray(parsed.decisions));
    assert.ok(Array.isArray(parsed.required_records));
    assert.ok(parsed.assertions.length > 0);
    assert.ok(parsed.risks.length > 0);
    assert.ok(parsed.experiments.length > 0);
  });

  it("returns error for empty request", async () => {
    const result = await workflowProductBuildTool.handler({
      request_description: "",
      scope: "api",
    });
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("request_description"));
  });

  it("expands complex request with constraints into richer artifacts", async () => {
    const result = await workflowProductBuildTool.handler({
      request_description: "Build a payment gateway with PCI compliance and webhook retries",
      scope: "backend",
      known_constraints: ["PCI-DSS Level 1", "99.99% uptime", "idempotent webhooks"],
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.assertions));
    assert.ok(Array.isArray(parsed.risks));
    assert.ok(Array.isArray(parsed.experiments));
    assert.ok(Array.isArray(parsed.decisions));
    assert.ok(Array.isArray(parsed.required_records));
    assert.ok(parsed.risks.length >= 2);
    assert.ok(parsed.required_records.length >= 1);
    assert.ok(parsed.assertions.some((a) => a.includes("webhook") || a.includes("payment") || a.includes("PCI")));
  });

  it("includes capability generation extension hints when scope is api", async () => {
    const result = await workflowProductBuildTool.handler({
      request_description: "Expose REST endpoints for order management",
      scope: "api",
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.assertions));
    assert.ok(parsed.assertions.some((a) => a.includes("endpoint") || a.includes("REST")));
    assert.ok(parsed.required_records.some((r) => r.includes("capability") || r.includes("experiment")));
  });
});

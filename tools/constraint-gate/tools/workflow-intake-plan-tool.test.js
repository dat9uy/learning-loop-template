import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowIntakePlanTool } from "./workflow-intake-plan-tool.js";

describe("workflowIntakePlanTool", () => {
  it("consumes orient output and returns ordered steps", async () => {
    const orient = {
      index_entries: [
        {
          id: "assertion-fundamental-product-fundamental-endpoints",
          capability: "fundamental",
          dimension: "product",
          scope: "api+web",
          assertion: "GET /fundamental/income/{symbol} returns DataFrameEnvelope",
        },
        {
          id: "assertion-vnstock-data-install-fresh-container-install-succeeds",
          capability: "vnstock-data",
          dimension: "install",
          scope: "container",
          assertion: "Fresh container install succeeds",
        },
      ],
      meta_triggers: ["capability-schema-gap.md"],
      observations: [{ id: "observation-evidence-write-path", status: "inactive" }],
      capability_files: ["capability-fastapi-fundamental-rest"],
      missing_decisions: [],
    };

    const result = await workflowIntakePlanTool.handler({ orient_result: orient });
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.steps));
    assert.ok(parsed.steps.length > 0);
    assert.ok(parsed.steps.every((s) => s.step_number && s.action));
  });

  it("classifies verification types correctly", async () => {
    const orient = {
      index_entries: [
        { id: "a1", capability: "x", dimension: "install", scope: "container", assertion: "Install works" },
        { id: "a2", capability: "x", dimension: "runtime", scope: "local", assertion: "Runtime works" },
        { id: "a3", capability: "x", dimension: "static", scope: "lint", assertion: "Static passes" },
      ],
      meta_triggers: [],
      observations: [],
      capability_files: [],
      missing_decisions: [],
    };

    const result = await workflowIntakePlanTool.handler({ orient_result: orient });
    const parsed = JSON.parse(result.content[0].text);
    const types = parsed.steps.map((s) => s.verification_type);
    assert.ok(types.includes("static"));
    assert.ok(types.includes("runtime"));
    assert.ok(types.includes("import") || types.includes("static"));
  });

  it("flags blocked when no candidates found", async () => {
    const orient = {
      index_entries: [],
      meta_triggers: [],
      observations: [],
      capability_files: [],
      missing_decisions: [],
    };

    const result = await workflowIntakePlanTool.handler({ orient_result: orient });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "blocked");
    assert.ok(Array.isArray(parsed.steps));
    assert.equal(parsed.steps.length, 0);
  });

  it("returns error for missing orient_result", async () => {
    const result = await workflowIntakePlanTool.handler({});
    assert.equal(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.error, true);
    assert.ok(parsed.message.includes("orient_result"));
  });

  it("suggests questions for missing decisions", async () => {
    const orient = {
      index_entries: [
        { id: "a1", capability: "fundamental", dimension: "product", scope: "api", assertion: "X" },
      ],
      meta_triggers: [],
      observations: [],
      capability_files: [],
      missing_decisions: ["a1"],
    };

    const result = await workflowIntakePlanTool.handler({ orient_result: orient });
    const parsed = JSON.parse(result.content[0].text);
    const hasQuestion = parsed.steps.some((s) => s.questions && s.questions.length > 0);
    assert.ok(hasQuestion || parsed.steps.some((s) => s.action === "ask_decision"));
  });
});

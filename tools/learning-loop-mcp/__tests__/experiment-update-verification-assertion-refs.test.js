import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { zodObjectForProperties } from "#mcp/core/schema-to-zod.js";
import { loadSchemas } from "#mcp/core/schema-loader.js";

describe("experiment update tool — verification.assertion_refs exposure (regression-safety for SP2 gap)", () => {
  it("update tool's verification block accepts verification.assertion_refs", () => {
    const root = process.cwd();
    const schemas = loadSchemas(root);
    const verificationBlock = zodObjectForProperties(
      schemas.experiment.properties.verification.properties,
      schemas.experiment.properties.verification.required,
    );
    const result = verificationBlock.parse({
      claim_refs: [],
      proves: [{ dimension: "install", scope: "sandbox", output_level: "metadata-only" }],
      requires_human_approval: true,
      approval_status: "not-required",
      assertion_refs: ["record:assertion-sp2-cook-fixture-static-foo"],
    });
    assert.deepStrictEqual(result.assertion_refs, ["record:assertion-sp2-cook-fixture-static-foo"]);
  });
});

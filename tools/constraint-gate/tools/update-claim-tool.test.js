import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { updateClaimTool } from "./update-claim-tool.js";

describe("updateClaimTool", () => {
  it("dry run with real claim returns updated: false", async () => {
    const result = await updateClaimTool.handler({
      claim_id: "claim-loop-capabilities-stack-allowlist",
      dimension: "static",
      status: "claimed",
      reason: "test-dry-run",
      apply: false,
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.updated, false);
    assert.ok(parsed.preview);
  });

  it("throws error for non-existent claim", async () => {
    await assert.rejects(
      async () => updateClaimTool.handler({
        claim_id: "nonexistent-claim",
        dimension: "static",
        status: "claimed",
        reason: "test",
        apply: false,
      }),
      /Claim not found/
    );
  });

  it("Zod validates dimension enum", () => {
    assert.throws(() => {
      updateClaimTool.schema.dimension.parse("invalid");
    });
  });

  it("Zod validates status enum", () => {
    assert.throws(() => {
      updateClaimTool.schema.status.parse("invalid");
    });
  });

  it("Zod rejects invalid claim_id pattern", () => {
    assert.throws(() => {
      updateClaimTool.schema.claim_id.parse("Invalid_Id");
    });
  });
});

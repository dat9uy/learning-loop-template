import { test } from "node:test";
import assert from "node:assert";

// Real-registry test — gated. The operator runs this AFTER executing the
// backfill step manually (see plans/260610-1535-meta-state-reopen-path/phase-04-hint-backfill-ack.md).
test.skip("backfill: meta-260610T1458Z-... reopens meta-260606T2202Z-...", async () => {
  if (process.env.SKIP_REAL_REGISTRY_TESTS === "1") return;

  const { metaStatePatchTool } = await import("../../tools/handlers/meta-state-patch-tool.js");
  const { metaStateRelationshipsTool } = await import("../../tools/handlers/meta-state-relationships-tool.js");

  // Verify the backfill was applied
  const relResult = await metaStateRelationshipsTool.handler({
    id: "meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g",
    direction: "inbound",
  });
  const parsed = JSON.parse(relResult.content[0].text);
  assert.ok(parsed.inbound, "inbound should be present");
  assert.ok(parsed.inbound.reopened_by, "inbound should have reopened_after backfill");
  assert.ok(
    parsed.inbound.reopened_by.some((id) => id.startsWith("meta-260610T1458Z")),
    "reopened_by should include the backfilled finding"
  );
});

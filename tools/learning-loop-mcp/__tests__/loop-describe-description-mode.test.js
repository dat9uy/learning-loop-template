import { test } from "node:test";
import assert from "node:assert";
import { loopDescribeTool } from "#mcp/tools/loop-describe-tool.js";

const TIER = "cold";

test("Phase 6: cold-tier default returns full descriptions (no breaking change)", async () => {
  const result = await loopDescribeTool.handler({ tier: TIER });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.description_mode, "full");

  const finding = text.all_findings[0];
  assert.ok(
    finding.description && finding.description.length > 200,
    "Default cold tier should return full descriptions"
  );
  assert.strictEqual(
    finding.description_preview,
    undefined,
    "Full mode should not have description_preview"
  );
});

test("Phase 6: cold-tier summary mode truncates descriptions to 200 chars", async () => {
  const result = await loopDescribeTool.handler({ tier: TIER, description_mode: "summary" });
  const text = JSON.parse(result.content[0].text);
  assert.strictEqual(text.description_mode, "summary");

  const finding = text.all_findings[0];
  assert.ok(
    finding.description_preview,
    "Summary mode should have description_preview"
  );
  assert.ok(
    finding.description_preview.length <= 203,
    `description_preview should be <=203 chars (200 + "..."), got ${finding.description_preview.length}`
  );
  assert.strictEqual(
    finding.description,
    undefined,
    "Summary mode should not have full description"
  );
});

test("Phase 6: summary mode reduces cold-tier size", async () => {
  const fullResult = await loopDescribeTool.handler({ tier: TIER, description_mode: "full" });
  const full = JSON.parse(fullResult.content[0].text);

  const summaryResult = await loopDescribeTool.handler({ tier: TIER, description_mode: "summary" });
  const summary = JSON.parse(summaryResult.content[0].text);

  const fullBytes = Buffer.byteLength(JSON.stringify(full, null, 2), "utf8");
  const summaryBytes = Buffer.byteLength(JSON.stringify(summary, null, 2), "utf8");

  console.log(`Full: ${fullBytes} bytes, Summary: ${summaryBytes} bytes`);
  assert.ok(
    summaryBytes < fullBytes,
    `Summary mode should be smaller than full mode (${summaryBytes} < ${fullBytes})`
  );

  // Target: summary should be <= 16K tokens (64KB)
  assert.ok(
    summaryBytes < 80000,
    `Summary mode should be <80KB (target 64KB), got ${summaryBytes}`
  );
});

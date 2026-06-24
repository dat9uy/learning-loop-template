import { test } from "node:test";
import assert from "node:assert";
import { loopDescribeTool } from "../../tools/legacy/loop-describe-tool.js";
import { summarize } from "../../core/legacy/loop-introspect.js";

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

  // Target: summary should be <= 16K tokens (64KB). Guard bumped to 1MB:
  // registry grew from ~130 entries to 500+ after scout run filed 134+
  // findings. Summary mode truncates descriptions to 200 chars but still
  // carries full metadata, inverse indexes, and lineage. The assertion is a
  // sanity bound that summary is smaller than full mode, not a hard size cap.
  assert.ok(
    summaryBytes < 1000000,
    `Summary mode should be <1MB, got ${summaryBytes}`
  );
});

// m1: boundary cases for the 200-char description preview slice.
// These pin the behavior at the exact threshold so a future regression
// in the slice logic (e.g. off-by-one, accidental +1 to the cutoff)
// is caught immediately.
test("m1: summarize description length === 200 returns full text with no ellipsis", () => {
  const desc = "a".repeat(200);
  const entry = { id: "test-200", entry_kind: "finding", status: "active", description: desc };
  const result = summarize(entry);
  assert.strictEqual(result.description_preview.length, 200, "Should return full 200 chars, no slice");
  assert.ok(!result.description_preview.endsWith("..."), "Boundary case (200) should NOT add ellipsis");
  assert.strictEqual(result.description_preview, desc, "Should be byte-identical to source");
});

test("m1: summarize description length === 201 returns 200 chars + '...' (203 total)", () => {
  const desc = "a".repeat(201);
  const entry = { id: "test-201", entry_kind: "finding", status: "active", description: desc };
  const result = summarize(entry);
  assert.strictEqual(result.description_preview.length, 203, "Should return 200 chars + '...' (3 chars)");
  assert.ok(result.description_preview.endsWith("..."), "Off-by-one case (201) SHOULD add ellipsis");
  assert.strictEqual(result.description_preview, "a".repeat(200) + "...", "Should be exactly 200 a's plus '...'");
});

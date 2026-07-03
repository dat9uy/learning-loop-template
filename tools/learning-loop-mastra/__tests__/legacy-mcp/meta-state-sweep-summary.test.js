import { test } from "node:test";
import assert from "node:assert";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { loopDescribeTool } from "../../tools/legacy/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = resolveRoot();

test("Phase 7: meta_state_sweep apply succeeds and does NOT write docs/registry-summary.md", async () => {
  // The registry-summary.md auto-writer was removed (the loop_describe summary tier
  // + meta_state_list cover the same surface). Sweep apply must still succeed; the
  // file must NOT be written.
  const original = process.env.OPERATOR_MODE;
  process.env.OPERATOR_MODE = "1";
  try {
    const result = await metaStateSweepTool.handler({ apply: true });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.swept, true);
  } finally {
    process.env.OPERATOR_MODE = original;
  }

  const summaryPath = join(root, "docs", "registry-summary.md");
  assert.ok(!existsSync(summaryPath), "docs/registry-summary.md must NOT be written by sweep");
});

test("Phase 7: warm tier includes registry_summary field", async () => {
  const result = await loopDescribeTool.handler({ tier: "warm" });
  const text = JSON.parse(result.content[0].text);
  assert.ok(text.registry_summary, "warm tier should have registry_summary");
  assert.ok(text.registry_summary.counts, "registry_summary should have counts");
  assert.ok(text.registry_summary.coverage, "registry_summary should have coverage");
  assert.ok(text.registry_summary.top_references, "registry_summary should have top_references");
  assert.ok(text.registry_summary.drift, "registry_summary should have drift");
  assert.ok(text.registry_summary.last_generated_at, "registry_summary should have last_generated_at");
});

import { test } from "node:test";
import assert from "node:assert";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { loopDescribeTool } from "../../tools/legacy/loop-describe-tool.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const originalEnv = process.env.GATE_ROOT;
let tempDir;

test("Phase 7: meta_state_sweep apply succeeds and does NOT write docs/registry-summary.md", async () => {
  // The registry-summary.md auto-writer was removed (the loop_describe summary tier
  // + meta_state_list cover the same surface). Sweep apply must still succeed; the
  // file must NOT be written.
  //
  // P0 B1 fix (plan 260704-0301-stale-findings-dispatch-handle): switched from
  // live resolveRoot() to mkdtempSync isolation. The previous version mutated
  // the live meta-state.jsonl on every pnpm test run (the pre-commit hook),
  // auto-transitioning past-TTL reported entries -> stale — the user-reported
  // "pre-commit auto-updates reported to stale" confusion mechanism.
  tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-summary-"));
  process.env.GATE_ROOT = tempDir;
  const original = process.env.OPERATOR_MODE;
  process.env.OPERATOR_MODE = "1";
  try {
    const result = await metaStateSweepTool.handler({ apply: true });
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.swept, true);
  } finally {
    process.env.OPERATOR_MODE = original;
    process.env.GATE_ROOT = originalEnv;
  }

  const summaryPath = join(tempDir, "docs", "registry-summary.md");
  assert.ok(!existsSync(summaryPath), "docs/registry-summary.md must NOT be written by sweep");
});

test("Phase 7: warm tier includes registry_summary field", async () => {
  // P0 B1 fix: also isolated to the tempDir so loop_describe reads the
  // (empty) registry under GATE_ROOT, not the live one. The warm-tier
  // registry_summary field shape is independent of registry contents.
  tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-summary-warm-"));
  process.env.GATE_ROOT = tempDir;
  try {
    const result = await loopDescribeTool.handler({ tier: "warm" });
    const text = JSON.parse(result.content[0].text);
    assert.ok(text.registry_summary, "warm tier should have registry_summary");
    assert.ok(text.registry_summary.counts, "registry_summary should have counts");
    assert.ok(text.registry_summary.coverage, "registry_summary should have coverage");
    assert.ok(text.registry_summary.top_references, "registry_summary should have top_references");
    assert.ok(text.registry_summary.drift, "registry_summary should have drift");
    assert.ok(text.registry_summary.last_generated_at, "registry_summary should have last_generated_at");
  } finally {
    process.env.GATE_ROOT = originalEnv;
  }
});

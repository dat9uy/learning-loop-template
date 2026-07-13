import { test } from "vitest";
import assert from "node:assert";
import { metaStateSweepTool } from "../../tools/handlers/meta-state-sweep-tool.js";
import { loopDescribeTool } from "../../tools/handlers/loop-describe-tool.js";

// Plan 260707-0812 Phase 3: sweep is read-only. The previous tests in this
// file used `mkdtempSync` isolation to defend against sweep `apply:true`
// mutating the live registry (P0 B1 from plan 260704-0301). With sweep's
// apply mode removed, the isolation is no longer required — sweep can't
// mutate any registry. The tests now assert the read-only contract instead.

const originalEnv = process.env.GATE_ROOT;

test("Phase 7: meta_state_sweep is read-only (no apply mode, no writes)", async () => {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
  try {
    const result = await metaStateSweepTool.handler({});
    const text = JSON.parse(result.content[0].text);
    assert.strictEqual(text.swept, false, "sweep never applies; swept must be false");
    assert.strictEqual(text.dry_run, true, "dry_run must be true");
    assert.strictEqual(text.read_only, true, "read_only flag must be true");
    assert.ok(typeof text.stale_view_count === "number", "stale_view_count must be a number");
    assert.ok(Array.isArray(text.findings), "findings must be an array");
  } finally {
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalEnv;
    }
  }
});

test("Phase 7: warm tier includes registry_summary field", async () => {
  // The warm-tier registry_summary field shape is independent of sweep.
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
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
    if (originalEnv === undefined) {
      delete process.env.GATE_ROOT;
    } else {
      process.env.GATE_ROOT = originalEnv;
    }
  }
});
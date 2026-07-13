"use strict";
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

// Plan 260711-0030 Phase 2 RED test.
// Two identical log_change calls within 60s must produce 2 distinct entries
// (each with fresh id + created_at). With the in-process 60s idempotency
// cache, the second call returned the cached {logged: true, cache_hit: true}
// response without writing a second entry — masking write failures
// (silent-persistence-fail).

test("2 identical log_change calls within 60s produce 2 distinct entries", async () => {
  const root = mkdtempSync(join(tmpdir(), "drop-cache-test-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const { metaStateLogChangeTool } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js")
    );
    const args = {
      change_dimension: "semantic",
      change_target: "tools/test/cache-drop",
      change_diff: { added: ["x"], removed: [], changed: [] },
      reason: "RED test: cache-drop identical-args call verifies no 60s dedupe",
    };

    const r1Text = (await metaStateLogChangeTool.handler(args)).content[0].text;
    const r2Text = (await metaStateLogChangeTool.handler(args)).content[0].text;
    const r1 = JSON.parse(r1Text);
    const r2 = JSON.parse(r2Text);

    // Both calls succeed.
    assert.equal(r1.logged, true);
    assert.equal(r2.logged, true);

    // Two distinct registry entries on disk (with cache removed, the second call
    // no longer returns the cached response without writing). The id is
    // minute-resolution per generateId, so same-minute same-target calls share
    // the id but the registry distinguishes them by created_at + registry line.
    const lines = readFileSync(join(root, "meta-state.jsonl"), "utf8").trim().split("\n").filter(Boolean);
    assert.equal(lines.length, 2, "expected 2 entries; got " + lines.length);
    const entries = lines.map((l) => JSON.parse(l));
    assert.notEqual(
      entries[0].created_at,
      entries[1].created_at,
      "entries must have distinct created_at (cache would have skipped write)"
    );

    // cache_hit field is removed from response shape (Phase 2 trust boundary).
    assert.equal(r1.cache_hit, undefined, "cache_hit field should be removed");
    assert.equal(r2.cache_hit, undefined, "cache_hit field should be removed");
  } finally {
    if (originalEnv === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

function repoRoot() {
  return join(__dirname, "..", "..", "..");
}
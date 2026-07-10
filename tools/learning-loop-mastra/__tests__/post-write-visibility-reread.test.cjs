"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function repoRoot() {
  return join(__dirname, "..", "..", "..");
}

// Plan 260711-0030 Phase 3 RED test.
//
// T4 / T5 / C16 class: handler returns {logged: true, ...} or {superseded: true, ...}
// even when the write silently failed (entry not visible in registry post-write).
// Phase 3 closes this by re-reading the registry after every write/update.
//
// The structural assertions below verify the new behavior:
//   - applyUpdateAndCheck returns {ok: true, entry} (the re-read entry), not
//     just {ok: true}. Callers can now observe the actual persisted shape.
//   - C16 (resolve handler ignores updateEntry's null return) is closed: missing
//     entries return failure instead of {resolved: true}.

test("applyUpdateAndCheck returns the re-read entry on success (Phase 3 re-read)", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-write-reread-test-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const { writeEntry } = await import(join(repoRoot(), "tools/learning-loop-mastra/core/meta-state.js"));
    const { applyUpdateAndCheck } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/update-entry-helpers.js")
    );
    await writeEntry(root, {
      id: "meta-reread-target",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta-state-tools",
      description: "Pre-populated finding for applyUpdateAndCheck re-read test (min 20 chars)",
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });

    const outcome = await applyUpdateAndCheck(
      root,
      "meta-reread-target",
      { last_verified_at: new Date().toISOString() },
      "test_applyUpdateAndCheck",
    );

    assert.equal(outcome.ok, true);
    assert.ok(outcome.entry, "Phase 3 re-read returns the persisted entry");
    assert.equal(outcome.entry.id, "meta-reread-target");
    assert.equal(outcome.entry.entry_kind, "finding");
    assert.ok(outcome.entry.last_verified_at, "patch field persisted");
  } finally {
    if (originalEnv === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

test("applyUpdateAndCheck returns version_mismatch failure with current_version", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-write-reread-test-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const { writeEntry } = await import(join(repoRoot(), "tools/learning-loop-mastra/core/meta-state.js"));
    const { applyUpdateAndCheck } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/core/update-entry-helpers.js")
    );
    await writeEntry(root, {
      id: "meta-version-test",
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "meta-state-tools",
      description: "Pre-populated finding for version_mismatch test (min 20 chars)",
      status: "open",
      created_at: new Date().toISOString(),
      version: 0,
    });

    // Wrong version -> version_mismatch + current_version surfaced
    const outcome = await applyUpdateAndCheck(
      root,
      "meta-version-test",
      { status: "resolved", _expected_version: 999 },
      "test_version",
    );

    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, "version_mismatch");
    assert.ok("current_version" in outcome, "current_version exposed for diagnostics");
  } finally {
    if (originalEnv === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalEnv;
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolve handler closes C16: returns failure on missing entry (no silent success)", async () => {
  const root = mkdtempSync(join(tmpdir(), "post-write-reread-test-"));
  const originalEnv = process.env.GATE_ROOT;
  process.env.GATE_ROOT = root;
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const { metaStateResolveTool } = await import(
      join(repoRoot(), "tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js")
    );
    const r = JSON.parse((await metaStateResolveTool.handler({
      id: "meta-does-not-exist",
      resolution: "should not silently succeed on missing entry",
    })).content[0].text);

    assert.equal(r.resolved, false, "missing entry must not silently succeed");
    assert.equal(r.reason, "not_found");
  } finally {
    if (originalEnv === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = originalEnv;
    rmSync(root, { recursive: true, force: true });
  }
});
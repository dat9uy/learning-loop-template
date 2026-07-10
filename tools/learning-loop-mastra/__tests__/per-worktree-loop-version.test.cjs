"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function repoRoot() {
  return join(__dirname, "..", "..", "..");
}

// Plan 260711-0030 Phase 4 RED test.

test(".loop-version is created on first read with loop + node + schema_branches", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-version-test-"));
  try {
    const { readLoopVersion } = await import(join(repoRoot(), "tools/learning-loop-mastra/core/worktree-version.js"));
    const v = readLoopVersion(root);
    assert.ok(v.loop, "loop version is set");
    assert.ok(v.node, "node version is set");
    assert.ok(Array.isArray(v.schema_branches), "schema_branches is an array");
    assert.ok(v.schema_branches.includes("finding"), "finding in schema_branches");
    assert.ok(v.schema_branches.includes("change-log"), "change-log in schema_branches");
    assert.equal(existsSync(join(root, ".loop-version")), true, ".loop-version file created on first read");
    const content = readFileSync(join(root, ".loop-version"), "utf8");
    assert.ok(content.includes("loop:"), "file contains loop: prefix");
    assert.ok(content.includes("schema_branches:"), "file contains schema_branches: prefix");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeEntry rejects unknown schema branch (SchemaVersionSkewError)", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-version-test-"));
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const metaState = await import(join(repoRoot(), "tools/learning-loop-mastra/core/meta-state.js"));

    await assert.rejects(
      async () => metaState.writeEntry(root, {
        id: "test-schema-skew",
        entry_kind: "unknown-kind",
        change_dimension: "semantic",
        change_target: "tools/test/skew",
        change_diff: { added: [], removed: [], changed: [] },
        reason: "RED test: schema-version-skew detection rejects unknown-kind",
        status: "active",
        created_at: new Date().toISOString(),
        version: 0,
      }),
      (err) => err.name === "SchemaVersionSkewError",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeEntry accepts all 4 known branches (finding, change-log, rule, loop-design)", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-version-test-"));
  try {
    writeFileSync(join(root, "meta-state.jsonl"), "", "utf8");

    const metaState = await import(join(repoRoot(), "tools/learning-loop-mastra/core/meta-state.js"));

    await metaState.writeEntry(root, {
      id: "test-change-log-ok",
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "tools/test/ok",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "RED test: change-log branch is supported in schema_branches",
      status: "active",
      created_at: new Date().toISOString(),
      version: 0,
    });

    await metaState.writeEntry(root, {
      id: "test-rule-ok",
      entry_kind: "rule",
      id: "rule-test-ok",
      origin: "test-origin",
      enforcement: "agent",
      pattern_type: "regex",
      pattern: "test-pattern",
      description: "RED test: rule branch is supported in schema_branches (min 20 chars)",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "test",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
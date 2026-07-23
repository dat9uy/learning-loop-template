// notify-artifact-tool.test.js — guards the in-handler records/** path check.
//
// The manifest declares `pathFields: []` for workflow_notify_artifact, so the
// CLI path (bin/loop.mjs hardcodes pathFields:[]) short-circuits the R2 gate.
// The handler restores the records/** ownership check in-handler so every
// transport (MCP, CLI, future) gets the same guard. These tests pin both the
// reject path and the accept path so the guard is not silently regressed.

import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { workflowNotifyArtifactTool as tool } from "../tools/handlers/notify-artifact-tool.js";

test("throws when the path is not under records/**", async () => {
  await assert.rejects(
    () => tool.handler({ path: "docs/runtime-contract.md", change_type: "updated" }),
    /records\/\*\*/,
    "non-records path must be rejected before any gate-log write",
  );
});

test("throws when the path is a bare filename with no records/ prefix", async () => {
  await assert.rejects(
    () => tool.handler({ path: "foo.md", change_type: "created" }),
    /records\/\*\*/,
  );
});

test("accepts a records/** path and logs the match", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "notify-artifact-"));
  const previousGateRoot = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const out = await tool.handler({
      path: "records/product/evidence/foo.md",
      change_type: "updated",
    });
    const payload = JSON.parse(out.content[0].text);
    assert.strictEqual(payload.logged, true);
    assert.deepStrictEqual(payload.matched_workflows, ["evidence-changed"]);
    assert.deepStrictEqual(payload.recommended_next_tools, []);
  } finally {
    if (previousGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = previousGateRoot;
  }
});

test("normalizes a leading ./ before the records/** check", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "notify-artifact-dot-"));
  const previousGateRoot = process.env.GATE_ROOT;
  process.env.GATE_ROOT = tempRoot;
  try {
    const out = await tool.handler({
      path: "./records/product/evidence/bar.md",
      change_type: "updated",
    });
    const payload = JSON.parse(out.content[0].text);
    assert.strictEqual(payload.logged, true);
    assert.deepStrictEqual(payload.matched_workflows, ["evidence-changed"]);
  } finally {
    if (previousGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = previousGateRoot;
  }
});
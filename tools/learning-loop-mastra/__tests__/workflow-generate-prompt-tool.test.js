// workflow-generate-prompt-tool.test.js — pins that the tool actually returns
// a prompt (regression guard for the stale-blueprint-path fix).
//
// The BLUEPRINTS map previously pointed at tools/learning-loop-mcp/references/
// — a directory removed when the package folded into learning-loop-mastra and
// references/ relocated under tools/handlers/. Every call returned
// { error: true, message: "Blueprint file not found" }. These tests prove the
// paths now resolve against the loop repo root for every blueprint category.

import { test } from "vitest";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { workflowGeneratePromptTool as tool } from "../tools/handlers/workflow-generate-prompt-tool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// resolveRoot's DEFAULT_ROOT is the repo root (3 levels above tools/lib/).
// The blueprint paths are repo-root-relative, so pass the repo root explicitly.
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function payload(out) {
  return JSON.parse(out.content[0].text);
}

test("returns a real prompt for the evidence blueprint", async () => {
  const out = await tool.handler({
    blueprint: "evidence",
    skeleton: "generic-learning-loop",
    root: REPO_ROOT,
  });
  assert.ok(!out.isError, `expected success, got error: ${out.content[0].text}`);
  const body = payload(out);
  assert.ok(typeof body.prompt === "string" && body.prompt.length > 0, "prompt text must be non-empty");
  assert.ok(Array.isArray(body.constraints), "derived constraints must be an array");
  assert.ok(Array.isArray(body.required_records), "required_records must be an array");
  assert.ok(Array.isArray(body.suggested_tools), "suggested_tools must be an array");
});

test("every blueprint category resolves a skeleton (no 'Blueprint file not found')", async () => {
  for (const bp of ["evidence", "state-gated", "product-build", "experiment", "runtime-validation"]) {
    const out = await tool.handler({ blueprint: bp, root: REPO_ROOT });
    assert.ok(!out.isError, `blueprint ${bp} returned error: ${out.content[0].text}`);
    const body = payload(out);
    assert.ok(body.prompt && body.prompt.length > 0, `blueprint ${bp} must yield non-empty prompt`);
  }
});

test("rejects an unknown blueprint", async () => {
  const out = await tool.handler({ blueprint: "nope", root: REPO_ROOT });
  assert.ok(out.isError, "unknown blueprint must return an error result");
  assert.match(payload(out).message, /Unknown blueprint/);
});

test("rejects a missing skeleton section", async () => {
  const out = await tool.handler({
    blueprint: "evidence",
    skeleton: "definitely-not-a-real-skeleton-name",
    root: REPO_ROOT,
  });
  assert.ok(out.isError, "missing skeleton must return an error result");
  assert.match(payload(out).message, /Skeleton/);
});
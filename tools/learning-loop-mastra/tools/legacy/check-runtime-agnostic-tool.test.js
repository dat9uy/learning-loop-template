import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { checkRuntimeAgnosticTool } from "./check-runtime-agnostic-tool.js";

let root;
let originalGateRoot;

beforeEach(() => {
  originalGateRoot = process.env.GATE_ROOT;
  root = join(tmpdir(), `check-agnostic-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  process.env.GATE_ROOT = root;

  // Minimal project structure required by the checklist predicates.
  mkdirSync(join(root, "tools/learning-loop-mastra/core"), { recursive: true });
  mkdirSync(join(root, "tools/learning-loop-mastra/tools/legacy"), { recursive: true });
  writeFileSync(
    join(root, "tools/learning-loop-mastra/agent-manifest.json"),
    JSON.stringify({ version: "1.0.0", server: "learning-loop-mcp", groups: {} }, null, 2),
    "utf8",
  );
});

afterEach(() => {
  process.env.GATE_ROOT = originalGateRoot;
  rmSync(root, { recursive: true, force: true });
});

function callTool(feature_path) {
  return checkRuntimeAgnosticTool.handler({ feature_path });
}

function parseResult(result) {
  return JSON.parse(result.content[0].text);
}

await test("tool returns 6/6 pass for a compliant core feature", async () => {
  writeFileSync(
    join(root, "tools/learning-loop-mastra/core/compliant.js"),
    `import { SURFACES } from "./surfaces.js";\nexport function init() { return SURFACES; }\n`,
    "utf8",
  );

  const result = parseResult(await callTool("tools/learning-loop-mastra/core/compliant.js"));

  assert.strictEqual(result.items_checked, 6);
  assert.strictEqual(result.items_passed, 6);
  assert.strictEqual(result.items_failed, 0);
  assert.deepStrictEqual(result.failures, []);
});

await test("tool reports cross-surface-iteration failure for hard-coded surface path", async () => {
  writeFileSync(
    join(root, "tools/learning-loop-mastra/core/bad.js"),
    `import { join } from "node:path";\nexport function read(root) { return join(root, ".claude", "coordination", "x.json"); }\n`,
    "utf8",
  );

  const result = parseResult(await callTool("tools/learning-loop-mastra/core/bad.js"));

  assert.ok(result.items_failed >= 1, `expected at least 1 failure, got ${result.items_failed}`);
  const ids = result.failures.map((f) => f.item_id);
  assert.ok(ids.includes("cross-surface-iteration"), `expected cross-surface-iteration failure, got ${ids.join(", ")}`);
});

await test("tool reports manifest-registered failure for unregistered tool file", async () => {
  writeFileSync(
    join(root, "tools/learning-loop-mastra/tools/legacy/my-feature-tool.js"),
    `export const myFeatureTool = { name: "my_feature", handler: async () => ({}) };\n`,
    "utf8",
  );

  const result = parseResult(await callTool("tools/learning-loop-mastra/tools/legacy/my-feature-tool.js"));

  assert.ok(result.items_failed >= 1, `expected at least 1 failure, got ${result.items_failed}`);
  const ids = result.failures.map((f) => f.item_id);
  assert.ok(ids.includes("manifest-registered"), `expected manifest-registered failure, got ${ids.join(", ")}`);
});

await test("every failure includes a non-empty fix_suggestion", async () => {
  writeFileSync(
    join(root, "tools/learning-loop-mastra/core/bad.js"),
    `import { join } from "node:path";\nexport function read(root) { return join(root, ".claude", "coordination", "x.json"); }\n`,
    "utf8",
  );

  const result = parseResult(await callTool("tools/learning-loop-mastra/core/bad.js"));

  assert.ok(result.failures.length > 0, "expected at least one failure");
  for (const failure of result.failures) {
    assert.ok(failure.fix_suggestion && typeof failure.fix_suggestion === "string" && failure.fix_suggestion.length > 0,
      `fix_suggestion missing for ${failure.item_id}`);
  }
});

await test("tool rejects directory input", async () => {
  mkdirSync(join(root, "tools/learning-loop-mastra/core/dir-feature"), { recursive: true });

  await assert.rejects(
    () => callTool("tools/learning-loop-mastra/core/dir-feature"),
    /is a directory/,
  );
});

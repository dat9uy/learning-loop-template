import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

// 4 test files using `../workflows/` and `../agents/` relative imports (red-team F2)
const TEST_FILES_WITH_RELATIVE_IMPORTS = [
  "tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js",
  "tools/learning-loop-mastra/__tests__/agent-direct-parity.test.js",
  "tools/learning-loop-mastra/__tests__/agent-prompt-content.test.cjs",
  "tools/learning-loop-mastra/__tests__/storage-parity.test.cjs",
];

test("4 parity test files use ../mastra/workflows/ and ../mastra/agents/ relative imports", () => {
  for (const relPath of TEST_FILES_WITH_RELATIVE_IMPORTS) {
    const fullPath = join(PROJECT_ROOT, relPath);
    const content = readFileSync(fullPath, "utf8");
    // After Phase 2, these imports must use the mastra/ prefix
    assert.ok(
      content.includes("../mastra/workflows/") || content.includes("../mastra/agents/"),
      `${relPath} must use ../mastra/workflows/ or ../mastra/agents/ relative imports post-Phase-2`
    );
    // And must NOT have stale bare `../workflows/` or `../agents/` imports
    assert.ok(
      !content.includes("../workflows/") && !content.includes("../agents/"),
      `${relPath} must NOT have stale ../workflows/ or ../agents/ imports post-Phase-2`
    );
  }
});

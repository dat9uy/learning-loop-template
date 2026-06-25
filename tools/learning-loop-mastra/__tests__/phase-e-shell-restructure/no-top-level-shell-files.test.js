import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const SHELL_DIR = "tools/learning-loop-mastra";

// Top-level entries that are allowed to remain (non-shell per Plan 6 D5):
//   storage.js              — Mastra substrate (LibSQL); not shell
//   agent-manifest.json     — legacy tool manifest; not shell
const ALLOWED_TOP_LEVEL_BASENAMES = ["storage.js", "agent-manifest.json"];

test("no shell *.js / *.cjs / *.mjs files at tools/learning-loop-mastra/ top level", () => {
  const result = execSync(
    `find ${SHELL_DIR} -maxdepth 1 \\( -name "*.js" -o -name "*.cjs" -o -name "*.mjs" \\) -type f 2>/dev/null || true`,
    { cwd: PROJECT_ROOT, encoding: "utf8" }
  );
  const files = result
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => {
      const basename = f.split("/").pop();
      return !ALLOWED_TOP_LEVEL_BASENAMES.includes(basename);
    });
  assert.deepStrictEqual(files, [], `shell files at top level (allowlist excluded): ${files.join(", ")}`);
});

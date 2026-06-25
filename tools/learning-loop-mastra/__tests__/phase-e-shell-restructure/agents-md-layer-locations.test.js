import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
const AGENTS_MD = join(PROJECT_ROOT, "AGENTS.md");

test("AGENTS.md §1.1 says shell lives at tools/learning-loop-mastra/mastra/", () => {
  const content = readFileSync(AGENTS_MD, "utf8");
  assert.ok(
    content.includes("tools/learning-loop-mastra/mastra/"),
    `AGENTS.md must reference the new shell path; current content lacks it`
  );
  // The shell layer description must NOT say "(top level)"
  const shellLayerSection = content.match(/\*\*Mastra shell[^*]+\*\*[^*]+/);
  assert.ok(shellLayerSection, "AGENTS.md must contain a 'Mastra shell' section");
  assert.ok(
    !shellLayerSection[0].toLowerCase().includes("(top level)"),
    `AGENTS.md §1.1 must not say 'top level' for the shell; found: ${shellLayerSection[0].slice(0, 200)}`
  );
});

test("AGENTS.md §1.1 has the post-Plan-6 path-invariant sentence", () => {
  const content = readFileSync(AGENTS_MD, "utf8");
  assert.ok(
    content.includes("mastra/") && content.includes("MUST NOT be at the top level"),
    `AGENTS.md must contain the path-invariant sentence; current content lacks it`
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

// Forbidden pre-move shell path patterns (must not appear in production files post-Phase-3)
const FORBIDDEN_PATH_PATTERNS = [
  "tools/learning-loop-mastra/server\\.js",
  "tools/learning-loop-mastra/create-loop-tool\\.js",
  "tools/learning-loop-mastra/create-loop-workflow\\.js",
  "tools/learning-loop-mastra/create-loop-agent\\.js",
  "tools/learning-loop-mastra/legacy-handler-adapter\\.js",
  "tools/learning-loop-mastra/schema-parity\\.js",
  "tools/learning-loop-mastra/schemas\\.js",
];

// Search paths (excludes docs/journals/ + records/ + .cache/ + __tests__/phase-e-shell-restructure/)
const SEARCH_PATHS = [
  ".mcp.json", ".factory/mcp.json", "package.json",
  "AGENTS.md", "README.md", "CLAUDE.md",
  "tools/learning-loop-mastra/interface/",
  "tools/learning-loop-mastra/__tests__/",
  "tools/learning-loop-mastra/agents-manifest.json",
  "tools/learning-loop-mastra/storage.js",
  "tools/scripts/",
  ".claude/skills/", ".factory/skills/",
  ".claude/coordination/", ".factory/hooks/",
  ".claude/coordination/MASTRA_AGENT_MODEL.md",
  "docs/mcp-server-restart-protocol.md",
  "docs/operator-notes/",
  "docs/mcp-tool-schema-architecture.md",
  "docs/project-changelog.md",
];

test("no external refs to pre-move shell paths in production files", () => {
  const grepArgs = FORBIDDEN_PATH_PATTERNS.map((p) => `-e "${p}"`).join(" ");
  const result = execSync(
    `grep -rn ${grepArgs} ${SEARCH_PATHS.map((p) => `"${p}"`).join(" ")} --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" --include="*.md" 2>/dev/null || true`,
    { cwd: PROJECT_ROOT, encoding: "utf8" }
  );
  const lines = result.trim().split("\n").filter(Boolean);
  // Filter out false positives: regression test files themselves
  const filtered = lines.filter((line) =>
    !line.includes("phase-e-shell-restructure/")
  );
  assert.deepStrictEqual(filtered, [], `forbidden shell-path references found:\n${filtered.join("\n")}`);
});

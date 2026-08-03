import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Guard test: the `e2e` project's `include` list must match the files in
// the vitest `include` globs that contain e2e markers (`connectMcpServer` or
// `with-mcp-server`). When a new test file starts spawning the MCP server
// but isn't added to the e2e project's include, this guard fails loud —
// preventing a silent misclassification where an e2e file lands in the
// fast `unit` project.
//
// See `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/` for context.

const SEARCH_DIRS = [
  "tools/learning-loop-mastra/__tests__",
  ".claude/coordination/__tests__",
  ".factory/hooks/__tests__",
  "tools/scripts/__tests__",
];

// Marker pattern catches both the shared helper (`withMcpServer` /
// `connectMcpServer`) and the SDK-direct spawn pattern (`StdioClientTransport`
// + `@modelcontextprotocol/sdk/client`). The latter is used by 3 files that
// bypass the helper and spawn a real MCP server directly — they would
// otherwise silently land in `unit` and inflate pre-commit cost by ~8s.
const MARKER_PATTERN =
  "connectMcpServer|with-mcp-server|StdioClientTransport|@modelcontextprotocol/sdk/client";

function deriveE2EFiles() {
  const result = execFileSync(
    "grep",
    [
      "-rlE",
      MARKER_PATTERN,
      "--include=*.test.js",
      "--include=*.test.cjs",
      "--include=*.test.mjs",
      ...SEARCH_DIRS,
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  return result
    .split("\n")
    .filter(Boolean)
    // Drop the guard test itself (self-reference: this file contains the
    // marker string in its own error message + comment).
    .filter((f) => f !== "tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js")
    .sort();
}

function readConfiguredE2EFiles() {
  const configPath = resolve(projectRoot, "vitest.config.mjs");
  const source = readFileSync(configPath, "utf8");

  // Parse the `E2E_FILES = [...]` array literal. Naive but adequate for our
  // hand-maintained list — fails fast on syntax drift.
  const match = source.match(/const E2E_FILES = \[([\s\S]*?)\];/);
  if (!match) {
    throw new Error(
      `Could not find E2E_FILES constant in ${configPath}. The guard test expects the array literal to be named exactly E2E_FILES.`,
    );
  }

  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"') && line.endsWith('",'))
    .map((line) => line.slice(1, -2))
    .sort();
}

test("e2e project's include list matches grep-derived e2e markers", () => {
  const configured = readConfiguredE2EFiles();
  const derived = deriveE2EFiles();

  // Derived set must be a strict subset of configured (a derived file
  // outside the configured list = drift = the unit project would run it,
  // which is the bug this guard prevents).
  const missingFromConfigured = derived.filter((f) => !configured.includes(f));
  expect(
    missingFromConfigured,
    `Files match e2e markers but are missing from vitest.config.mjs's E2E_FILES array. Add them so they run in the e2e project (not unit):\n${missingFromConfigured.join("\n")}`,
  ).toEqual([]);

  // The configured list should be a strict subset of derived (a file in the
  // configured list that no longer matches markers = stale entry = cleanup
  // signal; we don't fail on it, just surface it as a warning).
  const staleEntries = configured.filter((f) => !derived.includes(f));
  if (staleEntries.length > 0) {
    console.warn(
      `Stale entries in E2E_FILES (no longer match markers):\n${staleEntries.join("\n")}`,
    );
  }

  // Sanity: at least one e2e file exists (otherwise the e2e project is empty
  // and the guard test is itself untested).
  expect(configured.length).toBeGreaterThan(0);
});

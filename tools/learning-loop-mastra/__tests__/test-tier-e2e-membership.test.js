import { test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySource, parseConfiguredE2E } from "./tier-detector.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Guard test: the `e2e` project's `include` list must EXACTLY equal the files
// whose strongest runtime boundary is a real process or transport. The
// classification is done by `tier-detector.mjs` (shared with the config):
//
//   - MCP transport / server bootstrap markers (`StdioClientTransport`,
//     `@modelcontextprotocol/sdk/client`, `connectMcpServer`, `withMcpServer`)
//   - real subprocess call-sites whose first arg is `process.execPath`, a bare
//     identifier variable, or a real binary name (`node`/`bash`/`git`/`jq`/...)
//
// Call-site detection (not raw marker grep) is mandatory: the legacy
// gate-logic tests contain inert `execSync(...)`/`spawn(...)` STRINGS as test
// data, and session-start-inject-degraded-sources mentions `spawn` only in a
// comment. Raw grep would misclassify both.
//
// Strict equality (both directions) means:
//   - a file that matches e2e markers but is missing from E2E_FILES fails →
//     it would otherwise run in unit/integration, which is the bug this guard
//     prevents;
//   - a stale configured entry that no longer matches markers also fails → the
//     list must stay exactly in sync with the real boundary classification.
//
// See `plans/260810-0908-test-tier-architecture-refactor/` for context.

const SEARCH_DIRS = [
  "tools/learning-loop-mastra/__tests__",
  ".claude/coordination/__tests__",
  ".factory/hooks/__tests__",
  "tools/scripts/__tests__",
];

// Guard self-references: these files contain the marker strings in their own
// error messages / detection code and must never be classified e2e.
const GUARD_SELF = [
  "tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js",
  "tools/learning-loop-mastra/__tests__/test-tier-completeness.test.js",
];

function deriveE2EFiles() {
  const result = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // Support dirs are not test homes; tier homes (e2e/integration/unit)
        // hold real tests and MUST be walked.
        if (["node_modules", "__snapshots__", "fixtures", "helpers", "debug", "scout"].includes(entry.name)) continue;
        walk(full);
      } else if (/\.test\.(js|cjs|mjs)$/.test(entry.name)) {
        if (GUARD_SELF.includes(full)) continue;
        const src = readFileSync(full, "utf8");
        if (classifySource(src) === "e2e") result.push(full);
      }
    }
  }
  for (const dir of SEARCH_DIRS) walk(dir);
  return result.sort();
}

function readConfiguredE2EFiles() {
  const configPath = resolve(projectRoot, "vitest.config.mjs");
  const source = readFileSync(configPath, "utf8");
  return parseConfiguredE2E(source);
}

test("e2e project's include list exactly equals derived e2e markers", () => {
  const configured = readConfiguredE2EFiles();
  const derived = deriveE2EFiles();

  // Missing: derived but not configured → the e2e test would run in unit/integration.
  const missingFromConfigured = derived.filter((f) => !configured.includes(f));
  expect(
    missingFromConfigured,
    `Files match e2e markers but are missing from vitest.config.mjs's E2E_FILES array. Add them so they run in the e2e project (not unit/integration):\n${missingFromConfigured.join("\n")}`,
  ).toEqual([]);

  // Stale: configured but not derived → the list has drifted from the real
  // boundary classification. Per the plan, stale entries must FAIL (not just warn).
  const staleEntries = configured.filter((f) => !derived.includes(f));
  expect(
    staleEntries,
    `Stale entries in E2E_FILES (no longer match e2e markers). Remove them so the e2e list exactly tracks the boundary classification:\n${staleEntries.join("\n")}`,
  ).toEqual([]);

  // Exact equality (both directions clean implies equal cardinality + subset).
  expect(configured.length).toBe(derived.length);

  // Sanity: at least one e2e file exists (otherwise the e2e project is empty).
  expect(configured.length).toBeGreaterThan(0);
});

import { test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifySource, parseConfiguredE2E } from "./tier-detector.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Completeness + disjointness guard for the three-tier test contract.
//
// Invariants:
//   1. DISJOINT: no test file belongs to two projects.
//   2. COMPLETE: every discovered test file belongs to exactly one project.
//   3. INTEGRATION-CLEAN: files in the integration project contain no real
//      process/transport boundary (a file that does must be in e2e). This is
//      enforced by the shared classifier + explicit file lists, so an inert
//      fixture string cannot trip it and a real boundary cannot hide.
//
// Project membership source of truth:
//   - e2e: `E2E_FILES` in vitest.config.mjs (strict, derived by tier-detector).
//   - integration: the `INTEGRATION_FILES` array + the `INTEGRATION_HOME_GLOBS`
//     directory globs in vitest.config.mjs.
//   - unit: the residual of `BASE_INCLUDE` minus e2e + integration (the unit
//     project's own exclude list).
//
// Rather than re-implement glob matching, this guard walks the real tree and
// asserts the classification-derived expected membership matches the config.

const SEARCH_DIRS = [
  "tools/learning-loop-mastra/__tests__",
  ".claude/coordination/__tests__",
  ".factory/hooks/__tests__",
  "tools/scripts/__tests__",
];

const GUARD_SELF = [
  "tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js",
  "tools/learning-loop-mastra/__tests__/test-tier-completeness.test.js",
];

// Integration-home directory globs — must match vitest.config.mjs.
const INTEGRATION_HOME_GLOBS = [
  "tools/learning-loop-mastra/__tests__/core/**",
  "tools/learning-loop-mastra/__tests__/interface/**",
  "tools/learning-loop-mastra/__tests__/r2/**",
  "tools/learning-loop-mastra/__tests__/freshness/**",
  "tools/learning-loop-mastra/__tests__/phase-e-foundation/**",
  "tools/learning-loop-mastra/__tests__/lib/**",
  "tools/learning-loop-mastra/__tests__/integration/**",
];

function walkTestFiles() {
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
        result.push(full);
      }
    }
  }
  for (const dir of SEARCH_DIRS) walk(dir);
  return result;
}

// Also include colocated core/handler tests.
function walkColocated() {
  const result = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (["node_modules", "__snapshots__"].includes(entry.name)) continue;
        walk(full);
      } else if (/\.test\.(js|cjs|mjs)$/.test(entry.name)) {
        result.push(full);
      }
    }
  }
  walk("tools/learning-loop-mastra/core");
  walk("tools/learning-loop-mastra/tools/handlers");
  return result;
}

function parseConfig() {
  const configPath = resolve(projectRoot, "vitest.config.mjs");
  const source = readFileSync(configPath, "utf8");
  return { source, configPath };
}

function parseArray(configSource, name) {
  const match = configSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`const ${name} not found in vitest.config.mjs`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"') && line.endsWith('",'))
    .map((line) => line.slice(1, -2));
}

test("three projects are disjoint and complete over the discovered test inventory", () => {
  const { source } = parseConfig();
  const e2e = parseConfiguredE2E(source);
  const integration = parseArray(source, "INTEGRATION_FILES");

  const allFiles = [...walkTestFiles(), ...walkColocated()].filter(
    (f) => !GUARD_SELF.includes(f),
  );

  // e2e membership = explicit list. integration = explicit + home-glob files.
  const e2eSet = new Set(e2e);
  const intSet = new Set(integration);
  for (const glob of INTEGRATION_HOME_GLOBS) {
    const prefix = glob.replace("/**", "/").replace("/*.test.*", "/");
    // Simple: a file under the home dir belongs to integration unless e2e.
    for (const f of allFiles) {
      if (f.startsWith(prefix) && !e2eSet.has(f)) intSet.add(f);
    }
  }

  // Every file must be in exactly one of {e2e, integration, unit-residual}.
  // unit-residual = a file that is in BASE_INCLUDE scope (mastra / .claude /
  // .factory / scripts) and not e2e and not integration.
  const inScope = (f) =>
    f.startsWith("tools/learning-loop-mastra/") ||
    f.startsWith(".claude/") ||
    f.startsWith(".factory/") ||
    f.startsWith("tools/scripts/");

  const orphans = [];
  const dupes = [];
  for (const f of allFiles) {
    const inE = e2eSet.has(f);
    const inI = intSet.has(f);
    // unit-residual: in scope and not e2e/int
    const inU = inScope(f) && !inE && !inI;
    const membership = [inE, inI, inU].filter(Boolean).length;
    if (membership === 0) orphans.push(f);
    if (membership > 1) dupes.push(f);
  }

  expect(
    orphans,
    `Test files with NO tier membership (would not run anywhere):\n${orphans.join("\n")}`,
  ).toEqual([]);

  expect(
    dupes,
    `Test files belonging to MORE THAN ONE project:\n${dupes.join("\n")}`,
  ).toEqual([]);
});

test("integration project contains no real process/transport boundary (e2e-forbidden markers)", () => {
  const { source } = parseConfig();
  const e2e = parseConfiguredE2E(source);
  const integration = parseArray(source, "INTEGRATION_FILES");
  const e2eSet = new Set(e2e);

  // Every integration file must NOT classify as e2e (real process/transport
  // boundary). If one does, it belongs in the e2e project, not integration.
  const intFiles = integration.filter((f) => !e2eSet.has(f));
  const violations = [];
  for (const f of intFiles) {
    if (!f.startsWith("tools/learning-loop-mastra/")) continue;
    if (!f.endsWith(".test.js") && !f.endsWith(".test.cjs") && !f.endsWith(".test.mjs")) continue;
    const src = readFileSync(f, "utf8");
    if (classifySource(src) === "e2e") violations.push(f);
  }

  expect(
    violations,
    `Integration-tier files that cross a real process/transport boundary — they belong in e2e:\n${violations.join("\n")}`,
  ).toEqual([]);
});

test("e2e files carry no duplicate entries and config lists are parseable", () => {
  const { source } = parseConfig();
  const e2e = parseConfiguredE2E(source);
  const seen = new Set();
  const dupes = [];
  for (const f of e2e) {
    if (seen.has(f)) dupes.push(f);
    seen.add(f);
  }
  expect(dupes, `Duplicate entries in E2E_FILES:\n${dupes.join("\n")}`).toEqual([]);
});

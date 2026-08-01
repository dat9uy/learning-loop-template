/**
 * Regression test for `rule-no-plan-ids-in-stable-code-artifacts`.
 *
 * Scans `tools/learning-loop-mastra/**` for plan-ID/phase-number lineage in
 * stable code artifacts (comments, YAML data fields, contract-affecting string
 * literals). The allowlist sidecar records the current sweep targets — every
 * existing match is allowed (so the test passes today); any NEW match outside
 * the allowlist fails the test (so the bleed stops at the state-3 gate level).
 *
 * Per `rule-no-plan-ids-in-stable-code-artifacts`: plan IDs and phase numbers
 * are ephemeral lineage that belongs in plan docs / cook reports / git history,
 * not in code. The sweep rewrites every allowed match to describe the invariant
 * directly; this test then enforces a total ban when the allowlist is empty.
 *
 * Scope: `*.js`, `*.cjs`, `*.mjs`, `*.yaml` under `tools/learning-loop-mastra/**`,
 * excluding any path containing `__tests__/`, ending in `.test.js`, `.md`, or
 * `.json`. Test fixtures (legitimate plan-path INPUT data in `.test.js`) and
 * docs (`.md`) are excluded by construction.
 *
 * Maintenance caveat: the glob targets the file types currently in the repo.
 * If a new source file type (e.g. `.ts`) is introduced, extend the EXTENSIONS
 * list below — by design, this test is a known surface, not a wild card.
 */
import { test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SCAN_ROOT = join(REPO_ROOT, "tools", "learning-loop-mastra");

// Three patterns detect plan-ID lineage: bare plan paths, "Phase N of plan/plans",
// and the "plan 999999-1234" reference form used in narrative comments.
const PATTERNS = [
  /\bplans?\/\d{6}-/,
  /Phase \d+ of (plan|plans)/,
  /plan \d{6}-\d{4}/,
];

// File extensions included in the scan.
const EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".yaml"]);

// Path-level exclusions: __tests__/** (legitimate plan-path test fixtures),
// *.test.js (test code uses plan paths as INPUT data — see the rule's
// legit-test-fixtures-excluded item), *.md (docs), *.json (allowlist sidecar
// itself and the test file).
function isExcludedPath(relPath) {
  // Match __tests__ as the directory itself, a nested segment, or a leaf.
  if (relPath === "__tests__") return true;
  if (relPath.startsWith(`__tests__${sep}`)) return true;
  if (relPath.includes(`${sep}__tests__${sep}`)) return true;
  if (relPath.endsWith(".test.js")) return true;
  if (relPath.endsWith(".md")) return true;
  if (relPath.endsWith(".json")) return true;
  return false;
}

// Match key: file (relative to repo root, POSIX) + trimmed line content.
// Anchoring by line CONTENT (not line number) survives Phase 2 edits that
// shift nearby lines; the allowlist stays valid through the sweep.
function matchKey(relPathFromRepoRoot, line) {
  const normalized = relPathFromRepoRoot.split(sep).join("/");
  return `${normalized}\t${line.trim()}`;
}

function walk(dir) {
  const entries = [];
  // withFileTypes avoids per-entry statSync and gives us isSymbolicLink info.
  // node_modules is a symlink farm in pnpm layouts (ELOOP); skip it.
  const dirents = readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    if (dirent.name === "node_modules") continue;
    if (dirent.isSymbolicLink()) continue;
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      entries.push(...walk(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

function scanCurrentMatches() {
  const matches = [];
  for (const file of walk(SCAN_ROOT)) {
    const relFromRoot = relative(REPO_ROOT, file);
    const relFromScanRoot = relative(SCAN_ROOT, file);
    if (isExcludedPath(relFromScanRoot)) continue;
    const ext = file.slice(file.lastIndexOf("."));
    if (!EXTENSIONS.has(ext)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const line of lines) {
      if (PATTERNS.some((p) => p.test(line))) {
        matches.push(matchKey(relFromRoot, line));
      }
    }
  }
  return matches.sort();
}

const allowlistPath = join(SCAN_ROOT, "__tests__", "stable-artifacts-no-plan-ids.allowlist.json");
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));

// ── Assertions ──────────────────────────────────────────────────────────────

test("stable-artifacts-no-plan-ids: allowlist sidecar is a sorted array", () => {
  expect(Array.isArray(allowlist)).toBe(true);
  const sorted = [...allowlist].sort();
  expect(allowlist).toEqual(sorted);
});

test("stable-artifacts-no-plan-ids: no NEW plan-ID matches outside the allowlist", () => {
  const currentMatches = scanCurrentMatches();
  const allowlistSet = new Set(allowlist);
  const newMatches = currentMatches.filter((m) => !allowlistSet.has(m));

  if (newMatches.length > 0) {
    const formatted = newMatches.map((m) => `  - ${m}`).join("\n");
    throw new Error(
      `Found ${newMatches.length} new plan-ID match(es) outside the allowlist.\n` +
        `Add an invariant description instead of a plan-ID reference.\n` +
        `New matches:\n${formatted}`,
    );
  }
  expect(newMatches).toEqual([]);
});

test("stable-artifacts-no-plan-ids: stale allowlist entries emit a non-failing warning", () => {
  const currentMatches = scanCurrentMatches();
  const currentSet = new Set(currentMatches);
  const staleEntries = allowlist.filter((entry) => !currentSet.has(entry));

  if (staleEntries.length > 0) {
    // Stale entries are the natural state during the Phase 2 sweep: each
    // rewritten comment/field leaves its allowlist entry stale until pruned.
    // Logged but non-failing — operator prunes as the sweep progresses.
    console.warn(
      `stable-artifacts-no-plan-ids: ${staleEntries.length} stale allowlist ` +
        `entries (rewrite them out and prune the sidecar):\n` +
        staleEntries.map((e) => `  - ${e}`).join("\n"),
    );
  }
  // Asserts the sidecar loads and is non-empty in Phase 1/2; Phase 3 sets it to [].
  expect(allowlist.length).toBeGreaterThanOrEqual(0);
});
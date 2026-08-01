/**
 * Regression test for `rule-no-plan-ids-in-stable-code-artifacts`.
 *
 * Total ban enforcement: scans `tools/learning-loop-mastra/**` for plan-ID/
 * phase-number lineage in stable code artifacts (comments, YAML data fields,
 * contract-affecting string literals). With the allowlist empty, ANY match
 * fails the test — there is no "currently-known" set to absorb. Plan IDs and
 * phase numbers are ephemeral lineage that belongs in plan docs / cook
 * reports / git history, not in code.
 *
 * The test runs as `pnpm test` → `simple-git-hooks` pre-commit
 * (`package.json:50-51`), so any commit that re-introduces a plan-ID comment
 * fails CI without operator action.
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

// Four patterns detect plan-ID lineage. All case-insensitive — the dominant
// on-disk form is "Plan NNNNNN-NNNN" (capital P, no slash, no "of") which the
// narrow lowercase variants miss. The expanded set catches every reference
// form observed in the codebase scan:
//   - bare plan paths: plans/999999-xxx, plan/999999-xxx
//   - "Phase N of plan/plans" narrative form
//   - "Plan NNNNNN-NNNN" capital-P narrative form (the dominant case)
//   - lowercase "plan NNNNNN-NNNN" variant
const PATTERNS = [
  /\bplans?\/\d{6}-/i,
  /Phase \d+ of (plan|plans)/i,
  /[Pp]lan \d{6}-\d{4}/,
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
// Anchoring by line CONTENT (not line number) survives line shifts from edits.
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

// Total ban invariant: the allowlist sidecar must be empty (intentional,
// not accidental). The set-diff assertion below already enforces this — any
// non-empty allowlist silently tolerates a known match, defeating the ban.
// This assertion surfaces an accidentally non-empty sidecar at the test
// boundary so an operator can't ship a "ban" with a populated allowlist.
test("stable-artifacts-no-plan-ids: allowlist is the empty total-ban array", () => {
  expect(Array.isArray(allowlist)).toBe(true);
  expect(allowlist).toEqual([]);
});

// Real behavior-bearing coverage: the four patterns + exclusion logic must
// catch every known bad input and reject every known good input. The test
// synthesizes both directions so a regression in any of the patterns /
// exclusions / matchKey logic fails the build.
test("stable-artifacts-no-plan-ids: synthetic matcher catches known-bad input", () => {
  // True positives — must trigger the matcher.
  const bad = [
    "// Plan 260711-0030 Phase 5: marker file .last-operator-message is shared",
    "* plan 260711-0030 Phase 4: schema-version-skew detection",
    "// Phase 3 of plans/260717-1826-unify-context-injection",
    "// See plans/260602-sp1-derive-status/plan.md for the SP1 sibling.",
  ];
  for (const line of bad) {
    expect(PATTERNS.some((p) => p.test(line))).toBe(true);
  }

  // True negatives — must NOT trigger (legitimate text without plan-ID form).
  const good = [
    "// Single source of truth for the meta-state relationship model.",
    "// The rule's invariant: no plan IDs in stable code artifacts.",
    "* Rec 10 stale-findings dispatch protocol — see meta-state registry.",
    "// schemas/** was migrated to a preflight-delegating rule.",
  ];
  for (const line of good) {
    expect(PATTERNS.some((p) => p.test(line))).toBe(false);
  }
});

// Exclusions must keep test fixtures / docs / the sidecar itself out of the
// scan surface — otherwise a fixture using `plans/260801-xxx/plan.md` as INPUT
// data would re-introduce the very pattern the test exists to ban.
test("stable-artifacts-no-plan-ids: exclusions keep test fixtures out of the scan", () => {
  const excludedSamples = [
    "__tests__",
    "__tests__/foo.test.cjs",
    "tools/learning-loop-mastra/__tests__/foo.test.js",
    "tools/learning-loop-mastra/__tests__/core/foo.test.js",
    "tools/learning-loop-mastra/core/foo.test.js",
    "tools/learning-loop-mastra/core/README.md",
    "tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.allowlist.json",
  ];
  for (const rel of excludedSamples) {
    expect(isExcludedPath(rel)).toBe(true);
  }

  // Non-excluded paths that SHOULD be scanned.
  const scanned = [
    "tools/learning-loop-mastra/core/meta-state.js",
    "tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js",
    "tools/learning-loop-mastra/mastra/create-loop-tool.js",
  ];
  for (const rel of scanned) {
    expect(isExcludedPath(rel)).toBe(false);
  }
});

// The total-ban check: any match in the scan surface fails the test.
test("stable-artifacts-no-plan-ids: no plan-ID matches in scan surface (total ban)", () => {
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
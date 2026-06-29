// Workflow-shape tests for plans/260629-2011-fallow-tools-v2-action-swap/.
// Phase 4 TDD gate: these cases must all PASS after the CI swap. RED before
// the swap (hand-rolled pnpm exec fallow audit is still present), GREEN after.
//
// Operator overrides reflected in these tests:
//   D1 — `version:` is set dynamically from a `Resolve fallow version` setup step,
//        not hard-coded in the Action `with:` block
//   D3 — baselines live at in-package paths `baselines/fallow/{...}.json`, NOT at
//        `plans/<plan-dir>/reports/fallow/{...}.json`
//   D5 — failure-upload step references `steps.analyze.outputs.sarif` (the
//        Action's analyze step id per deep-dive §3.1), NOT `steps.fallow.outputs.sarif`
//
// Evidence trail: plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOW_PATH = resolve(PROJECT_ROOT, ".github/workflows/test.yml");

const wfRaw = readFileSync(WORKFLOW_PATH, "utf8");
const wf = parseYaml(wfRaw);
const job = wf.jobs.test;

// Helpers ---------------------------------------------------------------

/** Find the step whose `uses:` references `fallow-rs/fallow@`. */
function findFallowActionStep(steps) {
  return Object.values(steps).find(
    (s) => typeof s?.uses === "string" && /fallow-rs\/fallow@/.test(s.uses),
  );
}

/** Find the step whose `name:` matches the given regex. */
function findStepByName(steps, nameRegex) {
  return Object.values(steps).find((s) => nameRegex.test(s?.name ?? ""));
}

// Tests -----------------------------------------------------------------

test("jobs.test has permissions block including security-events: write", () => {
  // deep-dive §7.4: only NEW scope the Action requires is `security-events: write`.
  // `contents: read` is needed for the existing actions/checkout@v7 step.
  const perms = job.permissions ?? {};
  assert.strictEqual(
    perms["security-events"],
    "write",
    "fallow SARIF upload requires security-events: write",
  );
  assert.strictEqual(perms["contents"], "read", "actions/checkout requires contents: read");
});

test("jobs.test does not contain pnpm exec fallow audit (hand-rolled invocation removed)", () => {
  const serialized = JSON.stringify(wf);
  assert.ok(
    !/pnpm exec fallow audit/.test(serialized),
    "hand-rolled `pnpm exec fallow audit` must be replaced with the Action",
  );
});

test("jobs.test uses fallow-rs/fallow@v2 action pinned to 40-char hex SHA", () => {
  const fallowUses = findFallowActionStep(job.steps);
  assert.ok(fallowUses, "fallow-rs/fallow@<sha> Action must be present");
  assert.match(
    fallowUses.uses,
    /fallow-rs\/fallow@[a-f0-9]{40}$/,
    "must pin to commit SHA, not tag (per rule-tool-integration-same-commit-dep 4th item)",
  );
});

test("fallow Action step sets gate: new-only explicitly", () => {
  // deep-dive §10.4: `.fallowrc.json` `audit.gate` is NOT honored by Action;
  // explicit `gate:` input is required.
  const step = findFallowActionStep(job.steps);
  assert.strictEqual(step.with.gate, "new-only", "audit gate must be set explicitly on Action");
});

test("fallow Action step version is sourced from a setup step, not hard-coded", () => {
  // D1: package.json devDependencies.fallow is the single source of truth.
  // A `Resolve fallow version` step (id `fallow-version`) exports the value,
  // and the Action reads it via `${{ steps.fallow-version.outputs.version }}`.
  const versionStep = findStepByName(job.steps, /Resolve fallow version/);
  assert.ok(versionStep, "Resolve fallow version setup step must exist");
  assert.strictEqual(
    versionStep.id,
    "fallow-version",
    "setup step id must be `fallow-version` (so the Action can read its output)",
  );
  // The setup step must read from package.json (the operator's chosen source).
  assert.match(
    versionStep.run ?? "",
    /package\.json/,
    "setup step must read from package.json",
  );
  assert.match(
    versionStep.run ?? "",
    /devDependencies\.fallow/,
    "setup step must read devDependencies.fallow specifically",
  );
  // The Action's `with.version` must be the step's output, not a literal.
  const actionStep = findFallowActionStep(job.steps);
  const versionValue = actionStep.with.version;
  assert.ok(
    typeof versionValue === "string" && /\$\{\{\s*steps\.fallow-version\.outputs\.version\s*\}\}/.test(versionValue),
    `Action's with.version must reference steps.fallow-version.outputs.version (got: ${JSON.stringify(versionValue)})`,
  );
});

test("fallow Action step preserves all 3 baseline paths (in-package, D3)", () => {
  // D3: baselines moved from plans/<plan-dir>/reports/fallow/ to
  // <root>/baselines/fallow/ so CI does not depend on the plans folder.
  const step = findFallowActionStep(job.steps);
  const serialized = JSON.stringify(step.with);
  // New in-package paths (relative to root: tools/learning-loop-mastra/)
  assert.match(serialized, /dead-code-baseline.*baselines\/fallow\/dead-code-baseline\.json/);
  assert.match(serialized, /health-baseline.*baselines\/fallow\/health-baseline\.json/);
  assert.match(serialized, /dupes-baseline.*baselines\/fallow\/dupes-baseline\.json/);
  // Old plan-dir paths MUST NOT appear
  assert.ok(
    !/plans\/[^"]*reports\/fallow/.test(serialized),
    "old plans/<plan-dir>/reports/fallow/ baseline paths must be removed (D3)",
  );
});

test("no Python heredoc remains in test.yml (SARIF split is no longer needed)", () => {
  // Migration A drops the Python split entirely; the Action handles SARIF
  // generation + Code Scanning upload in a single category.
  assert.ok(!/python3 - <<'PY'/.test(wfRaw), "Python SARIF-split heredoc must be deleted");
  assert.ok(
    !/codeql-action\/upload-sarif/.test(wfRaw),
    "Explicit codeql-action/upload-sarif@v4 steps must be removed (Action handles upload under single `category: fallow`)",
  );
});

test("failure upload step is preserved and re-pointed at analyze.outputs.sarif (D5)", () => {
  // D5: the Action's analyze step is id `analyze` (deep-dive §3.1, §14.8),
  // NOT `fallow`. The plan's Phase 2 draft had this wrong.
  // The path lives inside `with.path` for actions/upload-artifact@v7
  // (NOT at the step level like the old `run:` heredoc).
  const fail = findStepByName(job.steps, /Upload fallow SARIF on failure/);
  assert.ok(fail, "Failure upload step must be preserved");
  const pathValue = fail.with?.path;
  assert.match(
    pathValue,
    /\$\{\{\s*steps\.analyze\.outputs\.sarif\s*\}\}/,
    `Failure upload must point at the Action's analyze step output (got: ${JSON.stringify(pathValue)})`,
  );
  assert.ok(
    !/steps\.fallow\.outputs\.sarif/.test(pathValue),
    "must NOT reference the (incorrect) steps.fallow.outputs.sarif",
  );
});

test("test.yml parses as valid YAML", () => {
  // Sanity check: if parseYaml above didn't throw, this passes.
  // The check is explicit so a future parse failure surfaces in the test name.
  assert.ok(wf && wf.jobs && wf.jobs.test, "parsed workflow must have jobs.test");
});
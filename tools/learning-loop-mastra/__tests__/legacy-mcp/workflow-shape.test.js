// Workflow-shape tests for plans/260629-2011-fallow-tools-v2-action-swap/.
// Phase 4 TDD gate: these cases must all PASS after the CI swap. RED before
// the swap (hand-rolled pnpm exec fallow audit is still present), GREEN after.
//
// Amendment plan 260630-0536-fallow-action-swap-with-sarif-split:
// The Action's built-in SARIF upload is disabled (`sarif: false`). An inline
// jq patch step rewrites `runs[i].automationDetails.id` on runs where it's
// null so codeql-action v4's areAllRunsUnique validator accepts the multi-run
// SARIF. A single explicit `codeql-action/upload-sarif@v4` call uploads the
// patched file under `category: fallow`. The failure-upload step points at the
// patched file so failure artifacts contain the patched SARIF.
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
// Amendment source: plans/reports/research-260630-1425-GH-2011-fallow-sarif-internals-audit.md

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

test("no Python heredoc remains; exactly one codeql-action/upload-sarif call (SHA-pinned) (T7-update)", () => {
  // Amendment: Action handles SARIF generation locally; the workflow itself
  // adds an explicit codeql-action/upload-sarif call AFTER patching the file.
  // Python heredoc must be deleted; the upload call must appear exactly once
  // and be SHA-pinned per rule-tool-integration-same-commit-dep item 4.
  assert.ok(!/python3 - <<'PY'/.test(wfRaw), "Python SARIF-split heredoc must be deleted");
  // Match only `uses:` declarations, not comments referencing the action.
  const uploadCalls =
    wfRaw.match(/^\s*uses:\s*github\/codeql-action\/upload-sarif@/gm) ?? [];
  assert.strictEqual(
    uploadCalls.length,
    1,
    `Expected exactly 1 codeql-action/upload-sarif uses: declaration (got ${uploadCalls.length})`,
  );
  // The single occurrence must be SHA-pinned to a 40-hex SHA, not @v4
  const sarifMatch = wfRaw.match(/uses:\s*github\/codeql-action\/upload-sarif@[^\s]+/);
  assert.ok(sarifMatch, "codeql-action/upload-sarif step must declare uses:");
  assert.match(
    sarifMatch[0],
    /github\/codeql-action\/upload-sarif@[a-f0-9]{40}$/,
    `codeql-action/upload-sarif must be SHA-pinned to 40-hex (got: ${sarifMatch[0]})`,
  );
});

test("failure upload step points at patched SARIF path (T8-update)", () => {
  // Amendment: the patch step writes alongside the input as
  // `<input>.patched.sarif`. The failure upload step's path must reference the
  // patched file (so failure artifacts contain the file actually uploaded to
  // Code Scanning), NOT the raw Action output.
  const fail = findStepByName(job.steps, /Upload fallow SARIF on failure/);
  assert.ok(fail, "Failure upload step must be preserved");
  const pathValue = fail.with?.path;
  assert.match(
    pathValue,
    /fallow-results-patched\.sarif/,
    `Failure upload must point at the patched SARIF (got: ${JSON.stringify(pathValue)})`,
  );
  // Old ${{ steps.analyze.outputs.sarif }} reference must be gone — the
  // analyze step now has `id: analyze` but its output is the raw file; we
  // want the patched file in the failure artifact.
  assert.ok(
    !/steps\.analyze\.outputs\.sarif/.test(pathValue),
    "Failure upload must NOT reference the raw analyze step output",
  );
});

test("test.yml parses as valid YAML", () => {
  // Sanity check: if parseYaml above didn't throw, this passes.
  // The check is explicit so a future parse failure surfaces in the test name.
  assert.ok(wf && wf.jobs && wf.jobs.test, "parsed workflow must have jobs.test");
});

// Amendment T10-T15: tests for the SARIF patch + single-upload design
// (plan 260630-0536-fallow-action-swap-with-sarif-split phase 2).

test("fallow Action has `sarif: false` (Action's built-in upload disabled) (T10-new)", () => {
  // Amendment: the Action's internal codeql-action/upload-sarif step is
  // disabled by `sarif: false`. The workflow's own explicit upload step is the
  // one that ingests the patched SARIF. Without this flip, the Action's
  // built-in upload hits codeql-action's areAllRunsUnique rejection on
  // fallow's multi-run SARIF.
  const step = findFallowActionStep(job.steps);
  assert.strictEqual(
    step.with.sarif,
    false,
    "fallow Action must set sarif: false (Action's built-in upload must be disabled)",
  );
});

test("fallow Action has `id: analyze` so steps.analyze.outputs.sarif resolves (T15-new)", () => {
  // Without `id: analyze`, `${{ steps.analyze.outputs.sarif }}` resolves to
  // empty string — the patch step would read an empty path and the
  // failure-upload step would silently produce empty files.
  const step = findFallowActionStep(job.steps);
  assert.strictEqual(
    step.id,
    "analyze",
    `fallow Action must declare id: analyze (got: ${JSON.stringify(step.id)})`,
  );
});

test("inline jq patch step present with automationDetails classifier (T11-new)", () => {
  // Amendment: a step named "Patch fallow SARIF per analyzer (jq)" must run
  // after the Action. It uses jq to rewrite automationDetails.id per run so
  // codeql-action's areAllRunsUnique validator accepts the multi-run SARIF.
  const patchStep = findStepByName(job.steps, /Patch fallow SARIF per analyzer/);
  assert.ok(patchStep, "Patch step must be present");
  const runBlock = patchStep.run ?? "";
  assert.match(runBlock, /jq\s/, "patch step must invoke jq");
  assert.match(
    runBlock,
    /\.automationDetails/,
    "patch step must reference .automationDetails in the jq expression",
  );
  // Classifier prefixes — the dead-code/health/dupes routing.
  assert.match(
    runBlock,
    /fallow\/audit\/(dead-code|health|dupes)/,
    "patch step must classify runs into dead-code/health/dupes",
  );
});

test("patch step reads from the Action's analyze step output (T12-new)", () => {
  // Amendment: the patch step must read SARIF_INPUT from steps.analyze.outputs.sarif
  // (the Action's SARIF output), NOT from a hardcoded path. Accepts either the
  // full expression or the artifacts-dir default fallback.
  const patchStep = findStepByName(job.steps, /Patch fallow SARIF per analyzer/);
  assert.ok(patchStep, "Patch step must be present");
  const runBlock = patchStep.run ?? "";
  assert.match(
    runBlock,
    /steps\.analyze\.outputs\.sarif/,
    "patch step must read from steps.analyze.outputs.sarif",
  );
});

test("exactly 1 explicit codeql-action/upload-sarif call with category: fallow (T13-new)", () => {
  // Amendment: the upload step must use category: fallow and point at the
  // patched SARIF file (not the raw Action output).
  const uploadStep = findStepByName(job.steps, /Upload fallow SARIF to Code Scanning/);
  assert.ok(uploadStep, "explicit Upload fallow SARIF to Code Scanning step must exist");
  assert.strictEqual(
    uploadStep.with?.category,
    "fallow",
    `Upload step must set category: fallow (got: ${JSON.stringify(uploadStep.with?.category)})`,
  );
  assert.match(
    uploadStep.with?.sarif_file ?? "",
    /fallow-results-patched\.sarif/,
    `Upload step's sarif_file must reference patched SARIF (got: ${JSON.stringify(uploadStep.with?.sarif_file)})`,
  );
});

test("no per-analyzer upload categories leaked (T14-new)", () => {
  // Amendment: per-analyzer Code Scanning categories are deferred (F-7, after
  // F-6 lands upstream). No `category: fallow-deadcode` / `fallow-health` /
  // `fallow-dupes` should appear anywhere in the workflow.
  assert.ok(
    !/fallow-deadcode/.test(wfRaw),
    "per-analyzer category fallow-deadcode must not appear (D2: single `category: fallow`)",
  );
  assert.ok(
    !/fallow-health/.test(wfRaw),
    "per-analyzer category fallow-health must not appear (D2: single `category: fallow`)",
  );
  assert.ok(
    !/fallow-dupes/.test(wfRaw),
    "per-analyzer category fallow-dupes must not appear (D2: single `category: fallow`)",
  );
});

test("patch step + upload step are PR-gated (do not run on push to main) (T17-new)", () => {
  // Regression guard for the post-merge CI failure on main (run 28444039075).
  // The fallow Action is gated `if: github.event_name == 'pull_request'`, so
  // steps.analyze.outputs.sarif is empty on push events. Without PR-only
  // gating, the patch step's `realpath` would crash on `${""%.sarif}-patched.sarif`
  // = `-patched.sarif` (parses `-p` as an option).
  const patchStep = findStepByName(job.steps, /Patch fallow SARIF per analyzer/);
  assert.ok(patchStep, "Patch step must be present");
  assert.match(
    patchStep.if ?? "",
    /github\.event_name\s*==\s*['"]pull_request['"]/,
    `Patch step must be gated to pull_request events (got: ${JSON.stringify(patchStep.if)})`,
  );
  const uploadStep = findStepByName(job.steps, /Upload fallow SARIF to Code Scanning/);
  assert.ok(uploadStep, "Upload step must be present");
  assert.match(
    uploadStep.if ?? "",
    /github\.event_name\s*==\s*['"]pull_request['"]/,
    `Upload step must be gated to pull_request events (got: ${JSON.stringify(uploadStep.if)})`,
  );
});

test("patch step guards empty SARIF input (belt-and-suspenders for PR-gating) (T18-new)", () => {
  // Belt-and-suspenders: even if the PR-only `if:` is removed in a future
  // refactor, the patch step's `run:` block must short-circuit on empty
  // SARIF input BEFORE the realpath call that crashes on `-patched.sarif`.
  const patchStep = findStepByName(job.steps, /Patch fallow SARIF per analyzer/);
  assert.ok(patchStep, "Patch step must be present");
  const runBlock = patchStep.run ?? "";
  // The empty-input guard must come BEFORE the realpath line.
  const emptyGuardIdx = runBlock.search(/SARIF_INPUT\s*=\s*"\$\{\{\s*steps\.analyze\.outputs\.sarif\s*\}\}"/);
  const realpathIdx = runBlock.search(/realpath\s+--relative-base/);
  assert.ok(emptyGuardIdx >= 0, "Patch step must read SARIF_INPUT from steps.analyze.outputs.sarif");
  assert.ok(realpathIdx > 0, "Patch step must use realpath for output path canonicalization");
  // After the SARIF_INPUT assignment, there must be an empty/empty-file guard
  // BEFORE the realpath call.
  const between = runBlock.slice(emptyGuardIdx, realpathIdx);
  assert.match(
    between,
    /if\s+\[\s*-z\s+"\$\{?SARIF_INPUT\}?"\s*\]\s*\|\|\s*\[\s*!\s*-s\s+"\$\{?SARIF_INPUT\}?"\s*\]/,
    "Patch step must guard empty/empty-file SARIF_INPUT before realpath call",
  );
});
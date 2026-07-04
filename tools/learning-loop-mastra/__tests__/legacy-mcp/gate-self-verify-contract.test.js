// TDD contract tests for tools/learning-loop-mastra/scripts/gate-self-verify.mjs.
// Plan: plans/260704-0933-issue-34-fallow-self-verify (issue #34).
//
// These tests lock the wrapper's *contract surface* — script presence,
// package.json registration, caveat string, ordered sub-command sequence —
// not its end-to-end pipeline (which CI exercises). RED before Phase 2 ships
// the wrapper; GREEN after.

import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const SCRIPT_PATH = resolve(
  PROJECT_ROOT,
  "tools/learning-loop-mastra/scripts/gate-self-verify.mjs",
);
const PACKAGE_JSON = resolve(PROJECT_ROOT, "package.json");

const CAVEAT_FRAGMENT =
  "local `pnpm fallow:gate` is not a reliable pre-push check for complexity findings";

test("script exists at canonical path", () => {
  assert.ok(
    existsSync(SCRIPT_PATH),
    `expected wrapper at ${SCRIPT_PATH}; issue #34 acceptance criterion`,
  );
});

test("package.json registers gate:self-verify", () => {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8"));
  const cmd = pkg.scripts?.["gate:self-verify"];
  assert.ok(
    typeof cmd === "string" && cmd.length > 0,
    "package.json must register scripts.gate:self-verify",
  );
  assert.ok(
    cmd.includes("gate-self-verify.mjs"),
    "gate:self-verify must delegate to the new wrapper script",
  );
});

test("script prints the local-verification caveat verbatim", () => {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  assert.ok(
    src.includes(CAVEAT_FRAGMENT),
    "wrapper must emit the issue #34 caveat phrase verbatim so the contract is grep-able",
  );
});

test("script refreshes file-index fingerprints before delegating to fallow", () => {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  assert.ok(
    /seed-file-index\.mjs|meta_state_refresh_file_index|refresh_file_index/.test(src),
    "wrapper must call the file-index seeder (or meta_state_refresh_file_index) before fallow",
  );
  // Ordering invariant: within the STEPS array (the execution surface, not JSDoc/
  // comments), the seed step's args list must appear before the fallow step's
  // args list. We slice from the first STEPS-array entry to the end so we're
  // only inspecting the actual execution surface.
  const stepsIdx = src.indexOf("const STEPS = [");
  assert.ok(stepsIdx > -1, "wrapper must define a STEPS array");
  const executionSurface = src.slice(stepsIdx);
  const refreshIdx = executionSurface.indexOf("seed-file-index.mjs");
  const fallowIdx = executionSurface.indexOf('"fallow:gate"');
  assert.ok(
    refreshIdx > -1,
    "wrapper must reference seed-file-index.mjs in the STEPS array",
  );
  assert.ok(
    fallowIdx > -1,
    "wrapper must reference fallow:gate in the STEPS array",
  );
  assert.ok(
    refreshIdx < fallowIdx,
    `fingerprint refresh must precede fallow delegation in STEPS array (refresh @${refreshIdx}, fallow @${fallowIdx})`,
  );
});

test("script delegates to fallow:gate after coverage regeneration", () => {
  const src = readFileSync(SCRIPT_PATH, "utf8");
  assert.ok(
    /fallow:gate|fallow audit/.test(src),
    "wrapper must invoke fallow:gate (or fallow audit) after fingerprint refresh",
  );
  assert.ok(
    /pnpm test|node .* run-pnpm-test/.test(src),
    "wrapper must run pnpm test to regenerate c8 Istanbul coverage before fallow",
  );
});

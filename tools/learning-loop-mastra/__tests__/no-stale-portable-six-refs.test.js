// Durable guard: after the portable-six unwrap, the 6 re-homed tools must
// have ZERO remaining `run_workflow_<x>` references (code, tests, docs,
// comments) outside excluded paths. The 6 are now mastra_workflow_<x> on MCP
// / workflow_<x> on CLI. Only the 2 storage workflows keep the run_workflow_*
// prefix. Historical plans/ records are stateful and excluded by design.
import { test } from "vitest";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");

const PORTABLE_SIX = [
  "run_workflow_classify_prompt",
  "run_workflow_prepare_runtime_request",
  "run_workflow_self_improvement",
  "run_workflow_intentional_skip",
  "run_workflow_report_phase_status",
  "run_workflow_runtime_probe",
];

test("no stale run_workflow_* refs for the portable six in active code or docs", () => {
  const pattern = PORTABLE_SIX.join("|");
  let out = "";
  try {
    out = execFileSync(
      "grep",
      [
        "-rn", "-E", pattern,
        "--include=*.js", "--include=*.cjs", "--include=*.mjs",
        "--include=*.json", "--include=*.md",
        "--exclude-dir=node_modules", "--exclude-dir=.git",
        "--exclude-dir=.claude", "--exclude-dir=plans",
        "--exclude-dir=coverage", "--exclude-dir=records",
        "--exclude-dir=.test-logs",
        REPO_ROOT,
      ],
      { encoding: "utf8" },
    );
  } catch (e) {
    // grep exit 1 = no matches (the desired outcome)
    if (e.status !== 1) throw e;
    out = "";
  }
  const hits = out
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => !line.includes("no-stale-portable-six-refs.test.js"));
  assert.deepStrictEqual(
    hits,
    [],
    `stale run_workflow_* references for the portable six (rename to mastra_workflow_*):\n${hits.join("\n")}`,
  );
});

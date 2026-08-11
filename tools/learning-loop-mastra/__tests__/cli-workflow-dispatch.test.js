// CLI dispatch smoke for the 6 portable-six tools re-homed to plain manifest
// handlers: each must dispatch via `bin/loop.mjs workflow_<x> '<json>'` (the
// CLI is the single record surface) and return the Phase-1 oracle-fixture output.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");
const FIXTURES_DIR = join(__dirname, "fixtures", "workflow-oracles");

const SIX = [
  "classify_prompt",
  "prepare_runtime_request",
  "self_improvement",
  "intentional_skip",
  "report_phase_status",
  "runtime_probe",
];

for (const id of SIX) {
  test(`cli dispatch: workflow_${id} output matches the oracle fixture`, () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, `workflow_${id}.json`), "utf8"));
    const tmpRoot = mkdtempSync(join(tmpdir(), "cli-workflow-dispatch-"));
    const proc = spawnSync(
      "node",
      [LOOP_BIN, `workflow_${id}`, JSON.stringify(fixture.behavior.plain.input)],
      {
        env: {
          ...process.env,
          LOOP_SURFACE: ".claude",
          GATE_ROOT: tmpRoot,
          MASTRA_STORAGE_DRIVER: "memory",
        },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    assert.strictEqual(proc.status, 0, `cli workflow_${id} must exit 0; stderr=${proc.stderr}`);
    assert.deepStrictEqual(JSON.parse(proc.stdout), fixture.behavior.plain.output);
  });
}

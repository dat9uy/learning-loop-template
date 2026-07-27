// cli-context-savings-script.test.js — shape contract for the CLI savings
// measurement script.
//
// The script's --record path mutates the loop's ledger; this test only
// exercises the default (no-flag) run that prints JSON. Shape contract:
//   - required keys present (measured_at, cli_tool_count, dropped_def_bytes,
//     banner_bytes, savings_bytes, savings_pct, per_tool)
//   - sane numeric ranges (savings > 0 if the wire-byte formula counts)
//   - cli_tool_count matches CLI_TOOLS.size (the union membership invariant)
//   - banner_bytes == max(readsOnly, recordsViaCli)
//
// Default run leaves the registry untouched (no --record), so the test does
// not need a preflight marker or seed registry.

import { test, expect } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_TOOLS } from "../core/cli-tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SCRIPT_PATH = join(PROJECT_ROOT, "tools", "scripts", "measure-cli-context.mjs");

test("measure:context default run prints required keys with sane ranges", { timeout: 60000 }, () => {
  const proc = spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE ?? ".claude", GATE_ROOT: PROJECT_ROOT },
    encoding: "utf8",
    timeout: 45000,
  });
  assert.strictEqual(proc.status, 0, `script exited ${proc.status}; stderr=${proc.stderr}`);
  const payload = JSON.parse(proc.stdout);
  for (const key of [
    "measured_at",
    "cli_tool_count",
    "dropped_def_bytes",
    "banner_bytes",
    "savings_bytes",
    "savings_pct",
    "per_tool",
    "banner_bytes_reads_only",
    "banner_bytes_records_via_cli",
  ]) {
    assert.ok(key in payload, `required key missing: ${key}`);
  }
  assert.strictEqual(payload.cli_tool_count, CLI_TOOLS.size, "cli_tool_count must match CLI_TOOLS.size");
  assert.ok(payload.dropped_def_bytes > 0, `dropped_def_bytes must be > 0; got ${payload.dropped_def_bytes}`);
  assert.ok(payload.savings_bytes > 0, `savings_bytes must be > 0; got ${payload.savings_bytes}`);
  assert.ok(payload.savings_pct > 0 && payload.savings_pct < 100, `savings_pct must be in (0,100); got ${payload.savings_pct}`);
  assert.strictEqual(
    payload.banner_bytes,
    Math.max(payload.banner_bytes_reads_only, payload.banner_bytes_records_via_cli),
    "banner_bytes must equal max of the two variants",
  );
  // per_tool is descending by bytes (matches computeCliContextSavings contract).
  const bytes = payload.per_tool.map((r) => r.bytes);
  for (let i = 1; i < bytes.length; i += 1) {
    assert.ok(bytes[i - 1] >= bytes[i], `per_tool must be sorted desc by bytes; got ${JSON.stringify(bytes)}`);
  }
  expect(payload).toMatchSnapshot({
    measured_at: expect.any(String),
  });
});

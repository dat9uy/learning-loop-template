// cli-bare-key-json-hint.test.js — bare-key JSON (`{surface:"x"}`) fails
// JSON.parse and previously exited 2 with a bare `invalid JSON: ...` and no
// fix hint, sending the agent on a --schema detour. These tests pin the
// self-correcting behavior: a quoted-keys hint naming the fix, only on the
// bare-key shape, on both the inline and --args-file parse paths.

import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const LOOP_BIN = join(PROJECT_ROOT, "tools", "learning-loop-mastra", "bin", "loop.mjs");

function runLoop(args, env) {
  return spawnSync("node", [LOOP_BIN, ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MASTRA_STORAGE_DRIVER: "memory", LOOP_SURFACE: ".claude", ...env },
    encoding: "utf8",
    timeout: 15000,
  });
}

test("inline bare-key JSON → exit 2 with a quoted-keys hint naming the fix", { timeout: 20000 }, () => {
  const proc = runLoop(["gate_mark_preflight", '{surface:"runtime-state"}']);
  assert.strictEqual(proc.status, 2, `expected exit 2; stderr=${proc.stderr}`);
  assert.ok(proc.stderr.includes("invalid JSON"), `stderr must keep the invalid-JSON line; got: ${proc.stderr}`);
  assert.ok(proc.stderr.includes("quoted keys"), `stderr must name quoted keys as the fix; got: ${proc.stderr}`);
  assert.ok(proc.stderr.includes('{"surface":"runtime-state"}'), `stderr must show the quoted form; got: ${proc.stderr}`);
});

test("inline quoted-key JSON parses unchanged (no hint, no regression)", { timeout: 20000 }, () => {
  const proc = runLoop(["loop_describe", '{"tier":"warm"}']);
  assert.strictEqual(proc.status, 0, `expected exit 0; stderr=${proc.stderr}`);
  assert.ok(!proc.stderr.includes("quoted keys"));
});

test("genuinely malformed JSON (not bare-key-shaped) → invalid JSON, NO quoted-keys hint", { timeout: 20000 }, () => {
  const proc = runLoop(["loop_describe", "{not even json"]);
  assert.strictEqual(proc.status, 2, `expected exit 2; stderr=${proc.stderr}`);
  assert.ok(proc.stderr.includes("invalid JSON"), `stderr must report invalid JSON; got: ${proc.stderr}`);
  assert.ok(!proc.stderr.includes("quoted keys"), `non-bare-key garbage must not get the hint; got: ${proc.stderr}`);
});

test("--args-file with bare-key content → same quoted-keys hint as inline", { timeout: 20000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "loop-bare-key-"));
  try {
    const file = join(dir, "args.json");
    writeFileSync(file, '{surface:"runtime-state"}');
    const proc = runLoop(["gate_mark_preflight", "--args-file", file]);
    assert.strictEqual(proc.status, 2, `expected exit 2; stderr=${proc.stderr}`);
    assert.ok(proc.stderr.includes("quoted keys"), `args-file path must emit the same hint; got: ${proc.stderr}`);
    assert.ok(proc.stderr.includes('{"surface":"runtime-state"}'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

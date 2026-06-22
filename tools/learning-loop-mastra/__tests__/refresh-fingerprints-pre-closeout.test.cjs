const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const SCRIPT_PATH = resolve(__dirname, "..", "..", "scripts", "refresh-fingerprints-pre-closeout.mjs");

test("refresh-fingerprints script exits 1 without OPERATOR_MODE", { timeout: 5000 }, async () => {
  const child = spawn("node", [SCRIPT_PATH], {
    env: { ...process.env, OPERATOR_MODE: "" },
  });

  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 1);
  assert.ok(stderr.includes("OPERATOR_MODE=1 required"), `stderr: ${stderr}`);
});

test("refresh-fingerprints script runs without error when no drift", { timeout: 15000 }, async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "refresh-test-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  writeFileSync(join(tempRoot, "runtime-state.jsonl"), "\n", { flag: "a" });

  const child = spawn("node", [SCRIPT_PATH], {
    env: {
      ...process.env,
      OPERATOR_MODE: "1",
      GATE_ROOT: tempRoot,
      MASTRA_STORAGE_DRIVER: "memory",
    },
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });

  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.strictEqual(code, 0, `script exited ${code}; stderr: ${stderr}`);
  assert.ok(stderr.includes("no hash_mismatch entries") || stderr.includes("[refresh]"), `stderr: ${stderr}`);
});

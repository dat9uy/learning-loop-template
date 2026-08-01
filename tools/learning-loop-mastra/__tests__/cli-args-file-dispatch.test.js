// cli-args-file-dispatch.test.js — exercises `loop.mjs <tool> --args-file <path>`
// so the file-backed JSON transport shares the same parse/validate/R2/handler
// pipeline as the inline JSON form. Locks the canonical + swapped shapes,
// caller-error behavior, and the <=exit-2 contract.

import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
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

function makeTmp() {
  return mkdtempSync(join(tmpdir(), "loop-args-file-"));
}

test("`<tool> --args-file <path>` produces the same JSON result as inline JSON", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const payload = {
    id: "meta-state-list-served-a-stale-max-by-version-projection-sec",
    include_all_versions: true,
    include_archived: true,
  };
  const file = join(dir, "args.json");
  writeFileSync(file, JSON.stringify(payload));

  const fileProc = runLoop(["meta_state_list", "--args-file", file]);
  assert.strictEqual(fileProc.status, 0, `file-backed call must exit 0; stderr=${fileProc.stderr}`);
  const fileResult = JSON.parse(fileProc.stdout);

  const inlineProc = runLoop(["meta_state_list", JSON.stringify(payload)]);
  assert.strictEqual(inlineProc.status, 0, `inline call must exit 0; stderr=${inlineProc.stderr}`);
  const inlineResult = JSON.parse(inlineProc.stdout);

  assert.deepStrictEqual(fileResult, inlineResult, "file-backed and inline must be byte-for-byte equivalent");
  rmSync(dir, { recursive: true, force: true });
});

test("`<tool> --args-file <path>` converges on the same handler as inline (cached reads parity)", { timeout: 20000 }, () => {
  // Cached reads: meta_state_describe("{tier:'warm'}") and the file form
  // must return the same static shape. Locks that the file form does not
  // take a forked path. `last_generated_at` is a per-call timestamp and is
  // excluded from the structural compare (it changes between calls).
  const dir = makeTmp();
  const payload = { tier: "warm" };
  const file = join(dir, "loop-describe.json");
  writeFileSync(file, JSON.stringify(payload));

  const fileProc = runLoop(["loop_describe", "--args-file", file]);
  assert.strictEqual(fileProc.status, 0, `file-backed loop_describe must exit 0; stderr=${fileProc.stderr}`);
  const fileResult = JSON.parse(fileProc.stdout);

  const inlineProc = runLoop(["loop_describe", JSON.stringify(payload)]);
  assert.strictEqual(inlineProc.status, 0, `inline loop_describe must exit 0; stderr=${inlineProc.stderr}`);
  const inlineResult = JSON.parse(inlineProc.stdout);

  const stripVolatile = (obj) => {
    // `last_generated_at` is a per-call timestamp that lives both at the
    // top level of the loop_describe response and inside `registry_summary`.
    const { last_generated_at: _topTs, ...rest } = obj;
    if (rest.registry_summary && typeof rest.registry_summary === "object") {
      const { last_generated_at: _nestTs, ...nestedRest } = rest.registry_summary;
      return { ...rest, registry_summary: nestedRest };
    }
    return rest;
  };
  assert.deepStrictEqual(
    stripVolatile(fileResult),
    stripVolatile(inlineResult),
    "file-backed and inline describe must be structurally equivalent (excluding last_generated_at)",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("missing path → exit 2, no handler execution", { timeout: 20000 }, () => {
  const proc = runLoop(["meta_state_list", "--args-file", "/nonexistent/loop-args-file-missing.json"]);
  assert.strictEqual(proc.status, 2, `missing path must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /cannot read args file|cannot read/i, `stderr must explain the missing path; got: ${proc.stderr}`);
  assert.strictEqual(proc.stdout, "", `no stdout on caller error; got: ${proc.stdout}`);
});

test("empty file → exit 2", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const file = join(dir, "empty.json");
  writeFileSync(file, "");
  const proc = runLoop(["meta_state_list", "--args-file", file]);
  assert.strictEqual(proc.status, 2, `empty file must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /empty args file/i, `stderr must explain the empty file; got: ${proc.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test("malformed JSON → exit 2 (UsageError, not handler error)", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const file = join(dir, "bad.json");
  writeFileSync(file, "{not valid json");
  const proc = runLoop(["meta_state_list", "--args-file", file]);
  assert.strictEqual(proc.status, 2, `malformed JSON must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /invalid JSON/i, `stderr must explain the JSON parse failure; got: ${proc.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test("non-allowed tool name with --args-file → exit 2", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const file = join(dir, "args.json");
  writeFileSync(file, "{}");
  const proc = runLoop(["--args-file", "no_such_tool_xyz", file]);
  assert.strictEqual(proc.status, 2, `unknown tool must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /unknown tool for --args-file/i, `stderr must explain the unknown tool; got: ${proc.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test("too many args → exit 2", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const file = join(dir, "args.json");
  writeFileSync(file, "{}");
  const proc = runLoop(["meta_state_list", "--args-file", file, "extra"]);
  assert.strictEqual(proc.status, 2, `extra args must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /too many arguments/i, `stderr must explain the extra args; got: ${proc.stderr}`);
  rmSync(dir, { recursive: true, force: true });
});

test("missing path trailing --args-file → exit 2", { timeout: 20000 }, () => {
  const proc = runLoop(["meta_state_list", "--args-file"]);
  assert.strictEqual(proc.status, 2, `missing path must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
  assert.match(proc.stderr, /--args-file <path>/, `stderr must show usage; got: ${proc.stderr}`);
});

test("`--args-file <tool> <path>` (swapped) form is supported", { timeout: 20000 }, () => {
  const dir = makeTmp();
  const payload = { tier: "warm" };
  const file = join(dir, "loop-describe.json");
  writeFileSync(file, JSON.stringify(payload));

  const proc = runLoop(["--args-file", "loop_describe", file]);
  assert.strictEqual(proc.status, 0, `swapped form must exit 0; stderr=${proc.stderr}`);
  const inlineProc = runLoop(["loop_describe", JSON.stringify(payload)]);
  const stripVolatile = (obj) => {
    const { last_generated_at: _topTs, ...rest } = obj;
    if (rest.registry_summary && typeof rest.registry_summary === "object") {
      const { last_generated_at: _nestTs, ...nestedRest } = rest.registry_summary;
      return { ...rest, registry_summary: nestedRest };
    }
    return rest;
  };
  assert.deepStrictEqual(
    stripVolatile(JSON.parse(proc.stdout)),
    stripVolatile(JSON.parse(inlineProc.stdout)),
    "swapped form must equal inline result (excluding last_generated_at)",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("`--schema` and `--args-file` are mutually exclusive", { timeout: 20000 }, () => {
  // `<tool> --schema` is the canonical schema form; `<tool> --args-file <path>`
  // is the canonical file form. Combining them is caller-error.
  const proc = runLoop(["meta_state_list", "--args-file", "--schema"]);
  // `--args-file` reads `--schema` as the path and fails to read it.
  // The result is a clean exit 2 either via "cannot read" or "usage"
  // depending on whether the file exists; both are acceptable caller errors.
  assert.ok(proc.status === 2, `mutually exclusive flags must exit 2; got ${proc.status}; stderr=${proc.stderr}`);
});

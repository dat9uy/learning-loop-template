// Shared CLI spawn helper for parity + re-routed e2e tests.
//
// Always passes an isolated, complete environment: LOOP_SURFACE pinned to the
// runtime, a per-test GATE_ROOT (the CLI must never read the loop's own repo
// when the test intends an isolated root), and the in-memory storage driver
// so no test leaks a storage substrate. `list` is the discovery command and is
// pin-exempt, so it runs with just GATE_ROOT set when needed.
const { spawnSync } = require("node:child_process");
const { resolve, join } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");
const LOOP_BIN = join(PROJECT_ROOT, "tools", "learning-loop-mastra", "bin", "loop.mjs");

/**
 * Spawn `loop.mjs <tool> '<json-args>'` against an isolated root.
 * Returns the spawnSync result; assert on .status yourself.
 */
function runCliTool(tool, args, { gateRoot, env } = {}) {
  const childEnv = {
    ...process.env,
    LOOP_SURFACE: ".claude",
    GATE_ROOT: gateRoot,
    MASTRA_STORAGE_DRIVER: "memory",
    ...env,
  };
  return spawnSync("node", [LOOP_BIN, tool, JSON.stringify(args)], {
    env: childEnv,
    encoding: "utf8",
    timeout: 30000,
  });
}

/** Run `loop.mjs list` and return the parsed tool names (bare, no mastra_ prefix). */
function runCliList() {
  const env = { ...process.env, LOOP_SURFACE: ".claude", MASTRA_STORAGE_DRIVER: "memory" };
  const proc = spawnSync("node", [LOOP_BIN, "list"], { env, encoding: "utf8", timeout: 30000 });
  if (proc.status !== 0) {
    throw new Error(`loop.mjs list failed (${proc.status}): ${proc.stderr}`);
  }
  return proc.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}/)[0]);
}

module.exports = { runCliTool, runCliList, LOOP_BIN, PROJECT_ROOT };

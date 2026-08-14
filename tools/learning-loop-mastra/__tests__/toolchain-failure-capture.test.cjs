/**
 * Phase 3 toolchain-failure-capture hook tests. Spawns the universal hook
 * with stdin payloads simulating Claude's PostToolUseFailure protocol and
 * asserts the gate decision log was written (or not) per the filter layers.
 *
 * Filter layers covered:
 *   1. Bash only — non-Bash tool events exit 0 with no append.
 *   2. Toolchain-only command set — non-matching commands exit 0 with no
 *      append (noise control; every shell exit code would otherwise land).
 *   3. Secret-shaped commands do NOT match the toolchain set → no append
 *      (the pattern set is the first redaction layer; combined with
 *      normalizePrefix + hashed id, no secret reaches the registry).
 *
 * Spawning pattern mirrors e2e/bash-gate-decision-visibility.test.js
 * (execFileSync against the universal hook with stdin + temp GATE_ROOT).
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const UNIVERSAL_HOOK = new URL("../hooks/universal/toolchain-failure-capture.js", import.meta.url).pathname;

let root;

function setup() {
  root = join(tmpdir(), `tfc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  mkdirSync(join(root, ".hermes", "coordination"), { recursive: true });
}

function teardown() {
  if (root) rmSync(root, { recursive: true, force: true });
}

function runHook(payload) {
  return execFileSync(process.execPath, [UNIVERSAL_HOOK], {
    input: JSON.stringify(payload),
    env: { ...process.env, GATE_ROOT: root },
    encoding: "utf8",
    timeout: 5000,
  });
}

// The hook writes the same entry to all retained mirror surfaces via appendToAllSurfaces
// (per-surface storage for cross-runtime dedup on read). Read the first
// surface only — it always exists and holds exactly one entry per capture.
// Other surfaces carry byte-identical entries; cross-surface dedup is the
// readDecisionLog's job, not this hook's.
function readLog() {
  const logPath = join(root, ".claude", "coordination", ".gate-decision.log");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function makeBashFailure(command, sessionId) {
  return {
    hook_event_name: "PostToolUseFailure",
    tool_name: "Bash",
    tool_input: { command },
    error: "Command exited with non-zero status code 1",
    session_id: sessionId,
  };
}

function readDebugLog() {
  const logPath = join(root, ".claude", "coordination", ".toolchain-failure-capture.debug.log");
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

await test("debug trace records capture and skip outcomes (fail-open stays observable)", () => {
  setup();
  try {
    runHook(makeBashFailure("pnpm fallow:gate", "11111111-2222-3333-4444-555555555555"));
    runHook(makeBashFailure("ls -la", "11111111-2222-3333-4444-555555555555"));
    const trace = readDebugLog();
    assert.strictEqual(trace.length, 2, "one debug line per invocation");
    assert.strictEqual(trace[0].outcome, "captured");
    assert.strictEqual(trace[1].outcome, "skip-non-toolchain");
    assert.strictEqual(trace[1].command_prefix, "ls -la", "skip trace carries the normalized prefix, never the raw command");
  } finally { teardown(); }
});

await test("captures pnpm fallow:gate failure", () => {
  setup();
  try {
    const stdout = runHook(makeBashFailure("pnpm fallow:gate", "11111111-2222-3333-4444-555555555555"));
    assert.strictEqual(stdout.trim(), "", "silent-write channel: 0 stdout bytes");
    const entries = readLog();
    assert.strictEqual(entries.length, 1, "one entry appended");
    assert.strictEqual(entries[0].rule_id, "toolchain-failure");
    assert.strictEqual(entries[0].decision, "toolchain-failure");
    assert.strictEqual(entries[0].command_prefix, "pnpm fallow:gate");
    assert.strictEqual(entries[0].session_id, "11111111-2222-3333-4444-555555555555");
    assert.strictEqual(entries[0].session_id_tier, "real");
    // Explicit separate event source: toolchain-failure capture must be
    // distinguishable from the promoted-rule evaluator so the recurrence
    // tracker never treats it as an unexpected-match automatic candidate.
    assert.strictEqual(entries[0].event_source, "toolchain-failure-capture");
    assert.strictEqual(entries[0].candidate_kind, undefined, "capture rows carry no candidate kind");
    assert.strictEqual(entries[0].event, undefined, "capture rows are not telemetry events");
  } finally { teardown(); }
});

await test("captures pnpm test failure", () => {
  setup();
  try {
    runHook(makeBashFailure("pnpm test", "11111111-2222-3333-4444-555555555555"));
    const entries = readLog();
    assert.strictEqual(entries.length, 1, "pnpm test captures");
    assert.strictEqual(entries[0].command_prefix, "pnpm test");
  } finally { teardown(); }
});

await test("captures pnpm exec vitest failure", () => {
  setup();
  try {
    runHook(makeBashFailure("pnpm exec vitest run tools/...", "11111111-2222-3333-4444-555555555555"));
    const entries = readLog();
    assert.strictEqual(entries.length, 1, "pnpm exec vitest captures");
    assert.ok(
      entries[0].command_prefix.startsWith("pnpm exec vitest"),
      `prefix must start with the verb, got ${entries[0].command_prefix}`,
    );
  } finally { teardown(); }
});

await test("captures pnpm run build failure", () => {
  setup();
  try {
    runHook(makeBashFailure("pnpm run build", "11111111-2222-3333-4444-555555555555"));
    const entries = readLog();
    assert.strictEqual(entries.length, 1, "pnpm run build captures");
    assert.strictEqual(entries[0].command_prefix, "pnpm run build");
  } finally { teardown(); }
});

await test("non-Bash tool events do not capture", () => {
  setup();
  try {
    runHook({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Write",
      tool_input: { file_path: "/tmp/x", content: "pnpm fallow:gate" },
      error: "Synthetic write failure",
      session_id: "11111111-2222-3333-4444-555555555555",
    });
    const entries = readLog();
    assert.strictEqual(entries.length, 0, "non-Bash tool events must NOT capture");
  } finally { teardown(); }
});

await test("non-toolchain commands do not capture (noise control)", () => {
  setup();
  try {
    runHook(makeBashFailure("ls -la", "11111111-2222-3333-4444-555555555555"));
    runHook(makeBashFailure("echo hello", "11111111-2222-3333-4444-555555555555"));
    runHook(makeBashFailure("cat /etc/hosts", "11111111-2222-3333-4444-555555555555"));
    const entries = readLog();
    assert.strictEqual(entries.length, 0, "non-toolchain commands must NOT capture");
  } finally { teardown(); }
});

await test("secret-shaped command does not capture (first redaction layer)", () => {
  setup();
  try {
    const secretCmd = "curl https://api.example.com?token=eyJhbGciOiJIUzI1NiJ9";
    runHook(makeBashFailure(secretCmd, "11111111-2222-3333-4444-555555555555"));
    const entries = readLog();
    assert.strictEqual(
      entries.length,
      0,
      "secret-shaped command must NOT capture — toolchain filter is the first redaction layer",
    );
  } finally { teardown(); }
});

await test("fallback-tier session_id when harness UUID missing", () => {
  setup();
  try {
    runHook({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "pnpm fallow:gate" },
      error: "Command exited with non-zero status code 1",
    });
    const entries = readLog();
    assert.strictEqual(entries.length, 1, "fallback-tier session still captures");
    assert.strictEqual(entries[0].session_id_tier, "fallback");
    assert.ok(
      typeof entries[0].session_id === "string" && entries[0].session_id.length > 0,
      "worktree-derived session id present",
    );
  } finally { teardown(); }
});

await test("3 same-command failures append 3 entries (recurrence trigger consumes them)", () => {
  setup();
  try {
    const sid = "11111111-2222-3333-4444-555555555555";
    runHook(makeBashFailure("pnpm fallow:gate", sid));
    runHook(makeBashFailure("pnpm fallow:gate", sid));
    runHook(makeBashFailure("pnpm fallow:gate", sid));
    const entries = readLog();
    assert.strictEqual(entries.length, 3, "3 same-command failures → 3 captured entries");
    assert.ok(entries.every((e) => e.command_prefix === "pnpm fallow:gate"));
  } finally { teardown(); }
});

await test("malformed stdin: hook fails open with no entry", () => {
  setup();
  try {
    const stdout = execFileSync(process.execPath, [UNIVERSAL_HOOK], {
      input: "not json at all",
      env: { ...process.env, GATE_ROOT: root },
      encoding: "utf8",
      timeout: 5000,
    });
    assert.strictEqual(stdout.trim(), "");
    const entries = readLog();
    assert.strictEqual(entries.length, 0, "malformed stdin → no entry");
  } catch (err) {
    assert.fail(`hook must fail-open on malformed stdin; got exit ${err.status}: ${err.stderr ?? err.message}`);
  } finally { teardown(); }
});

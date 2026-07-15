import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { formatHookDecision, formatOutput } from "../../hooks/universal/lib/protocol-adapter.js";

const UNIVERSAL_HOOK = new URL("../../hooks/universal/bash-gate.js", import.meta.url).pathname;

let root;

beforeEach(() => {
  root = join(tmpdir(), `bash-gate-dv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runGate(stdin) {
  try {
    const stdout = execFileSync(process.execPath, [UNIVERSAL_HOOK], {
      input: JSON.stringify(stdin),
      env: { ...process.env, GATE_ROOT: root },
      encoding: "utf8",
      timeout: 5000,
    });
    return { exitCode: 0, stdout };
  } catch (err) {
    return { exitCode: err.status ?? 1, stdout: err.stdout ?? "" };
  }
}

function makeInput(command) {
  return { tool_name: "Bash", tool_input: { command } };
}

await test("ok decision: stdout receives nothing; exit code 0", () => {
  const { exitCode: code, stdout } = runGate(makeInput("ls -la"));
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), "");
});

await test("block decision: stdout receives hookSpecificOutput envelope; exit code 2", () => {
  const { exitCode: code, stdout } = runGate(makeInput("> records/foo.json"));
  assert.strictEqual(code, 2);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput, "stdout has hookSpecificOutput envelope");
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
});

await test("escalate decision: stdout receives hookSpecificOutput envelope; exit code 2", () => {
  const rule = {
    entry_kind: "rule",
    id: "rule-test-escalate",
    origin: "meta-test",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "test-escalate-token",
    description: "Test rule for decision visibility phase",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");

  const { exitCode: code, stdout } = runGate(makeInput("echo test-escalate-token"));
  assert.strictEqual(code, 2);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput);
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-test-escalate");
});

await test("hookSpecificOutput.additionalContext is valid JSON with the expected fields", () => {
  const { stdout } = runGate(makeInput("> records/foo.json"));
  const parsed = JSON.parse(stdout);
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "block");
  assert.ok(typeof decision.reason === "string" && decision.reason.length > 0);
});

await test("formatHookDecision defaults to formatOutput shape when no channel", () => {
  const decision = { decision: "ok" };
  assert.strictEqual(formatHookDecision(decision), formatOutput(decision));
});

await test("formatHookDecision wraps decision in hookSpecificOutput envelope when channel set", () => {
  const decision = { decision: "block", reason: "test" };
  const out = JSON.parse(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
  assert.strictEqual(out.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.deepStrictEqual(JSON.parse(out.hookSpecificOutput.additionalContext), decision);
});

// State-3 backstop: piping `vitest run`/`pnpm test` to tail/grep must surface to
// the agent as an escalate denial via the PreToolUse hookSpecificOutput channel
// (the exact envelope the harness turns into additionalContext on the denied
// call). A promoted regex rule spans the pipe via the full-command pass in
// applyPromotedRules — per-segment matching alone cannot reach it.
await test("no-raw-stdout rule: vitest run piped to tail → escalate envelope agent can read", () => {
  const rule = {
    entry_kind: "rule",
    id: "rule-no-raw-stdout-vitest",
    origin: "meta-test",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "(vitest run|pnpm test\\b).*\\| *(tail|grep)\\b",
    description: "Block piping vitest or pnpm test stdout to tail or grep use the parsed json",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");

  const { exitCode: code, stdout } = runGate(
    makeInput("vitest run --bail=1 foo.test.js 2>&1 | tail -10"),
  );
  assert.strictEqual(code, 2, "piped vitest run must be denied (exit 2)");
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.hookSpecificOutput, "agent-visible envelope present on stdout");
  assert.strictEqual(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-no-raw-stdout-vitest");
  assert.ok(typeof decision.reason === "string" && decision.reason.length > 0, "reason surfaced to agent");
});

await test("no-raw-stdout rule: pnpm test:iter (wrapper, no pipe) → allowed, exit 0", () => {
  const rule = {
    entry_kind: "rule",
    id: "rule-no-raw-stdout-vitest",
    origin: "meta-test",
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "(vitest run|pnpm test\\b).*\\| *(tail|grep)\\b",
    description: "Block piping vitest or pnpm test stdout to tail or grep use the parsed json",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");

  const { exitCode: code, stdout } = runGate(makeInput("pnpm test:iter"));
  assert.strictEqual(code, 0, "wrapper must be allowed");
  assert.strictEqual(stdout.trim(), "", "no denial envelope on allowed command");
});

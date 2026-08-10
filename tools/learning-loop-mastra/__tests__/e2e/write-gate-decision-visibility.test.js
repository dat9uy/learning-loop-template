import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const UNIVERSAL_HOOK = new URL("../../hooks/universal/write-gate.js", import.meta.url).pathname;

let root;

beforeEach(() => {
  root = join(tmpdir(), `write-gate-dv-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
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

function makeInput(file_path, tool_name = "Write") {
  return { tool_name, tool_input: { file_path } };
}

function envelope(stdout) {
  const parsed = JSON.parse(stdout);
  return {
    hook: parsed.hookSpecificOutput,
    decision: parsed?.hookSpecificOutput?.additionalContext
      ? JSON.parse(parsed.hookSpecificOutput.additionalContext)
      : null,
  };
}

// The write gate denies via the modern PreToolUse protocol: exit 0 with
// `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason`,
// so the harness surfaces the readable block reason to the model. The rich
// decision (matched_rule, surface, preflight_checklist) rides in
// hookSpecificOutput.additionalContext. Allowed writes print nothing (exit 0).

await test("ok decision: docs/** (no promoted rule) → exit 0, no permissionDecision", () => {
  const { exitCode: code, stdout } = runGate(makeInput("docs/readme.md"));
  assert.strictEqual(code, 0, "exit 0");
  assert.strictEqual(stdout.trim(), "", "ok prints nothing — no denial envelope");
});

await test("block decision: records/evidence → exit 0 + permissionDecision deny envelope agent can read", () => {
  const { exitCode: code, stdout } = runGate(makeInput("records/evidence/foo.md"));
  assert.strictEqual(code, 0, "exit 0 so harness processes the hookSpecificOutput JSON");
  const { hook, decision } = envelope(stdout);
  assert.ok(hook, "hookSpecificOutput envelope present");
  assert.strictEqual(hook.hookEventName, "PreToolUse");
  assert.strictEqual(hook.permissionDecision, "deny", "deny blocks the call");
  assert.ok(
    typeof hook.permissionDecisionReason === "string" && hook.permissionDecisionReason.length > 0,
    "reason surfaced to model as denial reason",
  );
  assert.strictEqual(decision.decision, "block");
  assert.strictEqual(decision.matched_rule, "records/**");
});

await test("product preflight block: exit 0 + deny + preflight_checklist in additionalContext", () => {
  const { exitCode: code, stdout } = runGate(makeInput("product/api/src/main.py"));
  assert.strictEqual(code, 0, "exit 0 so harness processes the hookSpecificOutput JSON");
  const { hook, decision } = envelope(stdout);
  assert.strictEqual(hook.permissionDecision, "deny", "preflight block is denied");
  assert.ok(hook.permissionDecisionReason.toLowerCase().includes("preflight"), "reason mentions preflight");
  assert.strictEqual(decision.decision, "block");
  assert.strictEqual(decision.surface, "product");
  assert.ok(Array.isArray(decision.preflight_checklist), "preflight_checklist preserved in additionalContext");
});

await test("escalate decision: promoted glob rule → exit 0 + permissionDecision deny envelope", () => {
  const rule = {
    entry_kind: "rule",
    id: "rule-test-write-escalate",
    origin: "meta-test",
    enforcement: "gate",
    pattern_type: "glob",
    pattern: "docs/**",
    description: "Test promoted glob rule for write-gate decision visibility",
    status: "active",
    promoted_at: new Date().toISOString(),
    promoted_by: "operator",
  };
  writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(rule) + "\n");

  const { exitCode: code, stdout } = runGate(makeInput("docs/escalate.md"));
  assert.strictEqual(code, 0, "exit 0 so harness processes the hookSpecificOutput JSON");
  const { hook, decision } = envelope(stdout);
  assert.strictEqual(hook.permissionDecision, "deny", "escalate is denied too");
  assert.ok(
    typeof hook.permissionDecisionReason === "string" && hook.permissionDecisionReason.length > 0,
    "escalate reason surfaced to model",
  );
  assert.strictEqual(decision.decision, "escalate");
  assert.strictEqual(decision.rule_id, "rule-test-write-escalate");
});

await test("non-Write tool → exit 0, no permissionDecision", () => {
  const { exitCode: code, stdout } = runGate({ tool_name: "Bash", tool_input: { command: "ls" } });
  assert.strictEqual(code, 0);
  assert.strictEqual(stdout.trim(), "", "non-write tool prints nothing");
});
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const UNIVERSAL_HOOK = new URL("../../hooks/universal/bash-gate.js", import.meta.url).pathname;
const RULE_ID = "rule-no-verify-bypass-denied";
const PATTERN =
  "git[\\s][^|;&]*\\b(commit|push|cherry-pick|revert|merge)\\b[^|;&]*--no-verify|git[\\s][^|;&]*\\bcommit\\b[^|;&]*[\\s]-n([\\s]|$)|[cC][oO][rR][eE][.][hH][oO][oO][kK][sS][pP][aA][tT][hH][\\s]*(=|\\s+)(/dev/null|NUL)|GIT_CONFIG_KEY_[0-9]+=[cC][oO][rR][eE][.][hH][oO][oO][kK][sS][pP][aA][tT][hH][^|;&]*GIT_CONFIG_VALUE_[0-9]+=(/dev/null|NUL)";

let root;

beforeEach(() => {
  root = join(tmpdir(), `bash-gate-no-verify-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function runGate(command) {
  const result = spawnSync(process.execPath, [UNIVERSAL_HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    env: { ...process.env, GATE_ROOT: root },
    encoding: "utf8",
    timeout: 5000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

function writeRule() {
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify({
      entry_kind: "rule",
      id: RULE_ID,
      enforcement: "gate",
      pattern_type: "regex",
      pattern: PATTERN,
      description: "Deny git hook bypass flags and destructive hooksPath mutations.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    }) + "\n",
  );
}

function writeOverride({ createdAt = new Date().toISOString(), ttlSeconds = 120 } = {}) {
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(
    join(root, ".claude", "coordination", ".gate-override"),
    JSON.stringify({
      rule_ids: [RULE_ID],
      created_at: createdAt,
      ttl_seconds: ttlSeconds,
      operator_note: "test override",
    }),
  );
}

function assertDenied(command) {
  const result = runGate(command);
  assert.ifError(result.error);
  assert.strictEqual(result.exitCode, 0, `hook should return 0 for harness processing: ${command}`);
  assert.ok(result.stdout.trim(), `denial envelope missing for ${command}; stderr: ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.strictEqual(parsed.hookSpecificOutput?.permissionDecision, "deny", command);
  const decision = JSON.parse(parsed.hookSpecificOutput.additionalContext);
  assert.strictEqual(decision.decision, "escalate", command);
  assert.strictEqual(decision.rule_id, RULE_ID, command);
  assert.ok(!result.stderr.includes("schema validation failed, skipping"), command);
}

function assertAllowed(command) {
  const result = runGate(command);
  assert.ifError(result.error);
  assert.strictEqual(result.exitCode, 0, `hook should return 0: ${command}`);
  assert.strictEqual(result.stdout.trim(), "", `command should not emit a denial: ${command}`);
}

test("promoted hook-bypass rule denies bypasses and preserves safe commands", () => {
  writeRule();

  for (const command of [
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git push --no-verify",
    "git -c core.hooksPath=/dev/null commit -m x",
    "git -c Core.HooksPath=/dev/null commit -m x",
    "git config core.hooksPath /dev/null",
    "git config core.hooksPath=/dev/null",
    "GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x",
  ]) {
    assertDenied(command);
  }

  for (const command of [
    'git commit -m "mentions --no-verify in prose"',
    "git commit -m x",
    "git push origin main",
    "git config --get core.hooksPath",
    "git config --unset core.hooksPath",
    "git config core.hooksPath .husky",
    "GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=.husky git commit -m x",
    'git log --all --grep="no-verify"',
    "pnpm test:one -u tools/example.test.js",
  ]) {
    assertAllowed(command);
  }

  assertDenied("git commit -F - <<EOF\nmessage containing --no-verify\nEOF");
});

test("gate override releases a blocked command and expired override does not", () => {
  writeRule();
  const command = "git commit --no-verify -m x";

  writeOverride();
  assertAllowed(command);

  writeOverride({
    createdAt: new Date(Date.now() - 10_000).toISOString(),
    ttlSeconds: 1,
  });
  assertDenied(command);
});

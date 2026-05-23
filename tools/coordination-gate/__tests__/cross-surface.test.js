#!/usr/bin/env node
/**
 * Cross-surface integration test — verifies Claude Code and Droid CLI
 * formats produce identical gate decisions via the same universal hooks.
 */

import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASH_HOOK = join(__dirname, "..", "hooks", "bash-gate.js");
const WRITE_HOOK = join(__dirname, "..", "hooks", "write-gate.js");
const INBOUND_HOOK = join(__dirname, "..", "hooks", "inbound-gate.js");

function runHook(hookPath, input, envOverrides = {}) {
  const result = spawnSync("node", [hookPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 5000,
    env: { ...process.env, ...envOverrides },
  });
  let output = null;
  try {
    output = JSON.parse(result.stdout.trim());
  } catch {
    output = null;
  }
  return {
    exitCode: result.status ?? 0,
    stdout: result.stdout.trim(),
    output,
  };
}

// ─── Bash/Execute Gate Cross-Surface Tests ───

const bashTestCases = [
  {
    name: "docker command blocked",
    claude: { tool_name: "Bash", tool_input: { command: "docker run ubuntu" } },
    droid: { tool_name: "Execute", tool_input: { command: "docker run ubuntu" } },
    expectedDecision: "escalate",
  },
  {
    name: "sudo command blocked",
    claude: { tool_name: "Bash", tool_input: { command: "sudo apt update" } },
    droid: { tool_name: "Execute", tool_input: { command: "sudo apt update" } },
    expectedDecision: "escalate",
  },
  {
    name: "ls command allowed",
    claude: { tool_name: "Bash", tool_input: { command: "ls -la" } },
    droid: { tool_name: "Execute", tool_input: { command: "ls -la" } },
    expectedDecision: null, // exit 0, no output
  },
  {
    name: "records redirect blocked",
    claude: { tool_name: "Bash", tool_input: { command: "echo x > records/test.yaml" } },
    droid: { tool_name: "Execute", tool_input: { command: "echo x > records/test.yaml" } },
    expectedDecision: "block",
  },
];

for (const tc of bashTestCases) {
  await test(`bash-gate: ${tc.name} — Claude vs Droid identical`, () => {
    const claudeResult = runHook(BASH_HOOK, tc.claude);
    const droidResult = runHook(BASH_HOOK, tc.droid);

    assert.strictEqual(
      claudeResult.exitCode,
      droidResult.exitCode,
      `Exit codes differ: Claude=${claudeResult.exitCode}, Droid=${droidResult.exitCode}`
    );

    if (tc.expectedDecision) {
      assert.strictEqual(claudeResult.output?.decision, tc.expectedDecision);
      assert.strictEqual(droidResult.output?.decision, tc.expectedDecision);
    }
  });
}

// ─── Write Gate Cross-Surface Tests ───

const writeTestCases = [
  {
    name: "records/observations blocked",
    claude: { tool_name: "Edit", tool_input: { file_path: "records/observations/test.yaml" } },
    droid: { tool_name: "Create", tool_input: { file_path: "records/observations/test.yaml" } },
    expectedDecision: "block",
  },
  {
    name: "docs allowed",
    claude: { tool_name: "Write", tool_input: { file_path: "docs/readme.md" } },
    droid: { tool_name: "Edit", tool_input: { file_path: "docs/readme.md" } },
    expectedDecision: null, // exit 0
  },
  {
    name: "schemas blocked",
    claude: { tool_name: "Edit", tool_input: { file_path: "schemas/test.schema.json" } },
    droid: { tool_name: "ApplyPatch", tool_input: { file_path: "schemas/test.schema.json" } },
    expectedDecision: "block",
  },
];

for (const tc of writeTestCases) {
  await test(`write-gate: ${tc.name} — Claude vs Droid identical`, () => {
    const claudeResult = runHook(WRITE_HOOK, tc.claude);
    const droidResult = runHook(WRITE_HOOK, tc.droid);

    assert.strictEqual(
      claudeResult.exitCode,
      droidResult.exitCode,
      `Exit codes differ: Claude=${claudeResult.exitCode}, Droid=${droidResult.exitCode}`
    );

    if (tc.expectedDecision) {
      assert.strictEqual(claudeResult.output?.decision, tc.expectedDecision);
      assert.strictEqual(droidResult.output?.decision, tc.expectedDecision);
    }
  });
}

// ─── Inbound Gate Cross-Surface Tests ───

const inboundTestCases = [
  {
    name: "normal message no context",
    claude: { prompt: "what should we do next?" },
    droid: { prompt: "what should we do next?" },
    expectContext: false,
  },
];

for (const tc of inboundTestCases) {
  await test(`inbound-gate: ${tc.name} — Claude vs Droid identical`, () => {
    const claudeResult = runHook(INBOUND_HOOK, tc.claude);
    const droidResult = runHook(INBOUND_HOOK, tc.droid);

    assert.strictEqual(
      claudeResult.exitCode,
      droidResult.exitCode,
      `Exit codes differ: Claude=${claudeResult.exitCode}, Droid=${droidResult.exitCode}`
    );

    const claudeHasContext = claudeResult.output?.hookSpecificOutput?.additionalContext != null;
    const droidHasContext = droidResult.output?.hookSpecificOutput?.additionalContext != null;

    assert.strictEqual(claudeHasContext, tc.expectContext);
    assert.strictEqual(droidHasContext, tc.expectContext);
  });
}

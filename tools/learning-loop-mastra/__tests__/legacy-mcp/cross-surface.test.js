#!/usr/bin/env node
/**
 * Cross-surface integration test — verifies Claude Code and Droid CLI
 * formats produce identical gate decisions via the same universal hooks.
 */

import { test } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASH_HOOK = join(__dirname, "..", "..", "hooks", "universal", "bash-gate.js");
const WRITE_HOOK = join(__dirname, "..", "..", "hooks", "universal", "write-gate.js");
const INBOUND_HOOK = join(__dirname, "..", "..", "hooks", "universal", "inbound-gate.js");

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

function getBashDecision(output) {
  if (!output?.hookSpecificOutput?.additionalContext) return null;
  try {
    return JSON.parse(output.hookSpecificOutput.additionalContext);
  } catch {
    return null;
  }
}

// Both PreToolUse gates emit the decision inside hookSpecificOutput.additionalContext.
const getWriteDecision = getBashDecision;

// ─── Bash/Execute Gate Cross-Surface Tests ───

const bashTestCases = [
  {
    name: "docker command blocked",
    claude: { tool_name: "Bash", tool_input: { command: "docker run ubuntu" } },
    droid: { tool_name: "Execute", tool_input: { command: "docker run ubuntu" } },
    expectedDecision: "block",
  },
  {
    name: "sudo command blocked",
    claude: { tool_name: "Bash", tool_input: { command: "sudo apt update" } },
    droid: { tool_name: "Execute", tool_input: { command: "sudo apt update" } },
    expectedDecision: "block",
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
      const claudeDecision = getBashDecision(claudeResult.output);
      const droidDecision = getBashDecision(droidResult.output);
      assert.strictEqual(claudeDecision?.decision, tc.expectedDecision);
      assert.strictEqual(droidDecision?.decision, tc.expectedDecision);
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
      assert.strictEqual(getWriteDecision(claudeResult.output)?.decision, tc.expectedDecision);
      assert.strictEqual(getWriteDecision(droidResult.output)?.decision, tc.expectedDecision);
    }
  });
}

// ─── Inbound Gate Cross-Surface Tests ───
// Plan 260720-1955 Phase 4: the inbound gate now emits a steering pull pointer
// on the FIRST prompt of a session (per surface, mirroring SessionStart). The
// "normal message no context" expectation below was the pre-pointer contract —
// refresh to expect the pointer on the first run; the suppress-token store
// collapses subsequent emissions so behavior matches the pre-Phase-4 contract
// for a no-state-change follow-up.
const inboundTestCases = [
  {
    name: "normal message emits pointer once per session",
    claude: { prompt: "what should we do next?" },
    droid: { prompt: "what should we do next?" },
    expectContext: true,
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

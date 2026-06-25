/**
 * Contract test suite — 24 tests covering structural, pass-mode, per-requirement,
 * fail-mode, and golden scenarios. Validates contract.js against both real runtimes
 * and synthetic fake roots built with fs.mkdtempSync.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import { validate, validateAll, REQUIREMENT_IDS } from "../contract.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

const HOOK_SHIMS = [
  "bash-coordination-gate.cjs",
  "write-coordination-gate.cjs",
  "inbound-state-gate.cjs",
  "recurrence-check-on-start.cjs",
];

const VALID_UNIVERSAL_HOOK = "tools/learning-loop-mastra/hooks/legacy/bash-gate.js";
const VALID_SHIM_CONTENT = `#!/usr/bin/env node\n'use strict';\nconst { execFileSync } = require('child_process');\nconst path = require('path');\nconst universalHook = path.join(__dirname, '../../../${VALID_UNIVERSAL_HOOK}');\nconst stdin = require('fs').readFileSync(0, 'utf8');\ntry { execFileSync('node', [universalHook], { input: stdin, stdio: ['pipe', 'inherit', 'inherit'] }); process.exit(0); } catch (err) { process.exit(err.status ?? 1); }\n`;

function fakeRoot(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-contract-"));
  const surface = opts.surface ?? ".fake";
  // Hook shims
  if (opts.hookShims) {
    const hooksDir = join(root, surface, "coordination", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    for (const name of opts.hookShims) {
      writeFileSync(join(hooksDir, name), VALID_SHIM_CONTENT);
    }
  }
  // MCP config
  if (opts.mcpConfigPath) {
    const mcpFull = join(root, opts.mcpConfigPath);
    mkdirSync(join(mcpFull, ".."), { recursive: true });
    const content = opts.mcpConfig ?? { mcpServers: { "learning-loop": { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] } } };
    writeFileSync(mcpFull, JSON.stringify(content));
  }
  // Skill spec
  if (opts.skillSpec !== undefined) {
    const skillDir = join(root, surface, "skills", "learning-loop");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), opts.skillSpec);
  }
  // Settings
  if (opts.settingsPath !== undefined) {
    const settingsFull = join(root, opts.settingsPath);
    mkdirSync(join(settingsFull, ".."), { recursive: true });
    const content = opts.settings ?? { hooks: {} };
    writeFileSync(settingsFull, JSON.stringify(content));
  }
  return root;
}

function withRoot(opts, fn) {
  const root = fakeRoot(opts);
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

// RED-TEAM FIX (Finding F3, 2026-06-25): save/restore RUNTIME_ID to prevent test pollution.
function withCleanRUNTIME_ID(fn) {
  const saved = process.env.RUNTIME_ID;
  delete process.env.RUNTIME_ID;
  try { return fn(); }
  finally {
    if (saved === undefined) delete process.env.RUNTIME_ID;
    else process.env.RUNTIME_ID = saved;
  }
}

// --- Group 1: structural (4 tests) ---

test("contract.js exports validate as named export", () => {
  assert.equal(typeof validate, "function");
});

test("contract.js exposes REQUIREMENT_IDS constant", () => {
  assert.ok(Array.isArray(REQUIREMENT_IDS));
  assert.equal(REQUIREMENT_IDS.length, 5);
  assert.deepEqual(REQUIREMENT_IDS, [
    "hook-shim-set",
    "mcp-client-config",
    "skill-spec",
    "identity-marker",
    "settings-integration",
  ]);
});

test("contract.js runs as CLI (--list)", () => {
  const out = execFileSync("node", ["tools/learning-loop-mastra/interface/contract.js", "--list"], { encoding: "utf8" });
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed.runtimes));
  assert.ok(parsed.runtimes.includes("claude-code"));
  assert.ok(parsed.runtimes.includes("droid"));
  assert.ok(parsed.runtimes.includes("mastra-code"));
  assert.equal(parsed.requirements.length, 5);
});

test("contract.js runs as CLI with a runtime id", () => {
  const out = execFileSync("node", ["tools/learning-loop-mastra/interface/contract.js", "claude-code"], { encoding: "utf8" });
  const parsed = JSON.parse(out);
  assert.equal(parsed.runtimeId, "claude-code");
  assert.equal(typeof parsed.ok, "boolean");
});

// --- Group 2: pass mode (against real runtimes, 2 tests) ---

test("claude-code passes all hard requirements (ok: true, missing: [])", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("claude-code", PROJECT_ROOT);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("droid passes all hard requirements (ok: true, missing: [])", () => {
  delete process.env.RUNTIME_ID;
  const result = validate("droid", PROJECT_ROOT);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

// --- Group 3: per-requirement pass (9 tests: 4 reqs × 2 runtimes + 1 advisory-only req 4) ---

test("req 1 (hook-shim-set) alone passes — claude-code shape", () => {
  withRoot({ surface: ".claude", hookShims: HOOK_SHIMS }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("hook-shim-set"), `hook-shim-set should pass: ${JSON.stringify(result.missing)}`);
  });
});

test("req 2 (mcp-client-config) alone passes — claude-code shape", () => {
  withRoot({ surface: ".claude", mcpConfigPath: ".mcp.json" }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("mcp-client-config"));
  });
});

test("req 3 (skill-spec) alone passes — claude-code shape", () => {
  const skillContent = "Reference: loop_describe and meta_state_list.";
  withRoot({ surface: ".claude", skillSpec: skillContent }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("skill-spec"));
  });
});

test("req 5 (settings-integration) alone passes — claude-code shape", () => {
  const settings = {
    hooks: {
      PreToolUse: [
        { matcher: "Bash", hooks: [{ type: "command", command: `node .claude/coordination/hooks/bash-coordination-gate.cjs` }] },
        { matcher: "Edit|Write", hooks: [{ type: "command", command: `node .claude/coordination/hooks/write-coordination-gate.cjs` }] },
      ],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: `node .claude/coordination/hooks/inbound-state-gate.cjs` }] }],
      SessionStart: [{ hooks: [{ type: "command", command: `node .claude/coordination/hooks/recurrence-check-on-start.cjs` }] }],
    },
  };
  withRoot({ surface: ".claude", settingsPath: ".claude/settings.json", settings }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("settings-integration"));
  });
});

test("req 1 (hook-shim-set) alone passes — droid shape", () => {
  withRoot({ surface: ".factory", hookShims: HOOK_SHIMS }, (root) => {
    const result = validate("droid", root);
    assert.ok(!result.missing.includes("hook-shim-set"));
  });
});

test("req 2 (mcp-client-config) alone passes — droid shape", () => {
  withRoot({ surface: ".factory", mcpConfigPath: ".factory/mcp.json" }, (root) => {
    const result = validate("droid", root);
    assert.ok(!result.missing.includes("mcp-client-config"));
  });
});

test("req 3 (skill-spec) alone passes — droid shape", () => {
  const skillContent = "Reference: loop_describe and meta_state_list.";
  withRoot({ surface: ".factory", skillSpec: skillContent }, (root) => {
    const result = validate("droid", root);
    assert.ok(!result.missing.includes("skill-spec"));
  });
});

test("req 5 (settings-integration) alone passes — droid shape", () => {
  const settings = {
    hooks: {
      PreToolUse: [
        { matcher: "Execute", hooks: [{ type: "command", command: `"$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/bash-coordination-gate.cjs` }] },
        { matcher: "Edit|Create|ApplyPatch", hooks: [{ type: "command", command: `"$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/write-coordination-gate.cjs` }] },
      ],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: `"$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/inbound-state-gate.cjs` }] }],
      SessionStart: [{ hooks: [{ type: "command", command: `"$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/recurrence-check-on-start.cjs` }] }],
    },
  };
  withRoot({ surface: ".factory", settingsPath: ".factory/settings.json", settings }, (root) => {
    const result = validate("droid", root);
    assert.ok(!result.missing.includes("settings-integration"));
  });
});

test("req 4 (identity-marker) does not fail when unset (advisory)", () => {
  withCleanRUNTIME_ID(() => {
    withRoot({}, (root) => {
      const result = validate("claude-code", root);
      assert.ok(result.notes.includes("identity-marker-not-adopted"));
      assert.ok(!result.missing.includes("identity-marker"));
    });
  });
});

// --- Group 4: per-requirement fail (5 tests) ---

test("req 1 fails when shim file is missing", () => {
  withRoot({ surface: ".claude", hookShims: HOOK_SHIMS.slice(0, 3) }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("hook-shim-set"));
  });
});

test("req 2 fails when mcpServers entry is missing", () => {
  withRoot({ surface: ".claude", mcpConfigPath: ".mcp.json", mcpConfig: { mcpServers: {} } }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("mcp-client-config"));
  });
});

test("req 3 fails when SKILL.md is absent", () => {
  withRoot({ surface: ".claude" }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("skill-spec"));
  });
});

test("req 5 fails when settings file is absent", () => {
  withRoot({ surface: ".claude" }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("settings-integration"));
  });
});

test("req 5 fails on bad JSON in settings file", () => {
  withRoot({ surface: ".claude", settingsPath: ".claude/settings.json" }, (root) => {
    writeFileSync(join(root, ".claude/settings.json"), "{ broken json");
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("settings-integration"));
  });
});

// Red-team Finding F6: empty config files (readJsonSafe returns {ok:false,error:"empty file"})
test("req 5 fails on empty settings file", () => {
  withRoot({ surface: ".claude", settingsPath: ".claude/settings.json" }, (root) => {
    writeFileSync(join(root, ".claude/settings.json"), "");
    const result = validate("claude-code", root);
    assert.ok(result.missing.includes("settings-integration"));
  });
});

// --- Group 5: end-to-end / golden (3 tests) ---

test("validate('claude-code') on empty dir returns all hard reqs missing", () => {
  withCleanRUNTIME_ID(() => {
    const root = mkdtempSync(join(tmpdir(), "ll-contract-empty-"));
    try {
      const result = validate("claude-code", root);
      assert.equal(result.ok, false);
      // hook-shim-set, mcp-client-config, skill-spec, settings-integration all fail (4)
      // identity-marker is advisory (passes)
      assert.equal(result.missing.length, 4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// Red-team Finding F7: CONTRACT.md ↔ REQUIREMENT_IDS set-equality test
test("CONTRACT.md IDs match REQUIREMENT_IDS (set equality, not just contains)", () => {
  const contractPath = join(import.meta.dirname, "..", "CONTRACT.md");
  const content = readFileSync(contractPath, "utf8");
  // Extract backticked IDs from sections like "### N. `hook-shim-set`"
  const extractedIds = new Set();
  const re = /###?\s*\d+\.\s*`([a-z][a-z0-9-]+)`/g;
  let m;
  while ((m = re.exec(content)) !== null) extractedIds.add(m[1]);
  const exportedIds = new Set(REQUIREMENT_IDS);
  assert.deepEqual([...extractedIds].sort(), [...exportedIds].sort(),
    `CONTRACT.md IDs (${JSON.stringify([...extractedIds])}) must match REQUIREMENT_IDS (${JSON.stringify([...exportedIds])})`);
});

test("validate('mastra-code') on real repo returns ok: false (no Mastra Code dir yet)", () => {
  withCleanRUNTIME_ID(() => {
    const result = validate("mastra-code", PROJECT_ROOT);
    assert.equal(result.ok, false);
    assert.ok(result.missing.length >= 4, `expected at least 4 missing, got ${result.missing.length}: ${JSON.stringify(result.missing)}`);
    assert.ok(!result.missing.includes("identity-marker"));
  });
});

test("validate('unknown-runtime-id') returns helpful error (no throw)", () => {
  const result = validate("typo-runtime-id");
  assert.equal(result.ok, false);
  assert.ok(result.error.startsWith("unknown-runtime-id:"));
});

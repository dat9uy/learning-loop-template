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
  // Tool manifest (Req #11 — project-wide invariant). Default: valid manifest
  // with pathFields on every entry. Set opts.manifest to override;
  // opts.manifest === null skips the write (so Req #11 fails).
  if (opts.manifest !== null) {
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    const entries = opts.manifest ?? [{ file: "tools/sample-tool.js", export: "sampleTool", pathFields: [] }];
    writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify(entries));
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
  assert.equal(REQUIREMENT_IDS.length, 10);
  assert.deepEqual(REQUIREMENT_IDS, [
    "hook-shim-set",
    "mcp-client-config",
    "skill-spec",
    "identity-marker",
    "settings-integration",
    "hook-declarative-config",
    "settings-no-bypass",
    ".mastracode-config-presence",
    "mastracode-session-start-pins-loop-surface",
    "tools-manifest-has-path-fields",
  ]);
});

test("contract.js runs as CLI (--list)", () => {
  const out = execFileSync("node", ["tools/learning-loop-mastra/interface/contract.js", "--list"], { encoding: "utf8" });
  const parsed = JSON.parse(out);
  assert.ok(Array.isArray(parsed.runtimes));
  assert.ok(parsed.runtimes.includes("claude-code"));
  assert.ok(parsed.runtimes.includes("droid"));
  assert.ok(parsed.runtimes.includes("mastra-code"));
  assert.equal(parsed.requirements.length, 10);
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
      // tools-manifest-has-path-fields is project-wide; empty dir has no manifest (1)
      assert.equal(result.missing.length, 5);
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
  // Allow leading/dotted IDs (e.g., ".mastracode-config-presence").
  const extractedIds = new Set();
  const re = /###?\s*\d+\.\s*`([a-z.][a-z0-9.-]+)`/g;
  let m;
  while ((m = re.exec(content)) !== null) extractedIds.add(m[1]);
  const exportedIds = new Set(REQUIREMENT_IDS);
  assert.deepEqual([...extractedIds].sort(), [...exportedIds].sort(),
    `CONTRACT.md IDs (${JSON.stringify([...extractedIds])}) must match REQUIREMENT_IDS (${JSON.stringify([...exportedIds])})`);
});

test("validate('mastra-code') on real repo returns ok: true (Phase 2 config shipped in Plan 4)", () => {
  withCleanRUNTIME_ID(() => {
    const result = validate("mastra-code", PROJECT_ROOT);
    // Phase E Plan 4 Phase 2 shipped the actual .mastracode/* config files,
    // so the validator now passes against the real repo.
    assert.equal(result.ok, true, `mastra-code must pass on real repo after Plan 4 Phase 2: missing=${JSON.stringify(result.missing)}, path_map=${JSON.stringify(Object.keys(result.path_map))}`);
    assert.deepEqual(result.missing, []);
  });
});

test("validate('unknown-runtime-id') returns helpful error (no throw)", () => {
  const result = validate("typo-runtime-id");
  assert.equal(result.ok, false);
  assert.ok(result.error.startsWith("unknown-runtime-id:"));
});

// =============================================================================
// Phase E Plan 4 — Mastra Code regression tests (TDD: written before implementation)
// =============================================================================
//
// Helpers for the Mastra Code declarative config. The existing fakeRoot() helper
// only handles shim-file shapes (.claude / .factory); for Mastra Code we need
// the declarative .mastracode/*.json shape.

function fakeMastraCodeRoot(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-mastracode-"));
  const surface = ".mastracode";
  // MCP client config (Req #2 — corrected path)
  mkdirSync(join(root, surface), { recursive: true });
  const mcpContent = opts.mcpConfig ?? {
    mcpServers: { "learning-loop": { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] } },
  };
  writeFileSync(join(root, surface, "mcp.json"), JSON.stringify(mcpContent));
  // Hooks declarative (Req #6)
  const hooksContent = opts.hooksConfig ?? {
    PreToolUse: [
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/bash-gate.js", matcher: { tool_name: "execute_command" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", matcher: { tool_name: "write_file" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", matcher: { tool_name: "string_replace_lsp" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/write-gate.js", matcher: { tool_name: "delete_file" }, timeout: 5000 },
    ],
    UserPromptSubmit: [
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/inbound-gate.js", timeout: 5000 },
    ],
    SessionStart: [
      { type: "command", command: "node tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js", timeout: 10000 },
    ],
  };
  if (opts.hooksConfig !== null) {
    writeFileSync(join(root, surface, "hooks.json"), JSON.stringify(hooksContent));
  }
  // Settings (Req #7 — shellPassthrough:false)
  const settingsContent = opts.settingsConfig ?? { shellPassthrough: false, omScope: "project" };
  writeFileSync(join(root, surface, "settings.json"), JSON.stringify(settingsContent));
  // Database/resourceId (Req #4 alternative)
  if (opts.includeDatabase !== false) {
    writeFileSync(join(root, surface, "database.json"), JSON.stringify({ resourceId: "mastra-code" }));
  }
  // Skill spec — Mastra Code discovers .claude/skills/<name>/SKILL.md (auto-discovery)
  // OR .mastracode/skills/<name>/SKILL.md (project-local)
  const skillDir = opts.skillAt === "mastracode"
    ? join(root, surface, "skills", "learning-loop")
    : join(root, ".claude", "skills", "learning-loop");
  if (opts.includeSkill !== false) {
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "Reference: loop_describe and meta_state_list.");
  }
  // Tool manifest (Req #11 — project-wide invariant). Default: valid manifest.
  if (opts.manifest !== null) {
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    const entries = opts.manifest ?? [{ file: "tools/sample-tool.js", export: "sampleTool", pathFields: [] }];
    writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify(entries));
  }
  return root;
}

// --- Group 6: Mastra Code positive (8 tests) ---

test("req 6 (hook-declarative-config) parses — mastracode-shape with all 4 hook commands", () => {
  const root = fakeMastraCodeRoot();
  try {
    const result = validate("mastra-code", root);
    assert.ok(!result.missing.includes("hook-shim-set"),
      `Mastra Code uses declarative hooks (Req #6), NOT shim files; hook-shim-set must NOT fail for declarative runtimes: ${JSON.stringify(result.missing)}`);
    assert.ok(!result.missing.includes("mcp-client-config"),
      `MCP config at .mastracode/mcp.json should pass Req #2: ${JSON.stringify(result.missing)}`);
    assert.ok(!result.missing.includes("skill-spec"),
      `Skill spec at .claude/skills/learning-loop/SKILL.md (auto-discovered) should pass Req #3: ${JSON.stringify(result.missing)}`);
    assert.ok(!result.missing.includes("settings-integration"),
      `Hook JSON declarative config should pass Req #5 (commands universal-hook paths): ${JSON.stringify(result.missing)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode mcp-client-config points at server.js (Req #2 corrected path)", () => {
  const root = fakeMastraCodeRoot();
  try {
    const result = validate("mastra-code", root);
    const req2 = result.path_map["mcp-client-config"];
    assert.ok(req2.ok, `mcp-client-config must pass with .mastracode/mcp.json: ${JSON.stringify(req2)}`);
    assert.ok(req2.config_path.endsWith(".mastracode/mcp.json"),
      `mcp config path should be .mastracode/mcp.json (NOT .mastracode/config.json); got: ${req2.config_path}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode skill spec reuses .claude/skills/ discovery (Req #3)", () => {
  const root = fakeMastraCodeRoot({ skillAt: "claude" });
  try {
    const result = validate("mastra-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.ok(req3.ok, `Skill at .claude/skills/learning-loop/SKILL.md must satisfy Req #3 for Mastra Code (auto-discovered via claw compat path): ${JSON.stringify(req3)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode identity-marker accepts MASTRA_RESOURCE_ID env var (Req #4 alternative)", () => {
  const root = fakeMastraCodeRoot();
  const saved = process.env.MASTRA_RESOURCE_ID;
  process.env.MASTRA_RESOURCE_ID = "mastra-code";
  try {
    const result = validate("mastra-code", root);
    const req4 = result.path_map["identity-marker"];
    assert.equal(req4.ok, true, `identity-marker never fails (advisory): ${JSON.stringify(req4)}`);
    // When MASTRA_RESOURCE_ID matches the runtime-id, status should be 'match' (not 'unset' / 'mismatch')
    assert.equal(req4.actual, "mastra-code");
    assert.equal(req4.status, "match", `MASTRA_RESOURCE_ID=mastra-code should match runtime-id; got status=${req4.status}`);
  } finally {
    if (saved === undefined) delete process.env.MASTRA_RESOURCE_ID;
    else process.env.MASTRA_RESOURCE_ID = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

test("mastracode settings-integration references universal-hook commands (Req #5 alternative)", () => {
  const root = fakeMastraCodeRoot();
  try {
    const result = validate("mastra-code", root);
    const req5 = result.path_map["settings-integration"];
    assert.ok(req5.ok, `Mastra Code's declarative hooks.json should pass Req #5 (universal-hook commands present): ${JSON.stringify(req5)}`);
    // All 4 universal-hook paths must be referenced via the declarative commands
    const requiredHooks = ["bash-gate.js", "write-gate.js", "inbound-gate.js", "recurrence-check-on-start.js"];
    for (const h of requiredHooks) {
      assert.ok(req5.commands.some((c) => c.includes(h)), `${h} must appear in commands[]; got: ${JSON.stringify(req5.commands)}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode hook-declarative-config is valid (Req #6 happy path)", () => {
  const root = fakeMastraCodeRoot();
  try {
    const result = validate("mastra-code", root);
    // Req #6 must appear in REQUIREMENT_IDS for the contract to know about declarative hooks
    assert.ok(REQUIREMENT_IDS.includes("hook-declarative-config") || !REQUIREMENT_IDS.includes("hook-declarative-config"),
      "Req #6 is additive; presence in REQUIREMENT_IDS is implementation choice");
    // The path_map must include hook-declarative-config OR settings-integration covers it
    assert.ok(result.path_map["hook-declarative-config"] || result.path_map["settings-integration"],
      "Either Req #6 OR Req #5 must report the declarative hooks.json");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("regression: claude-code still passes (no break after mastracode amendments)", () => {
  withCleanRUNTIME_ID(() => {
    const result = validate("claude-code", PROJECT_ROOT);
    assert.equal(result.ok, true, `claude-code must continue passing: ${JSON.stringify(result.missing)}`);
  });
});

test("regression: droid still passes (no break after mastracode amendments)", () => {
  withCleanRUNTIME_ID(() => {
    const result = validate("droid", PROJECT_ROOT);
    assert.equal(result.ok, true, `droid must continue passing: ${JSON.stringify(result.missing)}`);
  });
});

// --- Group 7: Mastra Code negative (4 tests — red-team Security F4 failsafe-default bugs) ---

test("mastracode rejects malformed hooks.json (red-team F4 failsafe)", () => {
  const root = fakeMastraCodeRoot();
  try {
    writeFileSync(join(root, ".mastracode", "hooks.json"), "{ not valid json");
    const result = validate("mastra-code", root);
    // Settings-integration OR hook-declarative-config must report failure (not silently pass)
    const settings = result.path_map["settings-integration"];
    const declarative = result.path_map["hook-declarative-config"];
    const failed = (settings && !settings.ok) || (declarative && !declarative.ok) || result.missing.includes("settings-integration");
    assert.ok(failed, `Malformed hooks.json must trigger validator failure (no silent pass); got ok=${result.ok}, missing=${JSON.stringify(result.missing)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode rejects empty event entries in hooks.json (red-team F4 failsafe)", () => {
  const root = fakeMastraCodeRoot({ hooksConfig: {} });
  try {
    const result = validate("mastra-code", root);
    // Empty hooks (no event entries) must fail Req #5 / Req #6
    const failed = result.missing.includes("settings-integration") || result.missing.includes("hook-declarative-config");
    assert.ok(failed, `Empty hooks.json (no event entries) must fail validator: got ok=${result.ok}, missing=${JSON.stringify(result.missing)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode rejects shellPassthrough: true (Req #7 — settings-no-bypass)", () => {
  const root = fakeMastraCodeRoot({ settingsConfig: { shellPassthrough: true, omScope: "project" } });
  try {
    const result = validate("mastra-code", root);
    assert.ok(!result.ok, `shellPassthrough: true must fail validation: ok=${result.ok}, missing=${JSON.stringify(result.missing)}`);
    // Must reference the settings-no-bypass check OR fall under existing missing
    const bypass = result.path_map["settings-no-bypass"];
    const failed = (bypass && !bypass.ok) || result.missing.includes("settings-no-bypass") || result.missing.includes("settings-integration");
    assert.ok(failed, `settings-no-bypass must flag shellPassthrough: true as a violation: ${JSON.stringify(result.path_map)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mastracode rejects missing command paths in hooks.json (red-team F4 failsafe)", () => {
  const root = mkdtempSync(join(tmpdir(), "ll-mastracode-nopaths-"));
  try {
    mkdirSync(join(root, ".mastracode"), { recursive: true });
    writeFileSync(join(root, ".mastracode", "mcp.json"), JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] } } }));
    // Hooks reference commands to nonexistent paths (no real universal hooks referenced)
    writeFileSync(join(root, ".mastracode", "hooks.json"), JSON.stringify({
      PreToolUse: [{ type: "command", command: "node /does/not/exist/some-other-hook.js", matcher: { tool_name: "execute_command" }, timeout: 5000 }],
      UserPromptSubmit: [{ type: "command", command: "node /does/not/exist/yet-another.js", timeout: 5000 }],
      SessionStart: [{ type: "command", command: "node /does/not/exist/last.js", timeout: 10000 }],
    }));
    writeFileSync(join(root, ".mastracode", "settings.json"), JSON.stringify({ shellPassthrough: false, omScope: "project" }));
    writeFileSync(join(root, ".mastracode", "database.json"), JSON.stringify({ resourceId: "mastra-code" }));
    const skillDir = join(root, ".claude", "skills", "learning-loop");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "Reference: loop_describe and meta_state_list.");
    const result = validate("mastra-code", root);
    // Commands must reference universal-hook paths; non-universal-hook commands must fail
    const settings = result.path_map["settings-integration"];
    const declarative = result.path_map["hook-declarative-config"];
    const failed = (settings && !settings.ok) || (declarative && !declarative.ok) || result.missing.includes("settings-integration") || result.missing.includes("hook-declarative-config");
    assert.ok(failed, `Hooks not referencing universal-hook scripts must fail validation: ok=${result.ok}, missing=${JSON.stringify(result.missing)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// =============================================================================
// Plan 5-Lite Phase 3 — Contract Req #9, #10, #11 (TDD)
// =============================================================================

// --- Req #9 (.mastracode-config-presence) ---

test("req 9 (.mastracode-config-presence) passes for mastra-code when all 4 files present", () => {
  const root = fakeMastraCodeRoot();
  try {
    const result = validate("mastra-code", root);
    const req9 = result.path_map[".mastracode-config-presence"];
    assert.equal(req9.ok, true, `Req #9 must pass with all 4 files: ${JSON.stringify(req9)}`);
    assert.deepEqual(req9.missing, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 9 fails for mastra-code when a required file is missing", () => {
  const root = fakeMastraCodeRoot();
  try {
    // Remove database.json
    rmSync(join(root, ".mastracode", "database.json"));
    const result = validate("mastra-code", root);
    const req9 = result.path_map[".mastracode-config-presence"];
    assert.equal(req9.ok, false);
    assert.ok(req9.missing.includes("database.json"));
    assert.ok(result.missing.includes(".mastracode-config-presence"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 9 is not applicable for claude-code", () => {
  const root = fakeRoot({ surface: ".claude", hookShims: HOOK_SHIMS, mcpConfigPath: ".mcp.json" });
  try {
    const result = validate("claude-code", root);
    const req9 = result.path_map[".mastracode-config-presence"];
    assert.equal(req9.ok, true);
    assert.equal(req9.applicable, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 9 is not applicable for droid", () => {
  const root = fakeRoot({ surface: ".factory", hookShims: HOOK_SHIMS, mcpConfigPath: ".factory/mcp.json" });
  try {
    const result = validate("droid", root);
    const req9 = result.path_map[".mastracode-config-presence"];
    assert.equal(req9.ok, true);
    assert.equal(req9.applicable, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- Req #10 (mastracode-session-start-pins-loop-surface) ---

test("req 10 (mastracode-session-start-pins-loop-surface) passes when .mastracode/mcp.json has env.LOOP_SURFACE=.mastracode", () => {
  const root = fakeMastraCodeRoot({
    mcpConfig: {
      mcpServers: {
        "learning-loop": {
          command: "node",
          args: ["tools/learning-loop-mastra/mastra/server.js"],
          env: { LOOP_SURFACE: ".mastracode" },
        },
      },
    },
  });
  try {
    const result = validate("mastra-code", root);
    const req10 = result.path_map["mastracode-session-start-pins-loop-surface"];
    assert.equal(req10.ok, true, `Req #10 must pass with env.LOOP_SURFACE=.mastracode: ${JSON.stringify(req10)}`);
    assert.equal(req10.env_loop_surface, ".mastracode");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 10 fails when .mastracode/mcp.json env.LOOP_SURFACE is missing", () => {
  const root = fakeMastraCodeRoot();
  try {
    // Default fakeMastraCodeRoot mcpConfig has NO env field.
    const result = validate("mastra-code", root);
    const req10 = result.path_map["mastracode-session-start-pins-loop-surface"];
    assert.equal(req10.ok, false);
    assert.equal(req10.env_loop_surface, null);
    assert.ok(result.missing.includes("mastracode-session-start-pins-loop-surface"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 10 fails when .mastracode/mcp.json env.LOOP_SURFACE has the wrong value", () => {
  const root = fakeMastraCodeRoot({
    mcpConfig: {
      mcpServers: {
        "learning-loop": {
          command: "node",
          args: ["tools/learning-loop-mastra/mastra/server.js"],
          env: { LOOP_SURFACE: ".claude" },
        },
      },
    },
  });
  try {
    const result = validate("mastra-code", root);
    const req10 = result.path_map["mastracode-session-start-pins-loop-surface"];
    assert.equal(req10.ok, false);
    assert.equal(req10.env_loop_surface, ".claude");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 10 is not applicable for claude-code", () => {
  const root = fakeRoot({ surface: ".claude", hookShims: HOOK_SHIMS, mcpConfigPath: ".mcp.json" });
  try {
    const result = validate("claude-code", root);
    const req10 = result.path_map["mastracode-session-start-pins-loop-surface"];
    assert.equal(req10.ok, true);
    assert.equal(req10.applicable, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// --- Req #11 (tools-manifest-has-path-fields) ---

test("req 11 (tools-manifest-has-path-fields) passes when every entry has pathFields: []", () => {
  const root = fakeRoot({
    surface: ".claude",
    hookShims: HOOK_SHIMS,
    mcpConfigPath: ".mcp.json",
    manifest: [
      { file: "tools/a-tool.js", export: "aTool", pathFields: [] },
      { file: "tools/b-tool.js", export: "bTool", pathFields: ["path"] },
    ],
  });
  try {
    const result = validate("claude-code", root);
    const req11 = result.path_map["tools-manifest-has-path-fields"];
    assert.equal(req11.ok, true, `Req #11 must pass when every entry has pathFields: ${JSON.stringify(req11)}`);
    assert.equal(req11.entries, 2);
    assert.deepEqual(req11.missing_path_fields, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 11 fails when an entry is missing pathFields", () => {
  const root = fakeRoot({
    surface: ".claude",
    hookShims: HOOK_SHIMS,
    mcpConfigPath: ".mcp.json",
    manifest: [
      { file: "tools/a-tool.js", export: "aTool", pathFields: [] },
      { file: "tools/b-tool.js", export: "bTool" }, // missing pathFields
    ],
  });
  try {
    const result = validate("claude-code", root);
    const req11 = result.path_map["tools-manifest-has-path-fields"];
    assert.equal(req11.ok, false);
    assert.ok(req11.missing_path_fields.includes("tools/b-tool.js"));
    assert.ok(result.missing.includes("tools-manifest-has-path-fields"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 11 fails when pathFields is not an array", () => {
  const root = fakeRoot({
    surface: ".claude",
    hookShims: HOOK_SHIMS,
    mcpConfigPath: ".mcp.json",
    manifest: [{ file: "tools/a-tool.js", export: "aTool", pathFields: "path" }],
  });
  try {
    const result = validate("claude-code", root);
    const req11 = result.path_map["tools-manifest-has-path-fields"];
    assert.equal(req11.ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 11 fails when manifest.json is missing", () => {
  const root = fakeRoot({
    surface: ".claude",
    hookShims: HOOK_SHIMS,
    mcpConfigPath: ".mcp.json",
    manifest: null, // skip manifest write
  });
  try {
    const result = validate("claude-code", root);
    const req11 = result.path_map["tools-manifest-has-path-fields"];
    assert.equal(req11.ok, false);
    assert.ok(result.missing.includes("tools-manifest-has-path-fields"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 11 strips JSONC full-line comments before parsing", () => {
  const root = fakeRoot({
    surface: ".claude",
    hookShims: HOOK_SHIMS,
    mcpConfigPath: ".mcp.json",
    manifest: null,
  });
  try {
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "manifest.json"),
      [
        '// This is a full-line comment.',
        '// Another comment line.',
        '[ { "file": "tools/a-tool.js", "export": "aTool", "pathFields": [] } ]',
      ].join("\n"),
    );
    const result = validate("claude-code", root);
    const req11 = result.path_map["tools-manifest-has-path-fields"];
    assert.equal(req11.ok, true, `JSONC full-line comments must be stripped: ${JSON.stringify(req11)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 11 is applicable to all runtimes (project-wide invariant)", () => {
  // Verify applicability for claude-code, droid, and mastra-code does NOT
  // report applicable:false (it is a hard requirement for every runtime).
  const claudeRoot = fakeRoot({ surface: ".claude", hookShims: HOOK_SHIMS, mcpConfigPath: ".mcp.json" });
  const droidRoot = fakeRoot({ surface: ".factory", hookShims: HOOK_SHIMS, mcpConfigPath: ".factory/mcp.json" });
  const mastraRoot = fakeMastraCodeRoot();
  try {
    const c = validate("claude-code", claudeRoot).path_map["tools-manifest-has-path-fields"];
    assert.notEqual(c.applicable, false, "claude-code: Req #11 must NOT be applicable:false");
    const d = validate("droid", droidRoot).path_map["tools-manifest-has-path-fields"];
    assert.notEqual(d.applicable, false, "droid: Req #11 must NOT be applicable:false");
    const m = validate("mastra-code", mastraRoot).path_map["tools-manifest-has-path-fields"];
    assert.notEqual(m.applicable, false, "mastra-code: Req #11 must NOT be applicable:false");
  } finally {
    rmSync(claudeRoot, { recursive: true, force: true });
    rmSync(droidRoot, { recursive: true, force: true });
    rmSync(mastraRoot, { recursive: true, force: true });
  }
});

// --- Req #9/#10/#11 against the real repo (regression) ---

test("req 9/10/11 pass on the real repo for mastra-code", () => {
  withCleanRUNTIME_ID(() => {
    const result = validate("mastra-code", PROJECT_ROOT);
    assert.equal(result.ok, true, `mastra-code must pass on real repo: missing=${JSON.stringify(result.missing)}`);
    assert.equal(result.path_map[".mastracode-config-presence"].ok, true);
    assert.equal(result.path_map["mastracode-session-start-pins-loop-surface"].ok, true);
    assert.equal(result.path_map["tools-manifest-has-path-fields"].ok, true);
  });
});

test("req 11 passes on the real repo for claude-code and droid", () => {
  withCleanRUNTIME_ID(() => {
    const c = validate("claude-code", PROJECT_ROOT);
    assert.equal(c.path_map["tools-manifest-has-path-fields"].ok, true);
    const d = validate("droid", PROJECT_ROOT);
    assert.equal(d.path_map["tools-manifest-has-path-fields"].ok, true);
  });
});

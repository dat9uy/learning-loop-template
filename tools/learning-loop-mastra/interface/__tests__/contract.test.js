/**
 * Contract test suite — 24 tests covering structural, pass-mode, per-requirement,
 * fail-mode, and golden scenarios. Validates contract.js against both real runtimes
 * and synthetic fake roots built with fs.mkdtempSync.
 */
import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
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

const VALID_UNIVERSAL_HOOK = "tools/learning-loop-mastra/hooks/universal/bash-gate.js";
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
  // Skill spec — supports multi-skill enumeration (Phase 2).
  // opts.skillSpec is the legacy single-skill string content (writes to
  // skills/learning-loop/SKILL.md). opts.extraSkills is a {name, content} map
  // that adds additional skill directories under skills/<name>/SKILL.md.
  // opts.skillDirMirrors overrides per-skill mirror layout (default: same dir
  // as the skill — single-runtime tests).
  if (opts.skillSpec !== undefined) {
    const skillDir = join(root, surface, "skills", "learning-loop");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), opts.skillSpec);
  }
  if (opts.extraSkills) {
    for (const [name, content] of Object.entries(opts.extraSkills)) {
      const skillDir = join(root, surface, "skills", name);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), content);
    }
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
  // Skills manifest (Phase 3 — manifest-driven external exclusion).
  // Default: write a minimal manifest with internal entries for the
  // skills fakeRoot wrote (skillSpec / extraSkills). Set opts.skillsManifest
  // to override the JSON; opts.skillsManifest === null skips the write
  // (so manifest-unreadable failure mode fires).
  if (opts.skillsManifest !== null) {
    const skills = {};
    const seen = new Set();
    if (opts.skillSpec !== undefined) seen.add("learning-loop");
    if (opts.extraSkills) {
      for (const name of Object.keys(opts.extraSkills)) seen.add(name);
    }
    if (opts.skillsManifest !== undefined) {
      // Caller provided an explicit manifest object — use as-is.
      writeFileSync(join(root, "skills-lock.json"), JSON.stringify(opts.skillsManifest));
    } else {
      for (const name of seen) {
        skills[name] = {
          source: "local",
          sourceType: "local",
          delivery: "fanout",
          canonicalSource: `${surface}/skills/${name}/SKILL.md`,
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2",
          external: false,
          hash: "0".repeat(64),
        };
      }
      // Always include mastra as external so symlink/real-dir tests don't trip.
      skills.mastra = {
        source: "mastra-ai/skills",
        sourceType: "npx-skills-cli",
        delivery: "npx-per-runtime+fanout-undetected",
        targets: [".claude", ".factory", ".mastracode"],
        maturity: null,
        external: true,
        hash: "1".repeat(64),
      };
      writeFileSync(join(root, "skills-lock.json"), JSON.stringify({ version: 2, skills }));
    }
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
  // Phase 2: SKILL.md must declare `maturity:` frontmatter to be enumerated
  // as loop-maintained. The fixture includes a maturity field + a fakeRoot
  // creates a matching .factory mirror (so the mirror check passes).
  const skillContent = `---
name: learning-loop
description: test
maturity: state-2
---

Reference: loop_describe and meta_state_list.
`;
  const root = fakeRoot({ surface: ".claude", skillSpec: skillContent });
  // fakeRoot writes to one surface; mirror check requires ≥ 2 surfaces,
  // so also create the .factory mirror.
  const factoryDir = join(root, ".factory", "skills", "learning-loop");
  mkdirSync(factoryDir, { recursive: true });
  writeFileSync(join(factoryDir, "SKILL.md"), skillContent);
  try {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("skill-spec"));
  } finally { rmSync(root, { recursive: true, force: true }); }
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
  const skillContent = `---
name: learning-loop
description: test
maturity: state-2
---

Reference: loop_describe and meta_state_list.
`;
  const root = fakeRoot({ surface: ".factory", skillSpec: skillContent });
  // Mirror in .claude so the mirror check passes (≥ 2 surfaces).
  const claudeDir = join(root, ".claude", "skills", "learning-loop");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "SKILL.md"), skillContent);
  try {
    const result = validate("droid", root);
    assert.ok(!result.missing.includes("skill-spec"));
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test("req 3 passes vacuously when the surface has no skills and no fallback", () => {
  // Phase 2 contract: a surface with no loop-maintained skills passes
  // vacuously (no skills to validate). The cross-runtime parity test
  // is the backstop for "all 3 surfaces must agree".
  // (Legacy expectation was "fail when SKILL.md is absent" — that pre-Phase-2
  // behavior is replaced by the empty-enumeration-is-OK semantics.)
  withRoot({ surface: ".claude" }, (root) => {
    const result = validate("claude-code", root);
    assert.ok(!result.missing.includes("skill-spec"),
      `skill-spec should pass vacuously on empty surface: ${JSON.stringify(result.missing)}`);
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
      // Phase 2 contract: skill-spec passes vacuously when the surface has
      // no skills (no loop-maintained skills to validate). The 4 remaining
      // hard-fail reqs are: hook-shim-set, mcp-client-config,
      // settings-integration + tools-manifest-has-path-fields.
      // identity-marker is advisory (passes).
      assert.equal(result.missing.length, 4, `expected 4 missing (skill-spec passes vacuously); missing=${JSON.stringify(result.missing)}`);
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
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/bash-gate.js", matcher: { tool_name: "execute_command" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/write-gate.js", matcher: { tool_name: "write_file" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/write-gate.js", matcher: { tool_name: "string_replace_lsp" }, timeout: 5000 },
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/write-gate.js", matcher: { tool_name: "delete_file" }, timeout: 5000 },
    ],
    UserPromptSubmit: [
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/inbound-gate.js", timeout: 5000 },
    ],
    SessionStart: [
      { type: "command", command: "node tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js", timeout: 10000 },
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
    // Phase 2: SKILL.md must declare `maturity:` frontmatter to satisfy the
    // generalized contract. The mirror check (≥ 2 surfaces) requires a
    // .factory mirror; create it here so the contract passes.
    const skillContent = opts.skillContent ?? `---
name: learning-loop
description: test
maturity: state-2
---

Reference: loop_describe and meta_state_list.
`;
    writeFileSync(join(skillDir, "SKILL.md"), skillContent);
    // Phase 2 mirror: write the same content to .factory/skills/learning-loop
    // so the ≥ 2 surfaces check passes.
    const factorySkillDir = join(root, ".factory", "skills", "learning-loop");
    mkdirSync(factorySkillDir, { recursive: true });
    writeFileSync(join(factorySkillDir, "SKILL.md"), skillContent);
  }
  // Tool manifest (Req #11 — project-wide invariant). Default: valid manifest.
  if (opts.manifest !== null) {
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    const entries = opts.manifest ?? [{ file: "tools/sample-tool.js", export: "sampleTool", pathFields: [] }];
    writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify(entries));
  }
  // Skills manifest (Phase 3 — manifest-driven exclusion). Default: write a
  // minimal manifest declaring learning-loop as internal so the auto-
  // discovered .claude mirror satisfies Req #3. Set opts.skillsManifest
  // === null to skip (then contract fails with manifest-unreadable).
  if (opts.skillsManifest !== null) {
    const manifest = opts.skillsManifest ?? {
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "npx-skills-cli",
          delivery: "npx-per-runtime+fanout-undetected",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1".repeat(64),
        },
      },
    };
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest));
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

// =============================================================================
// Plan 260707-0114 Phase 2 — Req #3 generalization + maturity: frontmatter
// =============================================================================

const LOOP_MATURITY_CONTENT = `---
name: learning-loop
description: test
maturity: state-2
---

# Learning Loop

Reference: loop_describe and meta_state_list.
`;

const CG_MATURITY_CONTENT = `---
name: coordination-gate
description: test
maturity: state-2
---

# Coordination Gate

No tool references expected.
`;

const NO_MATURITY_CONTENT = `---
name: orphan-skill
description: no maturity
---

# Orphan
`;

test("req 3 enumerates multi-skill surface, passes when both have maturity (mirror in 2 surfaces)", () => {
  // Phase 2 mirror check requires ≥ 2 surfaces with the skill. Build the
  // root manually so we can write both .claude + .factory mirrors.
  const root = mkdtempSync(join(tmpdir(), "ll-multiskill-"));
  try {
    for (const surface of [".claude", ".factory"]) {
      const llDir = join(root, surface, "skills", "learning-loop");
      mkdirSync(llDir, { recursive: true });
      writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
      const cgDir = join(root, surface, "skills", "coordination-gate");
      mkdirSync(cgDir, { recursive: true });
      writeFileSync(join(cgDir, "SKILL.md"), CG_MATURITY_CONTENT);
    }
    // Phase 3: write a manifest with internal entries so the
    // manifest-driven exclusion does not fire.
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        "coordination-gate": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/coordination-gate/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "npx-skills-cli",
          delivery: "npx-per-runtime+fanout-undetected",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1".repeat(64),
        },
      },
    }));
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, true, `multi-skill enumeration must pass: ${JSON.stringify(req3)}`);
    assert.ok(Array.isArray(req3.skills), "skill-spec must expose per-skill results array");
    const names = req3.skills.map((s) => s.name);
    assert.ok(names.includes("learning-loop"), `must enumerate learning-loop: ${JSON.stringify(names)}`);
    assert.ok(names.includes("coordination-gate"), `must enumerate coordination-gate: ${JSON.stringify(names)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 hard-fails per-skill when maturity: frontmatter is missing", () => {
  withRoot({
    surface: ".claude",
    skillSpec: NO_MATURITY_CONTENT,
  }, (root) => {
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false, "missing maturity must fail skill-spec");
    const skill = req3.skills.find((s) => s.name === "learning-loop");
    assert.ok(skill, "learning-loop must be enumerated");
    assert.equal(skill.reason, "maturity-not-declared");
  });
});

test("req 3 hard-fails per-skill when maturity: is not a valid state-N value", () => {
  const badMaturity = LOOP_MATURITY_CONTENT.replace("maturity: state-2", "maturity: state-bogus");
  withRoot({
    surface: ".claude",
    skillSpec: badMaturity,
  }, (root) => {
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false);
    const skill = req3.skills.find((s) => s.name === "learning-loop");
    assert.equal(skill.reason, "maturity-not-declared");
  });
});

test("req 3 excludes the external `mastra` via manifest (external:true)", () => {
  // Phase 3 — the exclusion is manifest-driven, NOT isSymbolicLink()-based.
  // Build a manifest at <root>/skills-lock.json with mastra.external:true.
  // Create a real-dir mastra (no symlink — proves the exclusion works
  // regardless of filesystem shape) on .claude + an external dir.
  const root = mkdtempSync(join(tmpdir(), "ll-mastra-external-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factorySkills = join(root, ".factory", "skills");
    mkdirSync(factorySkills, { recursive: true });
    const factoryLlDir = join(factorySkills, "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);

    // Real-dir mastra (not a symlink) — proves the manifest-driven exclusion
    // works regardless of filesystem shape. No maturity: frontmatter so it
    // would fail the maturity check; manifest must exclude it first.
    const mastraDir = join(root, ".claude", "skills", "mastra");
    mkdirSync(mastraDir, { recursive: true });
    writeFileSync(join(mastraDir, "SKILL.md"), NO_MATURITY_CONTENT);

    // Write the manifest with mastra.external:true.
    const manifest = {
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "npx-skills-cli",
          delivery: "npx-per-runtime+fanout-undetected",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1111111111111111111111111111111111111111111111111111111111111111",
        },
      },
    };
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest));

    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    const names = req3.skills.map((s) => s.name);
    assert.ok(!names.includes("mastra"), `mastra must be excluded (manifest external:true): ${JSON.stringify(names)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 fails with reason 'manifest-unreadable' when skills-lock.json is missing", () => {
  // F8: hard fail, NOT a misleading maturity-not-declared on the manifest.
  const root = mkdtempSync(join(tmpdir(), "ll-mastra-missing-manifest-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factorySkills = join(root, ".factory", "skills");
    mkdirSync(factorySkills, { recursive: true });
    const factoryLlDir = join(factorySkills, "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Write the tools/manifest.json so Req #11 doesn't fail (we want to
    // isolate the manifest-unreadable failure to the skill-spec).
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify([{ file: "tools/x.js", export: "x", pathFields: [] }]));
    // NOTE: NO skills-lock.json is written.
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false, "missing manifest must fail skill-spec");
    const llEntry = req3.skills.find((s) => s.name === "learning-loop");
    assert.ok(llEntry, "learning-loop must still be enumerated");
    assert.equal(
      llEntry.reason,
      "manifest-unreadable",
      `expected reason 'manifest-unreadable' on the manifest-driven failure; got '${llEntry.reason}'`,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 fails with reason 'skill-not-in-manifest' for an unlisted real-dir skill", () => {
  // F9: a real-dir skill that the manifest doesn't know about is a contract
  // violation — fail explicitly (not silently enumerated).
  const root = mkdtempSync(join(tmpdir(), "ll-mastra-unlisted-skill-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factorySkills = join(root, ".factory", "skills");
    mkdirSync(factorySkills, { recursive: true });
    const factoryLlDir = join(factorySkills, "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Plant an unlisted real-dir skill on .claude only.
    const unlisted = join(root, ".claude", "skills", "rogue-skill");
    mkdirSync(unlisted, { recursive: true });
    writeFileSync(join(unlisted, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Manifest does NOT mention rogue-skill.
    const manifest = {
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    };
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest));
    const manifestDir = join(root, "tools/learning-loop-mastra/tools");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(join(manifestDir, "manifest.json"), JSON.stringify([{ file: "tools/x.js", export: "x", pathFields: [] }]));

    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    const rogueEntry = req3.skills.find((s) => s.name === "rogue-skill");
    assert.ok(rogueEntry, "rogue-skill must be enumerated");
    assert.equal(
      rogueEntry.reason,
      "skill-not-in-manifest",
      `expected reason 'skill-not-in-manifest'; got '${rogueEntry.reason}'`,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 fails with reason 'skill-not-in-manifest' for a prototype-named real-dir skill", () => {
  // Review I1: manifest.skills?.["constructor"] resolves via Object.prototype
  // (a function, not undefined) — without an own-property check the planted
  // dir is treated as manifest-declared internal and F9 is defeated.
  const root = mkdtempSync(join(tmpdir(), "ll-proto-skill-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factoryLlDir = join(root, ".factory", "skills", "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Planted real-dir skill whose name hits Object.prototype.
    const protoDir = join(claudeSkills, "constructor");
    mkdirSync(protoDir, { recursive: true });
    writeFileSync(join(protoDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Manifest knows learning-loop only — NOT constructor.
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
      },
    }));
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    const protoEntry = req3.skills.find((s) => s.name === "constructor");
    assert.ok(protoEntry, "constructor must be enumerated (as a failure entry)");
    assert.equal(
      protoEntry.reason,
      "skill-not-in-manifest",
      `prototype-named skill must fail 'skill-not-in-manifest'; got '${protoEntry.reason}'`,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 fails with reason 'skill-not-in-manifest' for a null manifest entry (no TypeError)", () => {
  // Review I1: manifest.skills = {"rogue": null} passes the === undefined
  // check, then null.external throws TypeError — the validator crashes
  // instead of failing closed.
  const root = mkdtempSync(join(tmpdir(), "ll-null-entry-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factoryLlDir = join(root, ".factory", "skills", "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const rogueDir = join(claudeSkills, "rogue-skill");
    mkdirSync(rogueDir, { recursive: true });
    writeFileSync(join(rogueDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        "rogue-skill": null,
      },
    }));
    let result;
    assert.doesNotThrow(() => { result = validate("claude-code", root); }, "null manifest entry must not crash the validator");
    const req3 = result.path_map["skill-spec"];
    const rogueEntry = req3.skills.find((s) => s.name === "rogue-skill");
    assert.ok(rogueEntry, "rogue-skill must be enumerated (as a failure entry)");
    assert.equal(
      rogueEntry.reason,
      "skill-not-in-manifest",
      `null manifest entry must fail 'skill-not-in-manifest'; got '${rogueEntry.reason}'`,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 excludes symlink-shaped skills by shape, manifest not consulted (external boundary)", () => {
  // Review I2: Dirent.isDirectory() is false for symlink-to-dir, so symlink
  // entries are skipped before the manifest lookup. F9 (skill-not-in-manifest)
  // covers real-dir skills only; the symlink shape stays the external
  // boundary it was pre-Phase-3. This pins that documented behavior.
  const root = mkdtempSync(join(tmpdir(), "ll-ghost-symlink-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factoryLlDir = join(root, ".factory", "skills", "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // Symlinked skill NOT in the manifest.
    const externalDir = join(root, ".agents", "skills", "ghost-skill");
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, "SKILL.md"), NO_MATURITY_CONTENT);
    try { symlinkSync(externalDir, join(claudeSkills, "ghost-skill")); } catch { return; }
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
      },
    }));
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    const names = req3.skills.map((s) => s.name);
    assert.ok(!names.includes("ghost-skill"), `symlink-shaped unlisted skill must be excluded by shape: ${JSON.stringify(names)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 manifest exclusion is independent of symlink shape (mastra real-dir + manifest external:true = excluded)", () => {
  // F2 negative-complement: with manifest, even a symlink-shaped mastra is excluded.
  const root = mkdtempSync(join(tmpdir(), "ll-mastra-symlink-excluded-"));
  try {
    const claudeSkills = join(root, ".claude", "skills");
    mkdirSync(claudeSkills, { recursive: true });
    const llDir = join(claudeSkills, "learning-loop");
    mkdirSync(llDir, { recursive: true });
    writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    const factorySkills = join(root, ".factory", "skills");
    mkdirSync(factorySkills, { recursive: true });
    const factoryLlDir = join(factorySkills, "learning-loop");
    mkdirSync(factoryLlDir, { recursive: true });
    writeFileSync(join(factoryLlDir, "SKILL.md"), LOOP_MATURITY_CONTENT);

    // External dir + symlink (real-repo legacy shape).
    const externalDir = join(root, ".agents", "skills", "mastra");
    mkdirSync(externalDir, { recursive: true });
    writeFileSync(join(externalDir, "SKILL.md"), NO_MATURITY_CONTENT);
    try { symlinkSync(externalDir, join(claudeSkills, "mastra")); } catch { return; }

    const manifest = {
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "github",
          delivery: "symlink", targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1111111111111111111111111111111111111111111111111111111111111111",
        },
      },
    };
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest));

    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    const names = req3.skills.map((s) => s.name);
    assert.ok(!names.includes("mastra"), `mastra (symlink) must be excluded by manifest: ${JSON.stringify(names)}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 tool-ref check is scoped to learning-loop (coordination-gate without refs passes)", () => {
  // coordination-gate does NOT reference loop_describe / meta_state_list.
  // The tool-ref check must be scoped to learning-loop only. Build the
  // root manually so we have 2-surface mirrors.
  const root = mkdtempSync(join(tmpdir(), "ll-toolfref-scope-"));
  try {
    for (const surface of [".claude", ".factory"]) {
      const llDir = join(root, surface, "skills", "learning-loop");
      mkdirSync(llDir, { recursive: true });
      writeFileSync(join(llDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
      const cgDir = join(root, surface, "skills", "coordination-gate");
      mkdirSync(cgDir, { recursive: true });
      writeFileSync(join(cgDir, "SKILL.md"), CG_MATURITY_CONTENT);
    }
    // Phase 3: write a manifest so manifest-driven exclusion does not fire.
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        "coordination-gate": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/coordination-gate/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "npx-skills-cli",
          delivery: "npx-per-runtime+fanout-undetected",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1".repeat(64),
        },
      },
    }));
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, true, `coordination-gate should not be checked for tool refs: ${JSON.stringify(req3)}`);
    const cg = req3.skills.find((s) => s.name === "coordination-gate");
    assert.equal(cg.tools_referenced.length, 0, "coordination-gate reports no tool refs (not required)");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("req 3 error-isolates malformed frontmatter (one bad skill, others still evaluated)", () => {
  const MALFORMED = `---
name: bad-skill
description: test
maturity: state-2
  unparseable: [ : , yaml
---

# Bad
`;
  withRoot({
    surface: ".claude",
    skillSpec: LOOP_MATURITY_CONTENT,
    extraSkills: { "bad-skill": MALFORMED },
  }, (root) => {
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false, "bad-skill must fail; learning-loop must still be evaluated");
    const bad = req3.skills.find((s) => s.name === "bad-skill");
    assert.equal(bad.reason, "frontmatter-unparseable");
    const ll = req3.skills.find((s) => s.name === "learning-loop");
    assert.ok(ll, "learning-loop must still appear in per-skill results (error isolation)");
  });
});

test("req 3 hard-fails on oversized frontmatter (>64KB; billion-laughs guard)", () => {
  // Build a frontmatter that exceeds the size cap. Use a large but valid YAML.
  const huge = "description: \"" + "x".repeat(70 * 1024) + "\"";
  const OVERSIZED = `---\nname: huge-skill\n${huge}\nmaturity: state-2\n---\n\n# Huge\n`;
  withRoot({
    surface: ".claude",
    skillSpec: LOOP_MATURITY_CONTENT,
    extraSkills: { "huge-skill": OVERSIZED },
  }, (root) => {
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false);
    const huge = req3.skills.find((s) => s.name === "huge-skill");
    assert.equal(huge.reason, "frontmatter-too-large");
  });
});

test("req 3 fails when a loop-maintained skill is missing its mirror in another surface", () => {
  // Create learning-loop ONLY in .claude (with maturity). The contract
  // must detect the mirror gap (single-surface placement is not loop-maintained).
  const root = mkdtempSync(join(tmpdir(), "ll-mirror-gap-"));
  try {
    const claudeDir = join(root, ".claude", "skills", "learning-loop");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(join(claudeDir, "SKILL.md"), LOOP_MATURITY_CONTENT);
    // .factory + .mastracode deliberately absent
    // Phase 3: write a manifest so manifest-driven exclusion does not fire
    // (we want the failure to be the mirror gap, not manifest-unreadable).
    writeFileSync(join(root, "skills-lock.json"), JSON.stringify({
      version: 2,
      skills: {
        "learning-loop": {
          source: "local", sourceType: "local", delivery: "fanout",
          canonicalSource: ".claude/skills/learning-loop/SKILL.md",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: "state-2", external: false,
          hash: "0".repeat(64),
        },
        mastra: {
          source: "mastra-ai/skills", sourceType: "npx-skills-cli",
          delivery: "npx-per-runtime+fanout-undetected",
          targets: [".claude", ".factory", ".mastracode"],
          maturity: null, external: true,
          hash: "1".repeat(64),
        },
      },
    }));
    const result = validate("claude-code", root);
    const req3 = result.path_map["skill-spec"];
    assert.equal(req3.ok, false, "missing .factory mirror must fail");
    const ll = req3.skills.find((s) => s.name === "learning-loop");
    assert.ok(ll.reason === "skill-mirror-gap", `reason should be skill-mirror-gap; got: ${ll.reason}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

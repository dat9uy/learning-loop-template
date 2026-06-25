#!/usr/bin/env node
/**
 * tools/learning-loop-mastra/interface/contract.js
 * Runtime-interface contract validator. Verifies 5 requirements in CONTRACT.md.
 *
 * CLI: node tools/learning-loop-mastra/interface/contract.js <runtimeId> [rootPath]
 *      node tools/learning-loop-mastra/interface/contract.js --list
 *
 * FCIS: zero `@mastra/*` imports.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Per-runtime config layout. Surface = runtime dir at project root.
// mcp_config = path to MCP server config (relative to project root).
// settings = path to settings file with hooks arrays (relative to surface).
const RUNTIMES = {
  "claude-code": { surface: ".claude",     mcp_config: ".mcp.json",            settings: "settings.json" },
  "droid":       { surface: ".factory",    mcp_config: ".factory/mcp.json",    settings: "settings.json" },
  "mastra-code": { surface: ".mastracode", mcp_config: ".mastracode/config.json", settings: "config.json" },
};

const SHIM_BASENAMES = [
  "bash-coordination-gate.cjs",
  "write-coordination-gate.cjs",
  "inbound-state-gate.cjs",
  "recurrence-check-on-start.cjs",
];

const REQUIRED_TOOL_REFS = ["loop_describe", "meta_state_list"];

export const REQUIREMENT_IDS = [
  "hook-shim-set",
  "mcp-client-config",
  "skill-spec",
  "identity-marker",
  "settings-integration",
];

function readJsonSafe(p) {
  try {
    const content = readFileSync(p, "utf8").trim();
    if (content.length === 0) return { ok: false, error: "empty file" };
    return { ok: true, data: JSON.parse(content) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function findUniversalHookPath(shimContent) {
  // Best-effort: extract the first argument to execFileSync('node', [...]) for documentation.
  // RED-TEAM NOTE (Finding F1, 2026-06-25): real shims pass `[universalHook]` as a path.join() variable,
  // not a string literal. The regex below matches the LITERAL form only; for variable form it returns
  // null. This is acceptable because `universal_target` is for documentation (path_map), not gating.
  const match = shimContent.match(/execFileSync\(\s*['"]node['"]\s*,\s*\[(\s*['"][^'"]+['"])/);
  return match ? match[1].slice(1, -1) : null;
}

function checkHookShimSet(runtimeId, rootPath) {
  const { surface } = RUNTIMES[runtimeId];
  const shimDir = join(rootPath, surface, "coordination", "hooks");
  const shims = SHIM_BASENAMES.map((basename) => {
    const shimPath = join(shimDir, basename);
    const exists = existsSync(shimPath);
    let universalTarget = null;
    let universalExists = false;
    if (exists) {
      const content = readFileSync(shimPath, "utf8");
      const captured = findUniversalHookPath(content);
      if (captured) {
        const idx = captured.indexOf("tools/learning-loop-mastra/hooks/legacy/");
        universalTarget = idx >= 0 ? join(rootPath, captured.slice(idx)) : null;
        if (universalTarget) universalExists = existsSync(universalTarget);
      }
    }
    return { name: basename, path: shimPath, universal_target: universalTarget, universal_exists: universalExists };
  });
  // Pass = all 4 shims exist as files. Universal-hook wiring is git-tracked, not runtime-mutable;
  // gating on `universal_exists` would silently fail for both runtimes (red-team Finding F1).
  const allExist = shims.every((s) => existsSync(s.path));
  return { id: "hook-shim-set", ok: allExist, shim_dir: shimDir, shims };
}

function checkMcpClientConfig(runtimeId, rootPath) {
  const { mcp_config } = RUNTIMES[runtimeId];
  const configPath = join(rootPath, mcp_config);
  const parsed = readJsonSafe(configPath);
  if (!parsed.ok) {
    return { id: "mcp-client-config", ok: false, config_path: configPath, entry: null, parse_error: parsed.error };
  }
  const entry = parsed.data?.mcpServers?.["learning-loop"] ?? null;
  const targetOk = !!entry
    && Array.isArray(entry.args)
    && entry.args.some((a) => typeof a === "string" && a.endsWith("tools/learning-loop-mastra/mastra/server.js"));
  return { id: "mcp-client-config", ok: !!entry && targetOk, config_path: configPath, entry };
}

function checkSkillSpec(runtimeId, rootPath) {
  const { surface } = RUNTIMES[runtimeId];
  const skillPath = join(rootPath, surface, "skills", "learning-loop", "SKILL.md");
  if (!existsSync(skillPath)) {
    return { id: "skill-spec", ok: false, skill_path: skillPath, has_tools_block: false, tools_referenced: [] };
  }
  const content = readFileSync(skillPath, "utf8");
  const hasToolsBlock = /^tools:\s*$/m.test(content) || /^\s*-\s+loop_describe/m.test(content);
  const toolsReferenced = REQUIRED_TOOL_REFS.filter((n) => content.includes(n));
  const ok = toolsReferenced.length === REQUIRED_TOOL_REFS.length;
  return { id: "skill-spec", ok, skill_path: skillPath, has_tools_block: hasToolsBlock, tools_referenced: toolsReferenced };
}

function checkIdentityMarker(runtimeId) {
  const expected = runtimeId;
  const actual = process.env.RUNTIME_ID ?? null;
  const status = actual === null ? "unset" : actual === expected ? "match" : "mismatch";
  return { id: "identity-marker", ok: true, env_var: "RUNTIME_ID", expected, actual, status };
}

function collectHookCommands(hooksObj) {
  const commands = [];
  for (const block of Object.values(hooksObj ?? {})) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      if (!Array.isArray(entry.hooks)) continue;
      for (const h of entry.hooks) {
        if (typeof h.command === "string") commands.push(h.command);
      }
    }
  }
  return commands;
}

function checkSettingsIntegration(runtimeId, rootPath) {
  const { surface, settings } = RUNTIMES[runtimeId];
  const settingsPath = join(rootPath, surface, settings);
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) {
    return { id: "settings-integration", ok: false, settings_path: settingsPath, commands: [], shims_referenced: [], parse_error: parsed.error };
  }
  const commands = collectHookCommands(parsed.data?.hooks);
  const shimsReferenced = SHIM_BASENAMES.filter((b) => commands.some((c) => c.includes(b)));
  const ok = shimsReferenced.length === SHIM_BASENAMES.length;
  return { id: "settings-integration", ok, settings_path: settingsPath, commands, shims_referenced: shimsReferenced };
}

/**
 * Validate a runtime against the 5-requirement contract.
 * @param {string} runtimeId - One of: "claude-code", "droid", "mastra-code".
 * @param {string} [rootPath=process.cwd()] - Project root (defaults to cwd).
 * @returns {{
 *   ok: boolean,
 *   runtimeId: string,
 *   rootPath: string,
 *   missing: string[],
 *   notes: string[],
 *   path_map: object,
 *   error?: string
 * }}
 */
export function validate(runtimeId, rootPath = process.cwd()) {
  const resolvedRoot = resolve(rootPath);
  if (!Object.prototype.hasOwnProperty.call(RUNTIMES, runtimeId)) {
    return {
      ok: false,
      runtimeId,
      rootPath: resolvedRoot,
      missing: [],
      notes: [],
      path_map: {},
      error: `unknown-runtime-id: ${runtimeId}`,
    };
  }
  const checks = [
    checkHookShimSet(runtimeId, resolvedRoot),
    checkMcpClientConfig(runtimeId, resolvedRoot),
    checkSkillSpec(runtimeId, resolvedRoot),
    checkIdentityMarker(runtimeId),
    checkSettingsIntegration(runtimeId, resolvedRoot),
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.id);
  const notes = [];
  const skill = checks.find((c) => c.id === "skill-spec");
  if (skill.ok && !skill.has_tools_block) notes.push("skill-spec-no-tools-block");
  const identity = checks.find((c) => c.id === "identity-marker");
  if (identity.status === "unset") notes.push("identity-marker-not-adopted");
  if (identity.status === "mismatch") notes.push("identity-marker-mismatch");
  const shim = checks.find((c) => c.id === "hook-shim-set");
  for (const s of shim.shims) {
    // Report missing universal hook as an informational note, NOT as a hard fail
    // (red-team Finding F1 fix: gating breaks the contract for both runtimes).
    if (existsSync(s.path) && !s.universal_exists) notes.push(`${s.name}-universal-missing`);
  }
  const path_map = Object.fromEntries(checks.map((c) => [c.id, c]));
  return { ok: missing.length === 0, runtimeId, rootPath: resolvedRoot, missing, notes, path_map };
}

export function validateAll(ids, rootPath = process.cwd()) {
  return Object.fromEntries(ids.map((id) => [id, validate(id, rootPath)]));
}

// CLI mode: invoked directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.error(`usage: node contract.js <runtimeId> [rootPath]\n       node contract.js --list\nknown runtimes: ${Object.keys(RUNTIMES).join(", ")}`);
    process.exit(2);
  }
  if (args[0] === "--list") {
    console.log(JSON.stringify({ runtimes: Object.keys(RUNTIMES), requirements: REQUIREMENT_IDS }, null, 2));
    process.exit(0);
  }
  const [runtimeId, rootArg] = args;
  const result = validate(runtimeId, rootArg);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

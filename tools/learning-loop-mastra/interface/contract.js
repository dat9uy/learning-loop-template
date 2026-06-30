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
  // Phase E Plan 4 — Mastra Code uses declarative config (.mastracode/*.json).
  // mcp_config: canonical Mastra-Code path (was incorrectly '.mastracode/config.json' pre-Plan-4).
  // declarative_hooks: path to .mastracode/hooks.json (Req #6).
  // settings_path: explicit .mastracode/settings.json (Req #7).
  // db_path: .mastracode/database.json (Req #4 alternative).
  "mastra-code": {
    surface: ".mastracode",
    mcp_config: ".mastracode/mcp.json",
    settings: ".mastracode/hooks.json",
    settings_path: ".mastracode/settings.json",
    declarative_hooks: ".mastracode/hooks.json",
    db_path: ".mastracode/database.json",
    skill_discovery_paths: [
      ".mastracode/skills/learning-loop/SKILL.md",
      ".claude/skills/learning-loop/SKILL.md",      // Claude-compatible auto-discovery
    ],
  },
};

const SHIM_BASENAMES = [
  "bash-coordination-gate.cjs",
  "write-coordination-gate.cjs",
  "inbound-state-gate.cjs",
  "recurrence-check-on-start.cjs",
];

// Universal-hook basenames referenced by declarative hooks.json entries.
const UNIVERSAL_HOOK_PATHS = [
  "tools/learning-loop-mastra/hooks/legacy/bash-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/write-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/inbound-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js",
];
// Canonical hooks required for Req #5/Req #6 (Mastra Code declarative config)
const REQUIRED_HOOK_COMMANDS = [
  "tools/learning-loop-mastra/hooks/legacy/bash-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/write-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/inbound-gate.js",
  "tools/learning-loop-mastra/hooks/legacy/recurrence-check-on-start.js",
];

const REQUIRED_TOOL_REFS = ["loop_describe", "meta_state_list"];

// Phase E Plan 4 — additive Reqs #6 (hook-declarative-config) and #7 (settings-no-bypass)
// for runtimes with declarative hook configs (e.g., Mastra Code).
// Req #1 stays monomorphic (shim files only); Req #6 is parallel/alternative.
export const REQUIREMENT_IDS = [
  "hook-shim-set",
  "mcp-client-config",
  "skill-spec",
  "identity-marker",
  "settings-integration",
  "hook-declarative-config",
  "settings-no-bypass",
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
  const runtime = RUNTIMES[runtimeId];
  const { surface } = runtime;
  // Phase E Plan 4: declarative runtimes (those with `declarative_hooks`) don't use shim files.
  // Req #1 (hook-shim-set) is N/A for them; the contract uses Req #6 (hook-declarative-config)
  // instead. Report OK with `applicable:false` so the contract doesn't fail.
  if (runtime.declarative_hooks) {
    return {
      id: "hook-shim-set",
      ok: true,
      applicable: false,
      note: "runtime uses declarative hooks (Req #6); Req #1 N/A",
      shim_dir: join(rootPath, surface, "coordination", "hooks"),
      shims: SHIM_BASENAMES.map((b) => ({ name: b, path: join(rootPath, surface, "coordination", "hooks", b), universal_target: null, universal_exists: false })),
    };
  }
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
  const runtime = RUNTIMES[runtimeId];
  const surface = runtime.surface;
  // Phase E Plan 4: Mastra Code can satisfy Req #3 via Claude-compat discovery
  // (.claude/skills/) or via project-local .mastracode/skills/.
  const skillDiscoveryPaths = runtime.skill_discovery_paths ?? [
    join(rootPath, surface, "skills", "learning-loop", "SKILL.md"),
  ];
  let resolvedSkillPath = null;
  let content = null;
  for (const candidate of skillDiscoveryPaths) {
    const absolute = candidate.startsWith("/") ? candidate : join(rootPath, candidate);
    if (existsSync(absolute)) {
      resolvedSkillPath = absolute;
      content = readFileSync(absolute, "utf8");
      break;
    }
  }
  if (content === null) {
    return {
      id: "skill-spec",
      ok: false,
      skill_path: skillDiscoveryPaths[0],
      has_tools_block: false,
      tools_referenced: [],
      searched_paths: skillDiscoveryPaths,
    };
  }
  const hasToolsBlock = /^tools:\s*$/m.test(content) || /^\s*-\s+loop_describe/m.test(content);
  const toolsReferenced = REQUIRED_TOOL_REFS.filter((n) => content.includes(n));
  const ok = toolsReferenced.length === REQUIRED_TOOL_REFS.length;
  return { id: "skill-spec", ok, skill_path: resolvedSkillPath, has_tools_block: hasToolsBlock, tools_referenced: toolsReferenced };
}

function checkIdentityMarker(runtimeId) {
  const expected = runtimeId;
  // Phase E Plan 4: accept RUNTIME_ID OR MASTRA_RESOURCE_ID (additive alternative for Mastra Code).
  // MASTRA_RESOURCE_ID is spoofable until LIM-3 caller-identity ships (Plan 5 deferral D5).
  const runtimeIdEnv = process.env.RUNTIME_ID ?? null;
  const mastraResourceEnv = process.env.MASTRA_RESOURCE_ID ?? null;
  // First match wins; both unset => 'unset'.
  let actual = null;
  if (runtimeIdEnv !== null) actual = runtimeIdEnv;
  else if (mastraResourceEnv !== null) actual = mastraResourceEnv;
  const status = actual === null ? "unset" : actual === expected ? "match" : "mismatch";
  const envVar = runtimeIdEnv !== null ? "RUNTIME_ID" : (mastraResourceEnv !== null ? "MASTRA_RESOURCE_ID" : "RUNTIME_ID");
  return { id: "identity-marker", ok: true, env_var: envVar, expected, actual, status };
}

function collectHookCommands(hooksObj) {
  // Supports BOTH shapes:
  //   Claude Code / Droid: { PreToolUse: [{ matcher, hooks: [{ command }] }] }
  //   Mastra Code declarative: { PreToolUse: [{ command, matcher: { tool_name } }] }
  const commands = [];
  for (const block of Object.values(hooksObj ?? {})) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      // Claude Code shape: entry.hooks[] with .command
      if (Array.isArray(entry?.hooks)) {
        for (const h of entry.hooks) {
          if (typeof h?.command === "string") commands.push(h.command);
        }
      }
      // Mastra Code declarative shape: entry.command directly
      if (typeof entry?.command === "string") commands.push(entry.command);
    }
  }
  return commands;
}

function checkSettingsIntegration(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  const { surface, settings } = runtime;
  // Phase E Plan 4: Mastra Code has two settings-like files (hooks.json + settings.json);
  // Claude Code and Droid use a single settings.json with a `hooks` block.
  // Strategy: for declarative runtimes (those with `declarative_hooks`), require all 4
  // universal-hook commands in the declarative config. For shim-file runtimes, require all
  // 4 shim basenames in the conventional settings.json hooks.
  if (runtime.declarative_hooks) {
    const hooksPath = join(rootPath, runtime.declarative_hooks);
    const parsed = readJsonSafe(hooksPath);
    if (!parsed.ok) {
      return {
        id: "settings-integration",
        ok: false,
        settings_path: hooksPath,
        commands: [],
        shims_referenced: [],
        parse_error: parsed.error,
        note: "declarative-hooks (Mastra Code)",
      };
    }
    const commands = collectHookCommands(parsed.data);
    // Required: all 4 universal-hook paths must be referenced
    const hooksReferenced = REQUIRED_HOOK_COMMANDS.filter((p) =>
      commands.some((c) => c.includes(p.split("/").pop())) // match by basename
    );
    const ok = hooksReferenced.length === REQUIRED_HOOK_COMMANDS.length;
    return {
      id: "settings-integration",
      ok,
      settings_path: hooksPath,
      commands,
      hooks_referenced: hooksReferenced,
      note: "declarative-hooks (Mastra Code)",
    };
  }
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
 * Phase E Plan 4 — Req #6 (hook-declarative-config).
 * For runtimes with declarative hook configs (Mastra Code + future), assert that
 * `<surface>/hooks.json` parses AND has the 4 required event-type entries
 * (PreToolUse, UserPromptSubmit, SessionStart — PostToolUse/Stop/Notification optional)
 * AND each `command` points at a universal hook script in `tools/learning-loop-mastra/hooks/legacy/`.
 * Parallel/alternative to Req #1 (which stays monomorphic on shim files).
 */
function checkHookDeclarativeConfig(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  if (!runtime.declarative_hooks) {
    // Shim-file runtimes don't apply Req #6; report N/A as OK.
    return { id: "hook-declarative-config", ok: true, applicable: false, note: "runtime uses shim-file hooks (Req #1); Req #6 N/A" };
  }
  const hooksPath = join(rootPath, runtime.declarative_hooks);
  const parsed = readJsonSafe(hooksPath);
  if (!parsed.ok) {
    return {
      id: "hook-declarative-config",
      ok: false,
      hooks_path: hooksPath,
      event_types: [],
      universal_hooks_referenced: [],
      parse_error: parsed.error,
    };
  }
  const eventTypes = Object.keys(parsed.data ?? {});
  const requiredEvents = ["PreToolUse", "UserPromptSubmit", "SessionStart"];
  const missingEvents = requiredEvents.filter((e) => !eventTypes.includes(e));
  // Verify each command in any event entry points at a universal hook path
  const allCommands = collectHookCommands(parsed.data);
  const universalHooksReferenced = UNIVERSAL_HOOK_PATHS.filter((p) =>
    allCommands.some((c) => c.includes(p))
  );
  // Failsafe: every PreToolUse/write command MUST reference a known universal hook
  // (red-team Security F4: silent passes on bogus paths are unacceptable)
  const bogusCommands = allCommands.filter((c) => !UNIVERSAL_HOOK_PATHS.some((p) => c.includes(p)));
  const ok = missingEvents.length === 0
    && universalHooksReferenced.length >= REQUIRED_HOOK_COMMANDS.length
    && bogusCommands.length === 0;
  return {
    id: "hook-declarative-config",
    ok,
    hooks_path: hooksPath,
    event_types: eventTypes,
    required_events: requiredEvents,
    missing_events: missingEvents,
    universal_hooks_referenced: universalHooksReferenced,
    bogus_commands: bogusCommands,
  };
}

/**
 * Phase E Plan 4 — Req #7 (settings-no-bypass).
 * Reject settings that bypass our gates (e.g., Mastra Code's `shellPassthrough: true`).
 * Adversarial: an operator who sets shellPassthrough: true would bypass the bash-gate hook
 * entirely (hooks don't fire when commands are passed-through). Reject loudly.
 */
function checkSettingsNoBypass(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  // Only applies to runtimes with declarative settings (Mastra Code today; future too)
  if (!runtime.settings_path) {
    return { id: "settings-no-bypass", ok: true, applicable: false, note: "runtime has no declarative settings path; Req #7 N/A" };
  }
  const settingsPath = join(rootPath, runtime.settings_path);
  if (!existsSync(settingsPath)) {
    // No settings file => no bypass possible; vacuously OK
    return { id: "settings-no-bypass", ok: true, applicable: false, settings_path: settingsPath, note: "no settings file present" };
  }
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) {
    // Bad JSON in settings => treat as bypass attempt (fail closed)
    return {
      id: "settings-no-bypass",
      ok: false,
      settings_path: settingsPath,
      violations: ["malformed-settings-json"],
      parse_error: parsed.error,
    };
  }
  const violations = [];
  if (parsed.data?.shellPassthrough === true) violations.push("shellPassthrough:true");
  if (parsed.data?.disableHooks === true) violations.push("disableHooks:true");
  if (parsed.data?.disableMcp === true) violations.push("disableMcp:true");
  return {
    id: "settings-no-bypass",
    ok: violations.length === 0,
    settings_path: settingsPath,
    violations,
  };
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
    // Phase E Plan 4: Req #6 (hook-declarative-config) + Req #7 (settings-no-bypass).
    checkHookDeclarativeConfig(runtimeId, resolvedRoot),
    checkSettingsNoBypass(runtimeId, resolvedRoot),
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

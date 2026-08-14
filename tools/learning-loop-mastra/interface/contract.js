#!/usr/bin/env node
/**
 * MCP-transport conformance for the current Runtime Topology.
 *
 * Runtime Topology owns participant identity, surface, and ownership root.
 * This module owns only the transport-specific checks that can be observed
 * without editing a runtime-owned adapter. Retired runtime ids are rejected;
 * they are not compatibility aliases.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { listRuntimes } from "../core/runtime-topology.js";
import { SURFACES } from "../core/surfaces.js";

const NATIVE_RUNTIME_CONFIG = {
  codex: {
    mcp_config: ".codex/config.toml",
    hooks_config: ".codex/hooks.json",
    transport: "mcp",
    initial_delivery: true,
  },
  "claude-code": {
    mcp_config: ".mcp.json",
    settings: "settings.json",
    transport: "mcp",
  },
  hermes: {
    mcp_config: ".hermes/mcp.json",
    settings: "hooks.json",
    transport: "mcp",
    skill_discovery_paths: [".hermes/skills/learning-loop/SKILL.md"],
  },
};

const RUNTIMES = Object.fromEntries(
  listRuntimes().map((runtime) => [runtime.id, { ...runtime, ...NATIVE_RUNTIME_CONFIG[runtime.id] }]),
);

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
  "tools-manifest-has-path-fields",
  "runtime-owned-i2-delivery",
  "codex-initial-delivery",
];

function getRuntimeConfig(runtimeId) {
  return RUNTIMES[runtimeId];
}

function readJsonSafe(filePath) {
  try {
    const content = readFileSync(filePath, "utf8").trim();
    if (content.length === 0) return { ok: false, error: "empty file" };
    return { ok: true, data: JSON.parse(content) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function findUniversalHookPath(shimContent) {
  const match = shimContent.match(/execFileSync\(\s*["']node["']\s*,\s*\[\s*["']([^"']+)/);
  return match?.[1] ?? null;
}

function checkHookShimSet(runtimeId, rootPath) {
  const runtime = getRuntimeConfig(runtimeId);
  if (runtime.initial_delivery) {
    return {
      id: "hook-shim-set",
      ok: false,
      applicable: true,
      note: "Codex Initial Delivery does not establish the generic lifecycle gate shims",
      shim_dir: join(rootPath, runtime.surface, "coordination", "hooks"),
      shims: [],
    };
  }

  const shimDir = join(rootPath, runtime.surface, "coordination", "hooks");
  const shims = SHIM_BASENAMES.map((basename) => {
    const path = join(shimDir, basename);
    let universalTarget = null;
    let universalExists = false;
    if (existsSync(path)) {
      const captured = findUniversalHookPath(readFileSync(path, "utf8"));
      if (captured?.includes("tools/learning-loop-mastra/hooks/universal/")) {
        universalTarget = join(rootPath, captured.slice(captured.indexOf("tools/")));
        universalExists = existsSync(universalTarget);
      }
    }
    return { name: basename, path, universal_target: universalTarget, universal_exists: universalExists };
  });
  return { id: "hook-shim-set", ok: shims.every((shim) => existsSync(shim.path)), shim_dir: shimDir, shims };
}

function tomlSection(content, header) {
  const start = content.indexOf(header);
  if (start < 0) return "";
  const rest = content.slice(start + header.length);
  const nextSection = rest.search(/^\[/m);
  return nextSection < 0 ? rest : rest.slice(0, nextSection);
}

function checkCodexMcpClientConfig(configPath) {
  let content;
  try {
    content = readFileSync(configPath, "utf8");
  } catch (error) {
    return { id: "mcp-client-config", ok: false, config_path: configPath, entry: null, parse_error: error.message };
  }
  const section = tomlSection(content, "[mcp_servers.learning-loop]");
  const command = section.match(/^command\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? null;
  const serverConfigured = /args\s*=\s*\[[\s\S]*?tools\/learning-loop-mastra\/mastra\/server\.js[\s\S]*?\]/m.test(section);
  const envSection = tomlSection(content, "[mcp_servers.learning-loop.env]");
  const runtimeIdConfigured = /^RUNTIME_ID\s*=\s*"codex"\s*$/m.test(envSection);
  const loopSurfaceConfigured = /^LOOP_SURFACE\s*=\s*"\.codex"\s*$/m.test(envSection);
  return {
    id: "mcp-client-config",
    ok: command === "node" && serverConfigured && runtimeIdConfigured && loopSurfaceConfigured,
    config_path: configPath,
    entry: { command, server_configured: serverConfigured, runtime_id_configured: runtimeIdConfigured, loop_surface_configured: loopSurfaceConfigured },
  };
}

function checkMcpClientConfig(runtimeId, rootPath) {
  const runtime = getRuntimeConfig(runtimeId);
  const configPath = join(rootPath, runtime.mcp_config);
  if (runtimeId === "codex") return checkCodexMcpClientConfig(configPath);
  const parsed = readJsonSafe(configPath);
  if (!parsed.ok) return { id: "mcp-client-config", ok: false, config_path: configPath, entry: null, parse_error: parsed.error };
  const entry = parsed.data?.mcpServers?.["learning-loop"] ?? null;
  const ok = entry?.command === "node"
    && Array.isArray(entry.args)
    && entry.args.some((arg) => typeof arg === "string" && arg.endsWith("tools/learning-loop-mastra/mastra/server.js"));
  return { id: "mcp-client-config", ok, config_path: configPath, entry };
}

const SKILL_FRONTMATTER_MAX_BYTES = 64 * 1024;
const VALID_MATURITY = ["state-1", "state-2", "state-3"];

function extractSkillFrontmatter(content) {
  if (Buffer.byteLength(content, "utf8") > SKILL_FRONTMATTER_MAX_BYTES) return { ok: false, reason: "frontmatter-too-large" };
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return { ok: true, frontmatter: {} };
  try {
    const frontmatter = parseYaml(match[1]);
    return { ok: true, frontmatter: frontmatter && typeof frontmatter === "object" ? frontmatter : {} };
  } catch (error) {
    return { ok: false, reason: "frontmatter-unparseable", error: error.message };
  }
}

function readManifestSafe(rootPath) {
  const parsed = readJsonSafe(join(rootPath, "skills-lock.json"));
  if (!parsed.ok || !parsed.data || typeof parsed.data.skills !== "object") return null;
  return parsed.data;
}

function lookupManifestSkill(skills, name) {
  return Object.prototype.hasOwnProperty.call(skills ?? {}, name) ? skills[name] : undefined;
}

function listLoopMaintainedSkills(skillsDir, manifest) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const name = entry.name;
      const skillMd = join(skillsDir, name, "SKILL.md");
      const manifestEntry = lookupManifestSkill(manifest?.skills, name);
      if (manifest === null) return { name, skillMd, manifestUnreadable: true };
      if (manifestEntry === undefined) return { name, skillMd, notInManifest: true };
      if (manifestEntry.external === true) return null;
      return { name, skillMd };
    })
    .filter(Boolean);
}

function checkMirrorPresence(name, rootPath) {
  return SURFACES.filter((surface) => existsSync(join(rootPath, surface, "skills", name, "SKILL.md"))).length >= 2;
}

function checkSkillSpec(runtimeId, rootPath) {
  const runtime = getRuntimeConfig(runtimeId);
  if (runtime.initial_delivery) {
    return { id: "skill-spec", ok: true, applicable: false, note: "Codex does not consume project-local skill mirrors" };
  }
  const manifest = readManifestSafe(rootPath);
  const skillsDir = join(rootPath, runtime.surface, "skills");
  const skills = listLoopMaintainedSkills(skillsDir, manifest);
  const evaluated = skills.map((skill) => {
    if (skill.manifestUnreadable) return { name: skill.name, ok: false, reason: "manifest-unreadable", skill_path: skill.skillMd };
    if (skill.notInManifest) return { name: skill.name, ok: false, reason: "skill-not-in-manifest", skill_path: skill.skillMd };
    let content;
    try {
      content = readFileSync(skill.skillMd, "utf8");
    } catch (error) {
      return { name: skill.name, ok: false, reason: "skill-unreadable", skill_path: skill.skillMd, error: error.message };
    }
    const frontmatter = extractSkillFrontmatter(content);
    if (!frontmatter.ok) return { name: skill.name, ok: false, reason: frontmatter.reason, skill_path: skill.skillMd };
    const maturity = frontmatter.frontmatter.maturity;
    if (!VALID_MATURITY.includes(maturity)) return { name: skill.name, ok: false, reason: "maturity-not-declared", skill_path: skill.skillMd };
    if (!checkMirrorPresence(skill.name, rootPath)) return { name: skill.name, ok: false, reason: "skill-mirror-gap", skill_path: skill.skillMd };
    const toolsReferenced = skill.name === "learning-loop"
      ? REQUIRED_TOOL_REFS.filter((tool) => content.includes(tool))
      : [];
    if (skill.name === "learning-loop" && toolsReferenced.length !== REQUIRED_TOOL_REFS.length) {
      return { name: skill.name, ok: false, reason: "learning-loop-missing-tool-refs", skill_path: skill.skillMd, tools_referenced: toolsReferenced };
    }
    return {
      name: skill.name,
      ok: true,
      reason: null,
      skill_path: skill.skillMd,
      tools_referenced: toolsReferenced,
      has_tools_block: /^tools:\s*$/m.test(content) || /^\s*-\s+loop_describe/m.test(content),
      maturity,
    };
  });
  return { id: "skill-spec", ok: evaluated.every((skill) => skill.ok), skills: evaluated, has_tools_block: evaluated.some((skill) => skill.has_tools_block) };
}

function checkIdentityMarker(runtimeId) {
  const runtimeIdValue = process.env.RUNTIME_ID ?? null;
  const resourceIdValue = process.env.MASTRA_RESOURCE_ID ?? null;
  const actual = runtimeIdValue ?? resourceIdValue;
  const envVar = runtimeIdValue !== null ? "RUNTIME_ID" : "MASTRA_RESOURCE_ID";
  return {
    id: "identity-marker",
    ok: true,
    env_var: envVar,
    expected: runtimeId,
    actual,
    status: actual === null ? "unset" : actual === runtimeId ? "match" : "mismatch",
  };
}

function collectHookCommands(hooksObject) {
  const commands = [];
  for (const block of Object.values(hooksObject ?? {})) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      for (const hook of entry?.hooks ?? []) {
        if (typeof hook?.command === "string") commands.push(hook.command);
      }
    }
  }
  return commands;
}

function checkSettingsIntegration(runtimeId, rootPath) {
  const runtime = getRuntimeConfig(runtimeId);
  if (runtime.initial_delivery) {
    return { id: "settings-integration", ok: false, applicable: true, note: "Codex Initial Delivery does not establish generic lifecycle gate routing" };
  }
  const settingsPath = join(rootPath, runtime.surface, runtime.settings);
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) return { id: "settings-integration", ok: false, settings_path: settingsPath, commands: [], shims_referenced: [], parse_error: parsed.error };
  const commands = collectHookCommands(parsed.data?.hooks);
  const shimsReferenced = SHIM_BASENAMES.filter((basename) => commands.some((command) => command.includes(basename)));
  return { id: "settings-integration", ok: shimsReferenced.length === SHIM_BASENAMES.length, settings_path: settingsPath, commands, shims_referenced: shimsReferenced };
}

const MANIFEST_REL = "tools/learning-loop-mastra/tools/manifest.json";

function checkToolsManifestHasPathFields(rootPath) {
  const manifestPath = join(rootPath, MANIFEST_REL);
  let entries;
  try {
    entries = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\s*\/\/.*$/gm, ""));
  } catch (error) {
    return { id: "tools-manifest-has-path-fields", ok: false, manifest_path: manifestPath, entries: [], missing_path_fields: [], error: error.message };
  }
  if (!Array.isArray(entries)) return { id: "tools-manifest-has-path-fields", ok: false, manifest_path: manifestPath, entries, missing_path_fields: [], error: "manifest is not an array" };
  const missing = entries.filter((entry) => !entry || !Array.isArray(entry.pathFields)).map((entry) => entry?.file ?? JSON.stringify(entry));
  return { id: "tools-manifest-has-path-fields", ok: missing.length === 0, manifest_path: manifestPath, entries: entries.length, missing_path_fields: missing };
}

function checkRuntimeOwnedI2Delivery(runtimeId) {
  if (runtimeId === "codex") {
    return { id: "runtime-owned-i2-delivery", ok: true, applicable: false, note: "Codex delivery is checked by codex-initial-delivery" };
  }
  return {
    id: "runtime-owned-i2-delivery",
    ok: false,
    applicable: true,
    code: "runtime_owned_delivery_missing",
    runtime_id: runtimeId,
    owner: runtimeId,
    message: `Initial I2 Rule Delivery is not declared for ${runtimeId}; the runtime owner must provide the current native adapter`,
  };
}

function checkCodexInitialDelivery(runtimeId, rootPath) {
  if (runtimeId !== "codex") return { id: "codex-initial-delivery", ok: true, applicable: false, note: "runtime does not use the Codex Initial Delivery adapter" };
  const hooksPath = join(rootPath, ".codex", "hooks.json");
  const adapterPath = join(rootPath, ".codex", "hooks", "session-start-i2-delivery.cjs");
  const parsed = readJsonSafe(hooksPath);
  if (!parsed.ok) return { id: "codex-initial-delivery", ok: false, hooks_path: hooksPath, adapter_path: adapterPath, activation: "synchronous-session-start", parse_error: parsed.error };
  const handlers = parsed.data?.hooks?.SessionStart;
  const commands = Array.isArray(handlers) ? handlers.flatMap((group) => Array.isArray(group?.hooks) ? group.hooks : []) : [];
  const handler = commands.find((entry) => entry?.type === "command" && entry.command === "node .codex/hooks/session-start-i2-delivery.cjs");
  const synchronous = handler?.async !== true;
  return {
    id: "codex-initial-delivery",
    ok: existsSync(adapterPath) && !!handler && synchronous,
    hooks_path: hooksPath,
    adapter_path: adapterPath,
    activation: "synchronous-session-start",
    adapter_configured: !!handler,
    synchronous,
    additional_context_limit: handler?.additionalContextLimit ?? null,
  };
}

export function validate(runtimeId, rootPath = process.cwd()) {
  const resolvedRoot = resolve(rootPath);
  if (!getRuntimeConfig(runtimeId)) {
    return { ok: false, runtimeId, rootPath: resolvedRoot, missing: [], notes: [], path_map: {}, error: `unknown-runtime-id: ${runtimeId}` };
  }
  const checks = [
    checkHookShimSet(runtimeId, resolvedRoot),
    checkMcpClientConfig(runtimeId, resolvedRoot),
    checkSkillSpec(runtimeId, resolvedRoot),
    checkIdentityMarker(runtimeId),
    checkSettingsIntegration(runtimeId, resolvedRoot),
    checkToolsManifestHasPathFields(resolvedRoot),
    checkRuntimeOwnedI2Delivery(runtimeId),
    checkCodexInitialDelivery(runtimeId, resolvedRoot),
  ];
  const missing = checks.filter((check) => !check.ok).map((check) => check.id);
  const notes = [];
  const skill = checks.find((check) => check.id === "skill-spec");
  if (skill.ok && !skill.has_tools_block) notes.push("skill-spec-no-tools-block");
  const identity = checks.find((check) => check.id === "identity-marker");
  if (identity.status === "unset") notes.push("identity-marker-not-adopted");
  if (identity.status === "mismatch") notes.push("identity-marker-mismatch");
  const shim = checks.find((check) => check.id === "hook-shim-set");
  for (const entry of shim.shims) {
    if (existsSync(entry.path) && !entry.universal_exists) notes.push(`${entry.name}-universal-missing`);
  }
  return { ok: missing.length === 0, runtimeId, rootPath: resolvedRoot, missing, notes, path_map: Object.fromEntries(checks.map((check) => [check.id, check])) };
}

export function validateAll(ids = listRuntimes().map((runtime) => runtime.id), rootPath = process.cwd()) {
  return Object.fromEntries(ids.map((id) => [id, validate(id, rootPath)]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, rootArg] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.error(`usage: node contract.js <runtimeId> [rootPath]\n       node contract.js --list\nknown runtimes: ${Object.keys(RUNTIMES).join(", ")}`);
    process.exit(2);
  }
  if (command === "--list") {
    console.log(JSON.stringify({ runtimes: Object.keys(RUNTIMES), participants: listRuntimes().map((runtime) => runtime.id), requirements: REQUIREMENT_IDS }, null, 2));
    process.exit(0);
  }
  const result = validate(command, rootArg ?? process.cwd());
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}

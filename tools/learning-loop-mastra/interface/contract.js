#!/usr/bin/env node
/**
 * tools/learning-loop-mastra/interface/contract.js
 * MCP-transport conformance validator (1 of N transports). The transport-agnostic
 * runtime participation contract lives at docs/runtime-contract.md; this file
 * validates the MCP+hooks transport's conformance to it. Verifies the requirements
 * in CONTRACT.md (5 base + Req #6 `hook-declarative-config` + Req #7 `settings-no-bypass`,
 * both additive Phase E Plan 4 for declarative-hook runtimes like Mastra Code).
 *
 * CLI: node tools/learning-loop-mastra/interface/contract.js <runtimeId> [rootPath]
 *      node tools/learning-loop-mastra/interface/contract.js --list
 *
 * FCIS: zero `@mastra/*` imports.
 */
import { existsSync, readFileSync, readdirSync, statSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

// Per-runtime config layout. Surface = runtime dir at project root.
// mcp_config = path to MCP server config (relative to project root).
// settings = path to settings file with hooks arrays (relative to surface).
const RUNTIMES = {
  "claude-code": { surface: ".claude",     mcp_config: ".mcp.json",            settings: "settings.json", transport: "mcp" },
  "droid":       { surface: ".factory",    mcp_config: ".factory/mcp.json",    settings: "settings.json", transport: "mcp" },
  // Phase E Plan 4 — Mastra Code uses declarative config (.mastracode/*.json).
  // mcp_config: canonical Mastra-Code path (was incorrectly '.mastracode/config.json' pre-Plan-4).
  // declarative_hooks: path to .mastracode/hooks.json (Req #6).
  // settings_path: explicit .mastracode/settings.json (Req #7).
  // db_path: .mastracode/database.json (Req #4 alternative).
  "mastra-code": {
    surface: ".mastracode",
    transport: "mcp",
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
  "tools/learning-loop-mastra/hooks/universal/bash-gate.js",
  "tools/learning-loop-mastra/hooks/universal/write-gate.js",
  "tools/learning-loop-mastra/hooks/universal/inbound-gate.js",
  "tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js",
];
// Canonical hooks required for Req #5/Req #6 (Mastra Code declarative config)
const REQUIRED_HOOK_COMMANDS = [
  "tools/learning-loop-mastra/hooks/universal/bash-gate.js",
  "tools/learning-loop-mastra/hooks/universal/write-gate.js",
  "tools/learning-loop-mastra/hooks/universal/inbound-gate.js",
  "tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js",
];

const REQUIRED_TOOL_REFS = ["loop_describe", "meta_state_list"];

// Phase E Plan 4 — additive Reqs #6 (hook-declarative-config) and #7 (settings-no-bypass)
// for runtimes with declarative hook configs (e.g., Mastra Code).
// Req #1 stays monomorphic (shim files only); Req #6 is parallel/alternative.
// Plan 5-Lite Phase 3 — additive Reqs #9 (.mastracode-config-presence),
// #10 (mastracode-session-start-pins-loop-surface), #11 (tools-manifest-has-path-fields).
// Req #8 is intentionally skipped (gap preserved from the plan).
export const REQUIREMENT_IDS = [
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
  // Inherited complexity: per-shim existsSync + universal-hook path capture
  // callback. Untouched by the skill-layer work; flagged because contract.js
  // is in the changed-since set. CRAP is high from low coverage of the
  // universal_target branch, not from a defect. Covered by contract.test.js Req #1.
  // fallow-ignore-next-line complexity
  const shims = SHIM_BASENAMES.map((basename) => {
    const shimPath = join(shimDir, basename);
    const exists = existsSync(shimPath);
    let universalTarget = null;
    let universalExists = false;
    if (exists) {
      const content = readFileSync(shimPath, "utf8");
      const captured = findUniversalHookPath(content);
      if (captured) {
        const idx = captured.indexOf("tools/learning-loop-mastra/hooks/universal/");
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

function resolveSkillPath(candidates, rootPath) {
  // Returns the absolute path of the first candidate that exists on disk, or null.
  for (const candidate of candidates) {
    const absolute = candidate.startsWith("/") ? candidate : join(rootPath, candidate);
    if (existsSync(absolute)) return absolute;
  }
  return null;
}

// Phase 2 (plan 260707-0114) — frontmatter parser + maturity hard-require.
// Local to contract.js so the contract validator has no dependency on
// core/gate-logic.js's private `extractFrontmatter` (not exported). The
// error-isolation + size cap (64KB; billion-laughs guard) match the
// per-skill try/catch contract. `schema: "core"` enables the alias-expansion
// guard (no YAML anchors pointing at recursive structures).
const SKILL_FRONTMATTER_MAX_BYTES = 64 * 1024;
const VALID_MATURITY = ["state-1", "state-2", "state-3"];

function extractSkillFrontmatter(content) {
  if (!content || typeof content !== "string") return { ok: false, reason: "empty-content" };
  if (content.length > SKILL_FRONTMATTER_MAX_BYTES) return { ok: false, reason: "frontmatter-too-large" };
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return { ok: false, reason: "no-frontmatter" };
  const end = trimmed.indexOf("---", 3);
  if (end === -1) return { ok: false, reason: "frontmatter-unparseable" };
  const yamlBlock = trimmed.slice(3, end).trim();
  if (!yamlBlock) return { ok: false, reason: "no-frontmatter" };
  if (yamlBlock.length > SKILL_FRONTMATTER_MAX_BYTES) return { ok: false, reason: "frontmatter-too-large" };
  try {
    const parsed = parseYaml(yamlBlock, { uniqueKeys: false, schema: "core" });
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ok: true, frontmatter: parsed };
    }
    return { ok: false, reason: "frontmatter-unparseable" };
  } catch {
    return { ok: false, reason: "frontmatter-unparseable" };
  }
}

function readSkillSafe(skillPath) {
  let content;
  try {
    content = readFileSync(skillPath, "utf8");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (content.length > SKILL_FRONTMATTER_MAX_BYTES) return { ok: false, reason: "frontmatter-too-large" };
  return { ok: true, content };
}

function listLoopMaintainedSkills(skillsDir, manifest) {
  // Phase 3 of plans/260719-1428-central-skills-management — manifest-driven
  // exclusion. The manifest is the trust anchor for "is this skill external?"
  // (Phase 1 schema; Phase 3 reads it). Explicit failure modes (red-team
  // F8, F9): if the manifest fails to load/parse, the skill enumeration
  // is poisoned — fail each enumerated entry with `manifest-unreadable`
  // (NOT a misleading `maturity-not-declared` on an external skill). If a
  // real-dir skill is NOT in the manifest, fail with `skill-not-in-manifest`
  // (defense-in-depth: a planted skill the manifest doesn't know about is
  // a contract violation, not silently enumerated).
  //
  // No module-level cache (red-team F7): `contract.js` has zero mutable
  // module state today; the manifest is re-read on every call via
  // readJsonSafe to match the existing per-call pattern.
  const out = [];
  if (!existsSync(skillsDir)) return out;
  let entries;
  try {
    entries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    // Manifest-driven exclusion — read at this point. `manifest === null`
    // is the explicit "manifest-unreadable" sentinel.
    if (manifest === null) {
      out.push({ name: entry.name, skillMd, manifestExcluded: false, manifestUnreadable: true });
      continue;
    }
    const manifestEntry = manifest.skills?.[entry.name];
    if (manifestEntry === undefined) {
      // Real-dir skill not in the manifest — explicit failure (F9).
      out.push({ name: entry.name, skillMd, manifestExcluded: false, notInManifest: true });
      continue;
    }
    if (manifestEntry.external === true) {
      // External skill — out of scope (manifest-driven, not symlink-based).
      continue;
    }
    out.push({ name: entry.name, skillMd, manifestExcluded: false, notInManifest: false });
  }
  return out;
}

function readManifestSafe(rootPath) {
  // Returns the parsed manifest object, or null if missing/corrupt
  // (caller treats null as the manifest-unreadable signal).
  const manifestPath = join(rootPath, "skills-lock.json");
  const parsed = readJsonSafe(manifestPath);
  if (!parsed.ok) return null;
  if (!parsed.data || typeof parsed.data !== "object" || !parsed.data.skills) return null;
  return parsed.data;
}

function checkMirrorPresence(name, rootPath) {
  // The skill is "mirrored" if it appears in at least 2 of the 3 runtime
  // surfaces (parity-test asserts byte-identity; the contract only checks
  // the binary "is the mirror present somewhere"). Single-surface
  // placements are NOT loop-maintained (the mirror convention requires
  // ≥ 2 surfaces). Until phase 4 materializes `.mastracode/skills/`, the
  // .claude + .factory pair (2 surfaces) is the loop-maintained state.
  let count = 0;
  for (const surface of [".claude", ".factory", ".mastracode"]) {
    if (existsSync(join(rootPath, surface, "skills", name, "SKILL.md"))) count++;
  }
  return count >= 2;
}

/**
 * Phase 2 (plan 260707-0114) — generalized Req #3 (skill-spec).
 *
 * Enumerates every <surface>/skills/<name>/SKILL.md that declares a
 * `maturity:` frontmatter (the loop-maintained marker). The external `mastra`
 * symlink (no maturity:) is excluded by this filter. Per-skill error isolation:
 * a malformed or oversized frontmatter yields a per-skill fail; the loop does
 * not abort. The `loop_describe` + `meta_state_list` reference check is scoped
 * to `learning-loop` only (other skills do not document the tool surface).
 */
// Generalized Req #3 (plan 260707-0114): per-skill enumeration + maturity
// hard-require + mirror check + scoped tool-ref. Complexity is inherent to the
// per-skill validation loop; sub-steps are already extracted (extractSkillFrontmatter,
// readSkillSafe, listLoopMaintainedSkills, checkMirrorPresence). Covered by
// contract.test.js req-3 cases.
// fallow-ignore-next-line complexity
function checkSkillSpec(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  const surface = runtime.surface;
  const skillsDir = join(rootPath, surface, "skills");
  // Phase 3: manifest-driven exclusion. Read fresh on every call (no cache).
  const manifest = readManifestSafe(rootPath);
  const skills = listLoopMaintainedSkills(skillsDir, manifest);

  // Fallback: if the surface's enumeration is empty AND the runtime has a
  // skill_discovery_paths list (mastra-code's Claude-compat discovery), walk
  // the fallback paths to find skills. The fallback is read-only — it
  // only narrows the surface's apparent skill set when the surface itself
  // is empty. The fallback entries are checked against the manifest the
  // same way as primary entries (Phase 3 composition check).
  if (skills.length === 0 && Array.isArray(runtime.skill_discovery_paths)) {
    for (const candidate of runtime.skill_discovery_paths) {
      const absolute = candidate.startsWith("/") ? candidate : join(rootPath, candidate);
      if (!existsSync(absolute)) continue;
      // The candidate is a SKILL.md path; derive the name from the parent.
      const name = absolute.split("/").slice(-2, -1)[0];
      if (manifest === null) {
        skills.push({ name, skillMd: absolute, manifestUnreadable: true });
        continue;
      }
      const manifestEntry = manifest.skills?.[name];
      if (manifestEntry === undefined) {
        skills.push({ name, skillMd: absolute, notInManifest: true });
        continue;
      }
      if (manifestEntry.external === true) continue;
      skills.push({ name, skillMd: absolute });
    }
  }

  // Pre-maturity filter: drop skills with no frontmatter / no maturity:
  // (external `mastra` is excluded upstream by manifest, not here).
  const evaluated = [];
  for (const skill of skills) {
    const { name, skillMd, manifestUnreadable: manifestBad, notInManifest } = skill;
    if (manifestBad) {
      // Phase 3 F8: explicit failure mode for missing/corrupt manifest.
      evaluated.push({ name, ok: false, reason: "manifest-unreadable", skill_path: skillMd });
      continue;
    }
    if (notInManifest) {
      // Phase 3 F9: explicit failure mode for unlisted real-dir skill.
      evaluated.push({ name, ok: false, reason: "skill-not-in-manifest", skill_path: skillMd });
      continue;
    }
    const read = readSkillSafe(skillMd);
    if (!read.ok) {
      evaluated.push({ name, ok: false, reason: read.reason, skill_path: skillMd });
      continue;
    }
    const fm = extractSkillFrontmatter(read.content);
    if (!fm.ok) {
      evaluated.push({ name, ok: false, reason: fm.reason, skill_path: skillMd });
      continue;
    }
    const maturity = fm.frontmatter.maturity;
    if (!maturity || !VALID_MATURITY.includes(maturity)) {
      evaluated.push({ name, ok: false, reason: "maturity-not-declared", skill_path: skillMd });
      continue;
    }
    // Mirror check.
    if (!checkMirrorPresence(name, rootPath)) {
      evaluated.push({ name, ok: false, reason: "skill-mirror-gap", skill_path: skillMd });
      continue;
    }
    // Tool-ref check — scoped to learning-loop ONLY.
    const toolsReferenced = name === "learning-loop"
      ? REQUIRED_TOOL_REFS.filter((n) => read.content.includes(n))
      : [];
    if (name === "learning-loop" && toolsReferenced.length !== REQUIRED_TOOL_REFS.length) {
      evaluated.push({ name, ok: false, reason: "learning-loop-missing-tool-refs", skill_path: skillMd, tools_referenced: toolsReferenced });
      continue;
    }
    const hasToolsBlock = /^tools:\s*$/m.test(read.content) || /^\s*-\s+loop_describe/m.test(read.content);
    evaluated.push({ name, ok: true, reason: null, skill_path: skillMd, tools_referenced: toolsReferenced, has_tools_block: hasToolsBlock, maturity });
  }
  // Empty enumeration is vacuously OK (a surface may have no skills yet —
  // mastra-code during phase 2/3 has no .mastracode/skills/ mirror; the
  // cross-runtime parity test in legacy-mcp/skills-mirror-parity.test.js
  // is the backstop for "all 3 surfaces must agree").
  const allOk = evaluated.every((s) => s.ok);
  return {
    id: "skill-spec",
    ok: allOk,
    skills: evaluated,
    has_tools_block: evaluated.some((s) => s.ok && s.has_tools_block),
  };
}

// Phase E Plan 4: RUNTIME_ID is canonical; MASTRA_RESOURCE_ID is the additive
// alternative for Mastra Code. MASTRA_RESOURCE_ID is spoofable until LIM-3 caller-identity
// ships in Plan 5 (deferral D5).
// Read fresh on each call so test env-var mutations are honored.
function identityCandidates() {
  return [
    { name: "RUNTIME_ID", value: process.env.RUNTIME_ID ?? null },
    { name: "MASTRA_RESOURCE_ID", value: process.env.MASTRA_RESOURCE_ID ?? null },
  ];
}

function checkIdentityMarker(runtimeId) {
  // First match wins; both unset => 'unset'.
  const candidates = identityCandidates();
  const match = candidates.find((c) => c.value !== null) ?? candidates[0];
  const actual = match.value;
  const status = actual === null ? "unset" : actual === runtimeId ? "match" : "mismatch";
  return { id: "identity-marker", ok: true, env_var: match.name, expected: runtimeId, actual, status };
}

// Claude Code / Droid shape: entry.hooks[].command
// Mastra Code declarative shape: entry.command
// Cyclomatic floor: any "iterate filtered commands" loop needs (loop + typeof-filter),
// and supporting both shapes in one entry-pass requires two such loops. The CC is
// unavoidable for the dual-shape contract validator.
function addMastraShapeCommand(entry, commands) {
  if (typeof entry?.command === "string") commands.push(entry.command);
}

// fallow-ignore-next-line complexity
function addClaudeShapeCommands(entry, commands) {
  for (const h of entry?.hooks ?? []) {
    if (typeof h?.command === "string") commands.push(h.command);
  }
}

// Supports BOTH shapes:
//   Claude Code / Droid: { PreToolUse: [{ matcher, hooks: [{ command }] }] }
//   Mastra Code declarative: { PreToolUse: [{ command, matcher: { tool_name } }] }
// CC floor: nested iteration over hook config entries (for-event + for-entry).
// fallow-ignore-next-line complexity
function collectHookCommands(hooksObj) {
  const commands = [];
  for (const block of Object.values(hooksObj ?? {})) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      addClaudeShapeCommands(entry, commands);
      addMastraShapeCommand(entry, commands);
    }
  }
  return commands;
}

function findReferencedDeclarativeHooks(commands) {
  // Required: all 4 universal-hook paths must be referenced; match by basename.
  return REQUIRED_HOOK_COMMANDS.filter((p) => commands.some((c) => c.includes(p.split("/").pop())));
}

function findReferencedShimBasenames(commands) {
  return SHIM_BASENAMES.filter((b) => commands.some((c) => c.includes(b)));
}

function evaluateDeclarativeSettingsIntegration(hooksPath) {
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
  const hooksReferenced = findReferencedDeclarativeHooks(commands);
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

function evaluateShimFileSettingsIntegration(settingsPath) {
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) {
    return { id: "settings-integration", ok: false, settings_path: settingsPath, commands: [], shims_referenced: [], parse_error: parsed.error };
  }
  const commands = collectHookCommands(parsed.data?.hooks);
  const shimsReferenced = findReferencedShimBasenames(commands);
  const ok = shimsReferenced.length === SHIM_BASENAMES.length;
  return { id: "settings-integration", ok, settings_path: settingsPath, commands, shims_referenced: shimsReferenced };
}

function checkSettingsIntegration(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  // Phase E Plan 4: Mastra Code has two settings-like files (hooks.json + settings.json);
  // Claude Code and Droid use a single settings.json with a `hooks` block.
  // Strategy: for declarative runtimes (those with `declarative_hooks`), require all 4
  // universal-hook commands in the declarative config. For shim-file runtimes, require all
  // 4 shim basenames in the conventional settings.json hooks.
  if (runtime.declarative_hooks) {
    return evaluateDeclarativeSettingsIntegration(join(rootPath, runtime.declarative_hooks));
  }
  return evaluateShimFileSettingsIntegration(join(rootPath, runtime.surface, runtime.settings));
}

/**
 * Phase E Plan 4 — Req #6 (hook-declarative-config).
 * For runtimes with declarative hook configs (Mastra Code + future), assert that
 * `<surface>/hooks.json` parses AND has the 4 required event-type entries
 * (PreToolUse, UserPromptSubmit, SessionStart — PostToolUse/Stop/Notification optional)
 * AND each `command` points at a universal hook script in `tools/learning-loop-mastra/hooks/universal/`.
 * Parallel/alternative to Req #1 (which stays monomorphic on shim files).
 */
const REQUIRED_DECLARATIVE_EVENTS = ["PreToolUse", "UserPromptSubmit", "SessionStart"];

function findMissingDeclarativeEvents(eventTypes) {
  return REQUIRED_DECLARATIVE_EVENTS.filter((e) => !eventTypes.includes(e));
}

function findReferencedUniversalHooks(commands) {
  return UNIVERSAL_HOOK_PATHS.filter((p) => commands.some((c) => c.includes(p)));
}

function findBogusHookCommands(commands) {
  // Failsafe: every PreToolUse/write command MUST reference a known universal hook
  // (red-team Security F4: silent passes on bogus paths are unacceptable).
  return commands.filter((c) => !UNIVERSAL_HOOK_PATHS.some((p) => c.includes(p)));
}

function evaluateDeclarativeHooks(hooksPath, hooksData) {
  const eventTypes = Object.keys(hooksData ?? {});
  const allCommands = collectHookCommands(hooksData);
  const missingEvents = findMissingDeclarativeEvents(eventTypes);
  const universalHooksReferenced = findReferencedUniversalHooks(allCommands);
  const bogusCommands = findBogusHookCommands(allCommands);
  const ok = missingEvents.length === 0
    && universalHooksReferenced.length >= REQUIRED_HOOK_COMMANDS.length
    && bogusCommands.length === 0;
  return {
    id: "hook-declarative-config",
    ok,
    hooks_path: hooksPath,
    event_types: eventTypes,
    required_events: REQUIRED_DECLARATIVE_EVENTS,
    missing_events: missingEvents,
    universal_hooks_referenced: universalHooksReferenced,
    bogus_commands: bogusCommands,
  };
}

function checkHookDeclarativeConfig(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  // Shim-file runtimes don't apply Req #6; report N/A as OK.
  if (!runtime.declarative_hooks) {
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
  return evaluateDeclarativeHooks(hooksPath, parsed.data);
}

// Phase E Plan 4 — Req #7 (settings-no-bypass).
// Each entry is a documented bypass for the loop's gates; enabling any is rejected.
// `shellPassthrough:true` bypasses the bash-gate hook entirely; `disableHooks:true`
// disables all hooks; `disableMcp:true` disables MCP server connections (the loop IS
// the MCP server, so this breaks the integration).
const BYPASS_FIELDS = ["shellPassthrough", "disableHooks", "disableMcp"];

function getBypassViolations(settingsData) {
  if (!settingsData || typeof settingsData !== "object") return [];
  return BYPASS_FIELDS
    .filter((field) => settingsData[field] === true)
    .map((field) => `${field}:true`);
}

function evaluateSettingsBypass(settingsPath) {
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) {
    // Bad JSON in settings => treat as bypass attempt (fail closed).
    return {
      id: "settings-no-bypass",
      ok: false,
      settings_path: settingsPath,
      violations: ["malformed-settings-json"],
      parse_error: parsed.error,
    };
  }
  const violations = getBypassViolations(parsed.data);
  return {
    id: "settings-no-bypass",
    ok: violations.length === 0,
    settings_path: settingsPath,
    violations,
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
  // Only applies to runtimes with declarative settings (Mastra Code today; future too).
  if (!runtime.settings_path) {
    return { id: "settings-no-bypass", ok: true, applicable: false, note: "runtime has no declarative settings path; Req #7 N/A" };
  }
  const settingsPath = join(rootPath, runtime.settings_path);
  // No settings file => no bypass possible; vacuously OK.
  if (!existsSync(settingsPath)) {
    return { id: "settings-no-bypass", ok: true, applicable: false, settings_path: settingsPath, note: "no settings file present" };
  }
  return evaluateSettingsBypass(settingsPath);
}

// Plan 5-Lite Phase 3 — Req #9 (.mastracode-config-presence).
// For mastra-code, assert .mastracode/ exists with the 4 config files.
// Other runtimes: applicable:false.
const MASTRACODE_REQUIRED_FILES = ["mcp.json", "hooks.json", "settings.json", "database.json"];

function checkMastracodeConfigPresence(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  if (runtime.surface !== ".mastracode") {
    return {
      id: ".mastracode-config-presence",
      ok: true,
      applicable: false,
      note: "runtime does not use .mastracode/; Req #9 N/A",
    };
  }
  const dir = join(rootPath, ".mastracode");
  const missing = MASTRACODE_REQUIRED_FILES.filter((f) => !existsSync(join(dir, f)));
  return {
    id: ".mastracode-config-presence",
    ok: missing.length === 0,
    dir,
    required_files: MASTRACODE_REQUIRED_FILES,
    missing,
  };
}

// Plan 5-Lite Phase 3 — Req #10 (mastracode-session-start-pins-loop-surface).
// For mastra-code, assert .mastracode/mcp.json sets env.LOOP_SURFACE on the
// learning-loop server entry (the operator-chosen env-field wiring approach;
// shim wiring was replaced by this simpler, more robust mechanism).
// Other runtimes: applicable:false.
function checkMastracodeSessionStartPinsLoopSurface(runtimeId, rootPath) {
  const runtime = RUNTIMES[runtimeId];
  if (runtime.surface !== ".mastracode") {
    return {
      id: "mastracode-session-start-pins-loop-surface",
      ok: true,
      applicable: false,
      note: "runtime does not use .mastracode/; Req #10 N/A",
    };
  }
  const configPath = join(rootPath, ".mastracode", "mcp.json");
  const parsed = readJsonSafe(configPath);
  if (!parsed.ok) {
    return {
      id: "mastracode-session-start-pins-loop-surface",
      ok: false,
      config_path: configPath,
      env_loop_surface: null,
      parse_error: parsed.error,
    };
  }
  const entry = parsed.data?.mcpServers?.["learning-loop"] ?? null;
  const envSurface = entry?.env?.LOOP_SURFACE ?? null;
  return {
    id: "mastracode-session-start-pins-loop-surface",
    ok: envSurface === ".mastracode",
    config_path: configPath,
    env_loop_surface: envSurface,
  };
}

// Plan 5-Lite Phase 3 — Req #11 (tools-manifest-has-path-fields).
// Project-wide invariant: every entry in tools/manifest.json declares
// pathFields: string[] (may be []). The manifest is JSONC (full-line // comments
// only); the validator strips comments before parsing, mirroring the shim in
// mastra/server.js. Applicable to ALL runtimes.
const MANIFEST_REL = "tools/learning-loop-mastra/tools/manifest.json";

function stripJsoncFullLineComments(text) {
  return text.replace(/^\s*\/\/.*$/gm, "");
}

function checkToolsManifestHasPathFields(_runtimeId, rootPath) {
  const manifestPath = join(rootPath, MANIFEST_REL);
  let raw;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch (error) {
    return {
      id: "tools-manifest-has-path-fields",
      ok: false,
      manifest_path: manifestPath,
      entries: [],
      missing_path_fields: [],
      error: error.message,
    };
  }
  let entries;
  try {
    entries = JSON.parse(stripJsoncFullLineComments(raw));
  } catch (error) {
    return {
      id: "tools-manifest-has-path-fields",
      ok: false,
      manifest_path: manifestPath,
      entries: [],
      missing_path_fields: [],
      error: `manifest parse failed: ${error.message}`,
    };
  }
  if (!Array.isArray(entries)) {
    return {
      id: "tools-manifest-has-path-fields",
      ok: false,
      manifest_path: manifestPath,
      entries,
      missing_path_fields: [],
      error: "manifest is not an array",
    };
  }
  const missing = entries
    .filter((e) => !e || !Array.isArray(e.pathFields))
    .map((e) => e?.file ?? JSON.stringify(e));
  return {
    id: "tools-manifest-has-path-fields",
    ok: missing.length === 0,
    manifest_path: manifestPath,
    entries: entries.length,
    missing_path_fields: missing,
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
    // Plan 5-Lite Phase 3: Req #9 (.mastracode-config-presence),
    // Req #10 (mastracode-session-start-pins-loop-surface),
    // Req #11 (tools-manifest-has-path-fields — project-wide invariant).
    checkMastracodeConfigPresence(runtimeId, resolvedRoot),
    checkMastracodeSessionStartPinsLoopSurface(runtimeId, resolvedRoot),
    checkToolsManifestHasPathFields(runtimeId, resolvedRoot),
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

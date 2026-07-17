#!/usr/bin/env node
/**
 * Droid SessionStart hook: inject loop surface block (hints + counts).
 * Only fires when the project has its own .mcp.json + learning-loop entry.
 *
 * Single-source architecture (plans/260717-1826-unify-context-injection Phase 1):
 *   - hints come from canonical core/loop-introspect.js builders (no LOCAL mirror)
 *   - counts come from cheap sync core readers (manifest.json, schemas/, registry)
 *   - NO MCP spawn — the previous probe (loop_describe stdio handshake) was a
 *     hot-path tax with no consumer; genuine MCP failure now surfaces when
 *     the agent calls tools.
 *
 * To update hints: edit core/loop-introspect.js (Phase 2 migrates them into
 * core/hint-registry.js; until then, that is the single source of truth).
 */

const { readFileSync, existsSync, readdirSync } = require("node:fs");
const { join, resolve } = require("node:path");

/**
 * Resolve the project root from the hook's own location. .factory/hooks/<this>.cjs
 * → <project-root>. Used to locate tools/learning-loop-mastra/core/*.js on the
 * droid runtime where cwd may differ from the operator's working directory.
 */
function resolveProjectRoot() {
  return resolve(__dirname, "..", "..");
}

/**
 * Read tool count from tools/manifest.json (JSONC: strips full-line // comments,
 * mirrors loop-introspect.js:43-46). Pure — no I/O beyond a single readFileSync.
 */
function readToolCount(root) {
  const manifestPath = join(root, "tools/learning-loop-mastra/tools/manifest.json");
  if (!existsSync(manifestPath)) return "?";
  try {
    const raw = readFileSync(manifestPath, "utf8").replace(/^\s*\/\/.*$/gm, "");
    const manifest = JSON.parse(raw);
    return Array.isArray(manifest) ? manifest.length : "?";
  } catch {
    return "?";
  }
}

/**
 * Read record type count from schemas/*.schema.json.
 * Pure — single readdirSync.
 */
function readRecordTypeCount(root) {
  const schemasDir = join(root, "schemas");
  if (!existsSync(schemasDir)) return "?";
  try {
    return readdirSync(schemasDir).filter((f) => f.endsWith(".schema.json")).length;
  } catch {
    return "?";
  }
}

/**
 * Load core readers + canonical hint builders in one place. Lazy-imported on
 * each main() call so the hook stays a single file with no top-level ESM/CJS
 * boundary surprises. The dynamic import is the same pattern the previous
 * failure-path code used (await import core/meta-state.js at line ~139 of
 * the pre-Phase-1 version).
 */
async function loadCore(root) {
  const introspect = await import(join(root, "tools/learning-loop-mastra/core/loop-introspect.js"));
  const metaState = await import(join(root, "tools/learning-loop-mastra/core/meta-state.js"));
  const gateLogic = await import(join(root, "tools/learning-loop-mastra/core/gate-logic.js"));
  const { isOpen } = await import(join(root, "tools/learning-loop-mastra/core/constants.js"));
  return { introspect, metaState, gateLogic, isOpen };
}

async function main(inputArg, envArg, _spawnImpl) {
  // _spawnImpl is kept as an optional 3rd param for back-compat with the
  // pre-Phase-1 signature. Phase 1 always ignores it — no MCP spawn path.
  const input = inputArg || (() => {
    try {
      return JSON.parse(readFileSync(0, "utf8"));
    } catch {
      return null;
    }
  })();

  if (!input) return null;

  // Guard: only SessionStart with startup matcher
  if (input.hook_event_name !== "SessionStart" || input.source !== "startup") {
    return null;
  }

  const env = envArg || process.env;

  // Guard: escape hatch for debugging
  if (env.LL_DISABLE_LOOP_SURFACE_INJECTION === "1") {
    return null;
  }

  const projectRoot = resolveProjectRoot();

  const cwd = input.cwd || env.FACTORY_PROJECT_DIR || projectRoot;
  const mcpCfgPath = join(cwd, ".mcp.json");
  if (!existsSync(mcpCfgPath)) return null;

  let mcpCfg;
  try {
    mcpCfg = JSON.parse(readFileSync(mcpCfgPath, "utf8"));
  } catch {
    return null;
  }

  const serverCfg = mcpCfg.mcpServers && mcpCfg.mcpServers["learning-loop"];
  if (!serverCfg) return null;

  const tier = env.LL_LOOP_INJECT_TIER === "summary" ? "summary" : "warm";

  if (tier === "summary") {
    await reportHintDowngrade(input, env, projectRoot, cwd, "env_LL_LOOP_INJECT_TIER=summary");
  }

  // Counts: cheap sync reads (no spawn, no MCP handshake).
  const toolCount = readToolCount(projectRoot);
  const recordTypeCount = readRecordTypeCount(projectRoot);
  let ruleCount = "?";
  let activeFindingCount = "?";

  // Hints + registry counts: dynamic import of core (ESM) from CJS hook.
  let discoverability = [];
  let processHints = [];
  try {
    const core = await loadCore(projectRoot);
    const { introspect, metaState, gateLogic, isOpen } = core;
    discoverability = introspect.buildDiscoverabilityHints();
    processHints = introspect.buildProcessHints();
    const entries = metaState.readRegistry(projectRoot);
    ruleCount = gateLogic.loadPromotedRules(projectRoot).length;
    activeFindingCount = entries.filter(
      (e) => e.entry_kind === "finding" && isOpen(e),
    ).length;
  } catch (err) {
    // Core import failure: render whatever counts we already have, no hints.
    // The pre-Phase-1 hook also caught here (the spawn failure path). The
    // printed block still exits 0 — same fail-open contract.
    console.error(`[loop-surface-inject] core import failed: ${err.message}`);
  }

  return formatBlock(
    {
      tool_count: toolCount,
      record_type_count: recordTypeCount,
      rule_count: ruleCount,
      active_finding_count: activeFindingCount,
    },
    { discoverability_hints: discoverability, process_hints: processHints },
    tier,
  );
}

/**
 * Log a meta_state_report finding when the operator downgrades the SessionStart
 * hook tier via LL_LOOP_INJECT_TIER=summary. The downgrade is auditable, not
 * silent. Preserved from the pre-Phase-1 version — the only "auditor" behavior
 * that survives the MCP-probe removal.
 *
 * `projectRoot` is used to resolve the canonical core module path (the core
 * lives in the operator's working tree, not the test cwd). `registryRoot` is
 * where the finding is appended — typically the same as `projectRoot`, but
 * tests inject a temp dir.
 */
async function reportHintDowngrade(input, env, projectRoot, registryRoot, reason) {
  if (env && env.LL_DISABLE_MCP_FAILURE_REPORTING === "1") return;

  const sessionId = input?.session_id
    || env?.DROID_SESSION_ID
    || `unknown-${Date.now()}`;

  const corePath = join(projectRoot, "tools/learning-loop-mastra/core/meta-state.js");

  let writeEntry, readRegistry, generateId;
  try {
    const core = await import(corePath);
    writeEntry = core.writeEntry;
    readRegistry = core.readRegistry;
    generateId = core.generateId;
  } catch (e) {
    console.error(`[loop-surface-inject] cannot import core/meta-state.js: ${e.message}`);
    return;
  }

  let existing = null;
  try {
    existing = readRegistry(registryRoot).find((e) =>
      e.entry_kind === "finding"
      && e.session_id === sessionId
      && e.subtype === "hint-downgrade"
      && (e.status === "open" || e.status === "active" || e.status === "reported"),
    );
  } catch {
    // registry may not exist yet
  }
  if (existing) return;

  const id = generateId("hint-downgrade");
  const now = new Date();
  const entry = {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "hint-downgrade",
    description: `SessionStart hook tier downgraded to summary (reason=${reason}, session_id=${sessionId}). Discoverability hints were not rendered. To re-enable hints, unset LL_LOOP_INJECT_TIER or set it to 'warm'.`,
    evidence_code_ref: ".factory/hooks/loop-surface-inject.cjs",
    session_id: sessionId,
    status: "open",
    auto_resolve: null,
    created_at: now.toISOString(),
    resolved_at: null,
    resolved_by: null,
    version: 0,
  };

  try {
    await writeEntry(registryRoot, entry);
  } catch (e) {
    console.error(`[loop-surface-inject] cannot write hint-downgrade finding: ${e.message}`);
  }
}

// fallow-ignore-next-line complexity
function formatBlock(counts, hints, tier = "warm") {
  const safeHints = hints ?? { discoverability_hints: [], process_hints: [] };
  const lines = [
    "=== loop surface (auto-injected at session start) ===",
    `tools: ${counts.tool_count ?? "?"}`,
    `record types: ${counts.record_type_count ?? "?"}`,
    `active rules: ${counts.rule_count ?? "?"}`,
    `active findings: ${counts.active_finding_count ?? "?"}`,
  ];

  if (tier !== "summary") {
    if (safeHints.discoverability_hints.length > 0) {
      lines.push("");
      lines.push("--- discoverability_hints ---");
      for (const hint of safeHints.discoverability_hints) {
        lines.push(hint);
      }
    }
    if (safeHints.process_hints.length > 0) {
      lines.push("");
      lines.push("--- process_hints ---");
      for (const hint of safeHints.process_hints) {
        lines.push(hint);
      }
    }
  }

  lines.push("");
  lines.push("Use mcp__learning_loop_mastra__* tools directly. Do not invoke ck:use-mcp from");
  lines.push("a project that has its own .mcp.json — that skill is for cross-project discovery.");
  lines.push("========================================================");
  return lines.join("\n");
}

// Real execution path when Droid spawns this hook
if (require.main === module) {
  main().then((block) => {
    if (block) console.log(block);
    process.exit(0);
  }).catch(() => {
    process.exit(0);
  });
}

module.exports = { main, formatBlock };
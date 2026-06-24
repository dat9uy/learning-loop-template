/**
 * Build tool subsets for agent wrappers.
 *
 * Each function returns a dict of tool instances keyed by MCP tool name.
 * The tools are constructed via createLoopTool (parity-shim applied).
 *
 * Read-only tools (8): loop_describe, loop_get_instruction, meta_state_list,
 *   meta_state_query_drift, meta_state_derive_status, meta_state_relationships,
 *   runtime_state_read, check_runtime_agnostic.
 *
 * Write tools (8): meta_state_report, meta_state_ack, meta_state_log_change,
 *   meta_state_propose_design, meta_state_refresh_fingerprint, meta_state_resolve,
 *   meta_state_promote_rule, meta_state_check_grounding.
 *
 * Excluded from all agents: meta_state_batch, meta_state_archive,
 *   meta_state_supersede, meta_state_sweep, meta_state_patch,
 *   meta_state_relationship_validate, meta_state_re_verify.
 */

import { createLoopTool } from "../create-loop-tool.js";
import { adaptLegacyHandler } from "../legacy-handler-adapter.js";

// Lazy-loaded tool cache — constructed once on first call
let _toolCache = null;

async function getToolDict() {
  if (_toolCache) return _toolCache;
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const MANIFEST = JSON.parse(
    readFileSync(join(__dirname, "..", "tools", "manifest.json"), "utf8"),
  );
  const PREFIX = "mastra_";
  _toolCache = {};
  for (const { file, export: exportName } of MANIFEST) {
    const mod = await import(`#mcp/${file}`);
    const legacy = mod[exportName];
    if (!legacy) continue;
    const prefixed = PREFIX + legacy.name;
    _toolCache[prefixed] = createLoopTool({
      id: prefixed,
      description: legacy.description,
      inputSchema: legacy.schema,
      execute: adaptLegacyHandler(legacy),
    });
  }
  return _toolCache;
}

// Read-only tool names shared by all 3 agents
const READ_ONLY_NAMES = [
  "mastra_loop_describe",
  "mastra_loop_get_instruction",
  "mastra_meta_state_list",
  "mastra_meta_state_query_drift",
  "mastra_meta_state_derive_status",
  "mastra_meta_state_relationships",
  "mastra_runtime_state_read",
  "mastra_check_runtime_agnostic",
];

// Write tool names for selfImprovementAgent
const WRITE_NAMES = [
  "mastra_meta_state_report",
  "mastra_meta_state_ack",
  "mastra_meta_state_log_change",
  "mastra_meta_state_propose_design",
  "mastra_meta_state_refresh_fingerprint",
  "mastra_meta_state_resolve",
  "mastra_meta_state_promote_rule",
  "mastra_meta_state_check_grounding",
];

function pick(dict, names) {
  const result = {};
  for (const name of names) {
    if (dict[name]) {
      result[name] = dict[name];
    } else {
      // Fail-fast: a missing tool in the read-only/write surface means the
      // manifest has drifted (D-11 reconciliation, tool rename, etc.).
      // Surface at server start, not silently at agent construction.
      throw new Error(
        `build-meta-state-tools: required tool "${name}" missing from manifest cache. Check tools/learning-loop-mastra/tools/manifest.json.`,
      );
    }
  }
  return result;
}

export async function buildReadOnlyMetaStateTools() {
  const dict = await getToolDict();
  return pick(dict, READ_ONLY_NAMES);
}

export async function buildWriteMetaStateTools() {
  const dict = await getToolDict();
  return { ...pick(dict, READ_ONLY_NAMES), ...pick(dict, WRITE_NAMES) };
}

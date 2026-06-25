#!/usr/bin/env node
/**
 * Pre-plan baseline capture for Phase E Plan 2.
 * Produces a deterministic JSON snapshot of the current state.
 * Run twice → byte-identical output.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const p = (relative) => path.join(ROOT, relative);

const result = {};

// 1. interface/ directory presence
result.interface_dir = fs.existsSync(p("tools/learning-loop-mastra/interface")) ? "present" : "absent";

// 2. Tool references in SKILL.md files
const skillPaths = [
  ".claude/skills/learning-loop/SKILL.md",
  ".factory/skills/learning-loop/SKILL.md",
];

result.skill_md = {};
for (const sp of skillPaths) {
  const fullPath = p(sp);
  const exists = fs.existsSync(fullPath);
  const content = exists ? fs.readFileSync(fullPath, "utf8") : "";
  result.skill_md[sp] = {
    exists,
    loop_describe_count: (content.match(/loop_describe/g) || []).length,
    meta_state_list_count: (content.match(/meta_state_list/g) || []).length,
    interface_contract_ref: content.includes("interface/CONTRACT.md"),
  };
}

// 3. Hook shims per runtime
result.hook_shims = {};
const surfaces = { "claude-code": ".claude", droid: ".factory" };
for (const [runtime, surface] of Object.entries(surfaces)) {
  const hooksDir = p(`${surface}/coordination/hooks`);
  if (!fs.existsSync(hooksDir)) {
    result.hook_shims[runtime] = { exists: false, files: [] };
    continue;
  }
  const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith(".cjs")).sort();
  result.hook_shims[runtime] = { exists: true, files };
}

// 4. MCP config locations
result.mcp_config = {};
const mcpPaths = { "claude-code": ".mcp.json", droid: ".factory/mcp.json" };
for (const [runtime, mcpPath] of Object.entries(mcpPaths)) {
  const fullPath = p(mcpPath);
  if (!fs.existsSync(fullPath)) {
    result.mcp_config[runtime] = { exists: false, has_learning_loop: false };
    continue;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    result.mcp_config[runtime] = {
      exists: true,
      has_learning_loop: !!(parsed.mcpServers && parsed.mcpServers["learning-loop"]),
    };
  } catch {
    result.mcp_config[runtime] = { exists: true, has_learning_loop: false, parse_error: true };
  }
}

// 5. Agent manifest groups
const manifestPath = p("tools/learning-loop-mastra/agent-manifest.json");
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  result.agent_manifest_groups = Object.keys(manifest.groups || {}).sort();
} else {
  result.agent_manifest_groups = [];
}

// Deterministic JSON output (sorted keys at every level)
function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])])
    );
  }
  return obj;
}
process.stdout.write(JSON.stringify(sortKeys(result), null, 2) + "\n");

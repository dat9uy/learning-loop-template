/**
 * scoutAgent — read-only filesystem + meta-surface.
 * Tools: 8 read-only meta-state tools + runScout tool.
 */
import { createLoopAgent } from "../create-loop-agent.js";
import { instructions } from "./instructions/scout-agent.js";
import { buildReadOnlyMetaStateTools } from "./build-meta-state-tools.js";
import { runScoutTool } from "./run-scout-tool.js";
import { loadAgentsManifest } from "./load-agents-manifest.js";

const agentsManifest = loadAgentsManifest().agents;

const tools = {
  ...(await buildReadOnlyMetaStateTools()),
  run_scout: runScoutTool,
};

export const scoutAgent = await createLoopAgent({
  id: "scout_agent",
  name: "scoutAgent",
  description:
    "Wrap the pure-function scout pipeline; surface structured readiness report",
  instructions,
  tools,
  agentsManifest,
});

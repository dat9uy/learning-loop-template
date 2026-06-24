/**
 * selfImprovementAgent — read + operator-bounded writes.
 * Tools: 8 read-only + 8 write meta-state tools (16 total).
 * Excluded: mastra_meta_state_batch (operator-grade only).
 */
import { createLoopAgent } from "../create-loop-agent.js";
import { instructions } from "./instructions/self-improvement-agent.js";
import { buildWriteMetaStateTools } from "./build-meta-state-tools.js";
import { loadAgentsManifest } from "./load-agents-manifest.js";

const agentsManifest = loadAgentsManifest().agents;

const tools = await buildWriteMetaStateTools();

export const selfImprovementAgent = await createLoopAgent({
  id: "self_improvement_agent",
  name: "selfImprovementAgent",
  description:
    "Turn gaps surfaced by scout into experiment candidates; write to meta-surface registry",
  instructions,
  tools,
  agentsManifest,
});

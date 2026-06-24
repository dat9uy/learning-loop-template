/**
 * intakeAgent — read-only orientation surface.
 * Tools: 8 read-only meta-state tools (no write tools).
 */
import { createLoopAgent } from "../create-loop-agent.js";
import { instructions } from "./instructions/intake-agent.js";
import { buildReadOnlyMetaStateTools } from "./build-meta-state-tools.js";
import { loadAgentsManifest } from "./load-agents-manifest.js";

const agentsManifest = loadAgentsManifest().agents;

const tools = await buildReadOnlyMetaStateTools();

export const intakeAgent = await createLoopAgent({
  id: "intake_agent",
  name: "intakeAgent",
  description:
    "Orient operator into current meta-state; produce ordered deterministic verification plan",
  instructions,
  tools,
  agentsManifest,
});

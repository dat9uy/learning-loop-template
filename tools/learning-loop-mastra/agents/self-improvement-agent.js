/**
 * selfImprovementAgent — read + operator-bounded writes.
 * Tools: 8 read-only + 8 write meta-state tools (16 total).
 * Excluded: mastra_meta_state_batch (operator-grade only).
 */
import { createLoopAgent } from "../create-loop-agent.js";
import { instructions } from "./instructions/self-improvement-agent.js";
import { buildWriteMetaStateTools } from "./build-meta-state-tools.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = process.env.MASTRA_AGENTS_MANIFEST ?? join(__dirname, "..", "agents-manifest.json");
const agentsManifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));

const tools = await buildWriteMetaStateTools();

export const selfImprovementAgent = await createLoopAgent({
  id: "self_improvement_agent",
  name: "selfImprovementAgent",
  description:
    "Turn gaps surfaced by scout into experiment candidates; write to meta-surface registry",
  instructions,
  tools,
  agentsManifest: agentsManifest.agents,
});

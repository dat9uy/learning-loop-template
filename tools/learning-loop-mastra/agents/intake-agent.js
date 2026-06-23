/**
 * intakeAgent — read-only orientation surface.
 * Tools: 8 read-only meta-state tools (no write tools).
 */
import { createLoopAgent } from "../create-loop-agent.js";
import { instructions } from "./instructions/intake-agent.js";
import { buildReadOnlyMetaStateTools } from "./build-meta-state-tools.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = process.env.MASTRA_AGENTS_MANIFEST ?? join(__dirname, "..", "agents-manifest.json");
const agentsManifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));

const tools = await buildReadOnlyMetaStateTools();

export const intakeAgent = await createLoopAgent({
  id: "intake_agent",
  name: "intakeAgent",
  description:
    "Orient operator into current meta-state; produce ordered deterministic verification plan",
  instructions,
  tools,
  agentsManifest: agentsManifest.agents,
});

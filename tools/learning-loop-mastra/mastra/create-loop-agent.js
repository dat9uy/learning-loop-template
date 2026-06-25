import { Agent } from "@mastra/core/agent";

/**
 * Factory seam for the loop's agents. Mirrors createLoopTool + createLoopWorkflow
 * but adapted for the Agent constructor shape (no inputSchema/outputSchema on Agent
 * directly; parity-shim applies to each tools[name].inputSchema instead, which is
 * handled by the tool construction in each agent wrapper).
 *
 * 3-layer model lookup:
 *   1. Per-agent agents-manifest.json model field (highest priority)
 *   2. MASTRA_AGENT_MODEL env var (global override)
 *   3. Code default "kimi-for-coding/k2p6"
 *
 * Memory: omitted by default (OM off; Phase 5 consumer). When Phase 5 enables OM,
 * adding memory: { observationalMemory: true } is a config change, not a migration.
 */

const DEFAULT_AGENT_MODEL = "kimi-for-coding/k2p6";
const MOCK_LLM_MARKER = "__MOCK_LLM__";

/**
 * Resolve the model for an agent using the 3-layer lookup.
 * Reads process.env.MASTRA_AGENT_MODEL at call time (not import time).
 *
 * Test-only: when the per-agent manifest field is "__MOCK_LLM__", creates
 * a mock model via the test helper factory (server-process only).
 */
export async function resolveAgentModel(agentId, agentsManifest) {
  // Layer 1: per-agent manifest field
  const perAgent = agentsManifest?.[agentId]?.model;
  if (perAgent) {
    if (perAgent === MOCK_LLM_MARKER) {
      // Test-only: create mock model in the server process
      const { createServerMockModel } = await import(
        "../__tests__/helpers/mock-model-factory.cjs"
      );
      return createServerMockModel();
    }
    return perAgent;
  }
  // Layer 2: env var
  if (process.env.MASTRA_AGENT_MODEL) return process.env.MASTRA_AGENT_MODEL;
  // Layer 3: code default
  return DEFAULT_AGENT_MODEL;
}

/**
 * Create a loop agent with the 3-layer model lookup applied.
 *
 * @param {Object} opts
 * @param {string} opts.id - Agent ID (must match /^[a-z][a-z0-9_]*$/)
 * @param {string} opts.name - Agent name
 * @param {string} [opts.description] - Agent description
 * @param {string} opts.instructions - Agent instructions (required)
 * @param {string} [opts.modelOverride] - Override model (for tests; takes precedence over 3-layer lookup)
 * @param {Object} [opts.tools] - Tool definitions
 * @param {Object} [opts.agentsManifest] - Per-agent manifest for 3-layer lookup
 * @returns {Agent}
 */
export async function createLoopAgent({
  id,
  name,
  description,
  instructions,
  modelOverride,
  tools,
  agentsManifest,
}) {
  if (!id) throw new Error("createLoopAgent: id is required.");
  if (!name) throw new Error(`createLoopAgent: name is required for "${id}".`);
  if (!instructions)
    throw new Error(`createLoopAgent: instructions are required for "${id}".`);
  if (!/^[a-z][a-z0-9_]*$/.test(id)) {
    throw new Error(
      `createLoopAgent: id "${id}" must match /^[a-z][a-z0-9_]*$/.`,
    );
  }
  // modelOverride takes precedence (for tests). Otherwise, run the 3-layer lookup.
  const model = modelOverride ?? (await resolveAgentModel(id, agentsManifest));
  return new Agent({
    id,
    name,
    description,
    instructions,
    model,
    tools,
    // memory: omitted — agent is memory-less (OM off; Phase 5 consumer)
  });
}

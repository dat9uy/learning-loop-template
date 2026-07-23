import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { WORKFLOW_REGISTRY } from "../../core/workflow-registry.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const workflowTriggerTool = {
  name: "workflow_trigger",
  description: "Trigger a workflow by name. Returns the recommended MCP tool sequence. Does NOT spawn processes — the agent calls the tools explicitly.",
  schema: {
    name: z.string().describe("Workflow name"),
    context: z.preprocess(stripEnvelope, z.object({}).passthrough()).optional().describe("Arbitrary context passed to workflow (unused but preserved for backward compatibility)"),
  },
  handler: async ({ name, context }) => {
    const root = resolveRoot();
    const def = WORKFLOW_REGISTRY[name];
    if (!def) {
      const result = { triggered: false, reason: "not_found" };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "workflow_trigger",
        workflow: name,
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    const recommendedTools = def.recommended_tools ?? [];
    const result = {
      triggered: true,
      workflow: name,
      recommended_tools: recommendedTools,
      reasoning: `Workflow "${name}" maps to: ${recommendedTools.join(", ") || "(none — recommendations vacated per plans/260722-2147 phase 5; see meta-state registry)"}`,
    };

    console.error(`gate: trigger_workflow ${name} → returns ${recommendedTools.join(", ") || "(none)"}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "workflow_trigger",
      workflow: name,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

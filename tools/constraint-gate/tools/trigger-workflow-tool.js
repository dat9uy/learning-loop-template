import { z } from "zod";
import { triggerWorkflow } from "../workflow-runner.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const triggerWorkflowTool = {
  name: "trigger_workflow",
  description: "Trigger a workflow by name. Validates commands against allowlist before spawning.",
  schema: {
    name: z.string().describe("Workflow name"),
    context: z.object({}).passthrough().optional().describe("Arbitrary context passed to workflow"),
  },
  handler: async ({ name, context }) => {
    const root = resolveRoot();
    const result = await triggerWorkflow(name, context || {}, root);

    console.error(`gate: trigger_workflow ${name} → ${result.triggered ? "triggered" : result.reason || result.registry_error}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "trigger_workflow",
      workflow: name,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

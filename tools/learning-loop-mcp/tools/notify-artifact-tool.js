import { z } from "zod";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readLastOperatorMessage, checkObservationStaleness } from "#mcp/core/inbound-state.js";
import { evaluateTriggers } from "#mcp/core/workflow-registry.js";

export const workflowNotifyArtifactTool = {
  name: "workflow_notify_artifact",
  description: "Notify that an artifact file has changed. Returns recommended MCP tools to call next based on registry triggers. Does NOT spawn processes.",
  schema: {
    path: z.string().describe("File path that changed"),
    change_type: z.enum(["created", "updated", "deleted"]).describe("Type of change"),
  },
  handler: async ({ path, change_type }) => {
    const root = resolveRoot();
    const marker = readLastOperatorMessage(root);

    const { matched, recommendations } = evaluateTriggers(path, change_type);

    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: "workflow_notify_artifact",
      path,
      change_type,
      state_change_detected: !!marker,
      matched_workflows: matched,
      recommended_tools: recommendations,
    };

    appendGateLog(root, logEntry);

    const reasoning = matched.length > 0
      ? `${matched.join(", ")} workflow${matched.length > 1 ? "s" : ""} matched; recommended: ${recommendations.join(", ")}`
      : "No matching workflows for this path.";

    const result = {
      logged: true,
      matched_workflows: matched,
      recommended_next_tools: recommendations,
      reasoning,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

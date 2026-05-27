import { z } from "zod";
import { readObservations } from "#mcp/core/file-readers.js";
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

    let staleEscalation = false;
    const observations = readObservations(root);
    const matchingObs = observations.filter(
      (obs) =>
        obs.status === "active" &&
        obs.constraint_type === "write-path" &&
        (obs.constraint === "records-evidence" || obs.constraint?.startsWith("records-evidence"))
    );
    if (matchingObs.length > 0) {
      const staleness = checkObservationStaleness(matchingObs, root);
      if (staleness.stale) {
        staleEscalation = true;
      }
    }

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
    if (staleEscalation) {
      result.stale_escalation = true;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

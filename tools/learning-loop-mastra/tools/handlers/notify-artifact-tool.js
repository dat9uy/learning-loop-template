import { z } from "zod";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readLastOperatorMessage, checkObservationStaleness } from "../../core/inbound-state.js";
import { evaluateTriggers } from "../../core/workflow-registry.js";

export const workflowNotifyArtifactTool = {
  name: "workflow_notify_artifact",
  description: "Notify that an artifact file has changed. Returns recommended MCP tools to call next based on registry triggers. Does NOT spawn processes.",
  schema: {
    path: z.string().describe("File path that changed"),
    change_type: z.enum(["created", "updated", "deleted"]).describe("Type of change"),
  },
  handler: async ({ path, change_type }) => {
    const root = resolveRoot();
    // Q1 (plan-260722-2147 Phase 3): the manifest declares `pathFields: []`
    // because the CLI path hardcodes `pathFields:[]` at bin/loop.mjs:123,
    // so the R2 gate would short-circuit. In-handler validation restores
    // the records/** ownership check the gate cannot perform: any caller
    // (MCP, CLI, or future transport) gets the same path guard.
    const normalized = path.replace(/^\.\//, "");
    if (!normalized.startsWith("records/")) {
      throw new Error(
        `notify_artifact path must be under records/** (got: ${path}); R2 ownership requires a records/-prefixed path.`
      );
    }

    const marker = readLastOperatorMessage(root);

    const { matched, recommendations } = evaluateTriggers(normalized, change_type);

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

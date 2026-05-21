import { z } from "zod";
import { readObservations } from "../file-readers.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";
import { readLastOperatorMessage, checkObservationStaleness } from "../inbound-state.js";
import { evaluateWorkflows, triggerWorkflow } from "../workflow-runner.js";

export const notifyArtifactTool = {
  name: "notify_artifact_change",
  description: "Notify that an artifact file has changed. Logs the change, checks observation staleness, and evaluates triggered workflows.",
  schema: {
    path: z.string().describe("File path that changed"),
    change_type: z.enum(["created", "updated", "deleted"]).describe("Type of change"),
  },
  handler: async ({ path, change_type }) => {
    const root = resolveRoot();
    const marker = readLastOperatorMessage(root);

    const logEntry = {
      timestamp: new Date().toISOString(),
      tool: "notify_artifact_change",
      path,
      change_type,
      state_change_detected: !!marker,
      triggered_workflows: [],
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

    const triggered = evaluateWorkflows(path, change_type, root);
    const validTriggered = triggered.filter((t) => t.commands);
    const workflowNames = validTriggered.map((t) => t.name);
    logEntry.triggered_workflows = workflowNames;

    for (const t of validTriggered) {
      triggerWorkflow(t.name, { path }, root).catch(() => {
        // fire-and-forget: ignore spawn errors
      });
    }

    appendGateLog(root, logEntry);

    const result = {
      logged: true,
      triggered_workflows: workflowNames,
    };
    if (staleEscalation) {
      result.stale_escalation = true;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

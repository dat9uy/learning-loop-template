import { z } from "zod";
import {
  matchConstraintPattern,
  checkObservationExists,
  evaluateBudget,
  makeGateDecision,
  evaluateWritePath,
} from "#mcp/core/gate-logic.js";
import { readObservations, readBudgets } from "#mcp/core/file-readers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { checkObservationStaleness } from "#mcp/core/inbound-state.js";

export const gateCheckTool = {
  name: "gate_check",
  description: "Check if a command is allowed by constraint gate. Returns ok/block/escalate.",
  schema: {
    command: z.string().optional().describe("The command to check against constraint patterns"),
    file_path: z.string().optional().describe("Optional file path to check against write-path observations"),
    context: z.string().optional().describe("Optional context about why this command is being run"),
  },
  handler: async ({ command, file_path }) => {
    const root = resolveRoot();

    const observations = readObservations(root);
    const budgets = readBudgets(root);

    let constraintDecision = null;
    let constraintMatch = null;
    if (command) {
      constraintMatch = matchConstraintPattern(command);
      const observationStatus = checkObservationExists(constraintMatch, observations);

      let budgetStatus = { exhausted: false, windowActive: false };
      for (const budget of budgets) {
        const status = evaluateBudget(budget);
        if (status.exhausted || status.windowActive) {
          budgetStatus = status;
          break;
        }
      }

      constraintDecision = makeGateDecision(constraintMatch, observationStatus, budgetStatus);

      if (constraintMatch) {
        const staleness = checkObservationStaleness(observations, root);
        if (staleness.stale) {
          constraintDecision.inbound_gate = true;
          if (constraintDecision.decision === "ok") {
            constraintDecision.decision = "escalate";
            constraintDecision.reason = staleness.reason;
            constraintDecision.observation_id = staleness.observation_id;
          }
        }
      }
    }

    let pathDecision = null;
    if (file_path) {
      pathDecision = evaluateWritePath(file_path, observations, (obs) => checkObservationStaleness(obs, root));
    }

    let decision;
    if (constraintDecision?.hard_block || pathDecision?.hard_block) {
      decision = constraintDecision?.hard_block ? constraintDecision : pathDecision;
    } else if (constraintDecision && constraintDecision.decision !== "ok") {
      decision = constraintDecision;
    } else if (pathDecision && pathDecision.decision !== "ok") {
      decision = pathDecision;
    } else {
      decision = constraintDecision || pathDecision || { decision: "ok" };
    }

    const logCommand = command || file_path || "";
    console.error(`gate: ${logCommand} → ${decision.decision}${constraintMatch ? ` (${constraintMatch})` : ""}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "gate_check",
      decision: decision.decision,
      command: command || undefined,
      file_path: file_path || undefined,
      constraint_type: constraintMatch,
      ...decision,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(decision) }],
    };
  },
};

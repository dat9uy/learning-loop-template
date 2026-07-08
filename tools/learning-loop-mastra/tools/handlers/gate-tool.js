import { z } from "zod";
import { evaluateBashGate } from "../../core/evaluate-bash-gate.js";
import { evaluateWriteGate } from "../../core/evaluate-write-gate.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const gateCheckTool = {
  name: "gate_check",
  description: "Check if a command is allowed by constraint gate. Returns ok/block/escalate. Use BEFORE running any side-effect command (vendor API, package install, sudo, docker, side-effect import). The gate is the single source of truth for \"is this safe?\" — do not rely on memory. Not for actual execution (this is a dry-run check) and not for unlocking product/** writes (use `gate_mark_preflight` instead).",
  schema: {
    command: z.string().optional().describe("The command to check against constraint patterns"),
    file_path: z.string().optional().describe("Optional file path to check against write-path observations"),
    context: z.string().optional().describe("Optional context about why this command is being run"),
  },
  handler: async ({ command, file_path }) => {
    const root = resolveRoot();

    let decision;
    if (command) {
      decision = evaluateBashGate({ command, root });
    } else if (file_path) {
      decision = evaluateWriteGate({ filePath: file_path, root });
    } else {
      decision = { decision: "ok" };
    }

    const logCommand = command || file_path || "";
    console.error(`gate: ${logCommand} → ${decision.decision}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "gate_check",
      decision: decision.decision,
      command: command || undefined,
      file_path: file_path || undefined,
      ...decision,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(decision) }],
    };
  },
};

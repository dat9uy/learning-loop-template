/**
 * Constraint Gate MCP Server
 * Exposes check_gate and record_observation tools via stdio transport.
 * Reads observation files on each call (stateless).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendFileSync,
  mkdirSync,
  statSync,
  renameSync,
  readdirSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  matchConstraintPattern,
  checkObservationExists,
  evaluateBudget,
  makeGateDecision,
  evaluateWritePath,
} from "./gate-logic.js";
import { readObservations, readBudgets } from "./file-readers.js";
import { writeObservation, updateObservation } from "./observation-writer.js";
import { evaluateWorkflows, triggerWorkflow, validateCommand } from "./workflow-runner.js";

/**
 * Resolve project root. Override via GATE_ROOT env var for testing.
 */
function resolveRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Read the last operator message marker written by inbound-state-gate.cjs.
 * Returns { timestamp, prompt_snippet } or null if not found or expired.
 * Markers older than MARKER_TTL_MS are treated as non-existent to prevent
 * perpetual escalation after state-change messages.
 */
function readLastOperatorMessage(root) {
  try {
    const markerPath = process.env.GATE_MARKER_PATH || join(root, ".claude", "coordination", ".last-operator-message");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    if (!marker || !marker.timestamp) return null;
    const markerTime = new Date(marker.timestamp).getTime();
    if (isNaN(markerTime)) return null;
    if ((Date.now() - markerTime) > MARKER_TTL_MS) return null;
    return marker;
  } catch {
    return null;
  }
}

/**
 * Check if observations are stale relative to the last operator state-change message.
 * Returns { stale, reason, observation_id } or { stale: false }.
 */
function checkObservationStaleness(observations, root) {
  const marker = readLastOperatorMessage(root);
  if (!marker || !marker.timestamp) return { stale: false };

  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return { stale: false };

  for (const obs of observations) {
    if (obs.status !== "active") continue;
    if (!obs.updated_at) {
      return {
        stale: true,
        reason: `Observation "${obs.id || obs.constraint}" has no updated_at. Operator sent state-change at ${marker.timestamp}. Update the observation before proceeding.`,
        observation_id: obs.id || obs.constraint,
      };
    }
    const obsTime = new Date(obs.updated_at).getTime();
    if (isNaN(obsTime) || markerTime > obsTime) {
      return {
        stale: true,
        reason: `Observation "${obs.id || obs.constraint}" updated at ${obs.updated_at}, but operator sent state-change at ${marker.timestamp}. Observation may be stale. Update before proceeding.`,
        observation_id: obs.id || obs.constraint,
      };
    }
  }
  return { stale: false };
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_BACKUPS = 5;

/**
 * Rotate gate-log.jsonl if it exceeds MAX_LOG_SIZE.
 * Keeps only the MAX_LOG_BACKUPS most recent backups.
 */
function rotateGateLog(logDir) {
  try {
    const logPath = join(logDir, "gate-log.jsonl");
    const stats = statSync(logPath);
    if (stats.size <= MAX_LOG_SIZE) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(logPath, join(logDir, `gate-log-${timestamp}.jsonl`));

    const backups = readdirSync(logDir)
      .filter((f) => f.startsWith("gate-log-") && f.endsWith(".jsonl"))
      .map((f) => {
        const s = statSync(join(logDir, f));
        return { name: f, mtime: s.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const b of backups.slice(MAX_LOG_BACKUPS)) {
      unlinkSync(join(logDir, b.name));
    }
  } catch {
    // rotation failure never blocks gate decision
  }
}

/**
 * Append a JSONL entry to the gate log. Never blocks on failure.
 */
function appendGateLog(root, entry) {
  try {
    const logDir = join(root, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
    rotateGateLog(logDir);
    appendFileSync(join(logDir, "gate-log.jsonl"), JSON.stringify(entry) + "\n");
  } catch {
    // log failure never blocks gate decision
  }
}

const server = new McpServer({
  name: "constraint-gate",
  version: "0.1.0",
});

server.tool(
  "check_gate",
  "Check if a command is allowed by constraint gate. Returns ok/block/escalate.",
  {
    command: z.string().optional().describe("The command to check against constraint patterns"),
    file_path: z.string().optional().describe("Optional file path to check against write-path observations"),
    context: z.string().optional().describe("Optional context about why this command is being run"),
  },
  async ({ command, file_path }) => {
    const root = resolveRoot();

    // Read state files (stateless — fresh read each call)
    const observations = readObservations(root);
    const budgets = readBudgets(root);

    // Gate logic
    let constraintDecision = null;
    let constraintMatch = null;
    if (command) {
      constraintMatch = matchConstraintPattern(command);
      const observationStatus = checkObservationExists(constraintMatch, observations);

      // Global budget check — iterate ALL budgets, find first exhausted
      let budgetStatus = { exhausted: false, windowActive: false };
      for (const budget of budgets) {
        const status = evaluateBudget(budget);
        if (status.exhausted || status.windowActive) {
          budgetStatus = status;
          break;
        }
      }

      constraintDecision = makeGateDecision(constraintMatch, observationStatus, budgetStatus);

      // Inbound gate integration: check staleness regardless of decision, but only
      // when constraint matches. If observations are stale relative to the last
      // operator message, add inbound_gate flag. Upgrade "ok" to "escalate".
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

    // Write-path evaluation (independent of constraint check)
    let pathDecision = null;
    if (file_path) {
      pathDecision = evaluateWritePath(file_path, observations, (obs) => checkObservationStaleness(obs, root));
    }

    // Combine results: constraint takes priority if both fail
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

    // Log to stderr (never stdout — MCP uses stdout for protocol)
    const logCommand = command || file_path || "";
    console.error(`gate: ${logCommand} → ${decision.decision}${constraintMatch ? ` (${constraintMatch})` : ""}`);

    // Append to gate log (non-blocking)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "check_gate",
      decision: decision.decision,
      command: command || undefined,
      file_path: file_path || undefined,
      constraint_type: constraintMatch,
      ...decision,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(decision) }],
    };
  }
);

server.tool(
  "record_observation",
  "Record a constraint observation as a YAML file. Returns recorded status.",
  {
    constraint_type: z.string().describe("Type of constraint (e.g., sudo, docker, device_limit)"),
    constraint: z.string().describe("Short kebab-case slug describing the constraint"),
    description: z.string().describe("Human-readable description of the observation"),
    source_refs: z.array(z.string()).optional().describe("Source references (e.g., record:..., local:...)"),
  },
  async ({ constraint_type, constraint, description, source_refs }) => {
    const root = resolveRoot();
    const result = writeObservation({
      root,
      constraint_type,
      constraint,
      description,
      source_refs: source_refs || ["local:constraint-gate-mcp"],
    });

    console.error(`gate: record_observation ${constraint} → ${result.recorded ? "recorded" : result.reason}`);

    // Append to gate log (non-blocking)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_observation",
      constraint_type,
      constraint,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "update_observation",
  "Update an existing observation's status. Returns updated status.",
  {
    observation_id: z.string().describe("The id of the observation to update"),
    status: z.string().refine((val) => ["active", "inactive", "archived"].includes(val), {
      message: "invalid_status",
    }).describe("New status: active, inactive, or archived"),
    reason: z.string().optional().describe("Optional reason for the status change"),
  },
  async ({ observation_id, status, reason }) => {
    const root = resolveRoot();
    const result = updateObservation({
      root,
      observation_id,
      status,
      reason,
    });

    console.error(`gate: update_observation ${observation_id} → ${result.updated ? "updated" : result.reason}`);

    // Append to gate log (non-blocking)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "update_observation",
      observation_id,
      status,
      reason: reason || undefined,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);

server.tool(
  "notify_artifact_change",
  "Notify that an artifact file has changed. Logs the change, checks observation staleness, and evaluates triggered workflows.",
  {
    path: z.string().describe("File path that changed"),
    change_type: z.enum(["created", "updated", "deleted"]).describe("Type of change"),
  },
  async ({ path, change_type }) => {
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

    // Re-check staleness for write-path observations matching the changed path
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

    // Evaluate workflows
    const triggered = evaluateWorkflows(path, change_type, root);
    const validTriggered = triggered.filter((t) => t.commands);
    const workflowNames = validTriggered.map((t) => t.name);
    logEntry.triggered_workflows = workflowNames;

    // Fire-and-forget triggered workflows
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
  }
);

server.tool(
  "trigger_workflow",
  "Trigger a workflow by name. Validates commands against allowlist before spawning.",
  {
    name: z.string().describe("Workflow name"),
    context: z.object({}).passthrough().optional().describe("Arbitrary context passed to workflow"),
  },
  async ({ name, context }) => {
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
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("constraint-gate MCP server started");
}

main().catch((err) => {
  console.error(`constraint-gate server error: ${err.message}`);
  process.exit(1);
});

/**
 * Constraint Gate MCP Server
 * Exposes check_gate and record_observation tools via stdio transport.
 * Reads observation files on each call (stateless).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { appendFileSync, mkdirSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  matchConstraintPattern,
  checkObservationExists,
  evaluateBudget,
  makeGateDecision,
} from "./gate-logic.js";
import { readObservations, readBudgets } from "./file-readers.js";
import { writeObservation } from "./observation-writer.js";
import { readFileSync } from "node:fs";

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

/**
 * Append a JSONL entry to the gate log. Never blocks on failure.
 */
function appendGateLog(root, entry) {
  try {
    const logDir = join(root, ".claude", "coordination");
    mkdirSync(logDir, { recursive: true });
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
    command: z.string().describe("The command to check against constraint patterns"),
    context: z.string().optional().describe("Optional context about why this command is being run"),
  },
  async ({ command }) => {
    const root = resolveRoot();

    // Read state files (stateless — fresh read each call)
    const observations = readObservations(root);
    const budgets = readBudgets(root);

    // Gate logic
    const constraintMatch = matchConstraintPattern(command);
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

    const decision = makeGateDecision(constraintMatch, observationStatus, budgetStatus);

    // Inbound gate integration: check staleness regardless of decision, but only
    // when constraint matches. If observations are stale relative to the last
    // operator message, add inbound_gate flag. Upgrade "ok" to "escalate".
    if (constraintMatch) {
      const staleness = checkObservationStaleness(observations, root);
      if (staleness.stale) {
        decision.inbound_gate = true;
        if (decision.decision === "ok") {
          decision.decision = "escalate";
          decision.reason = staleness.reason;
          decision.observation_id = staleness.observation_id;
        }
      }
    }

    // Log to stderr (never stdout — MCP uses stdout for protocol)
    console.error(`gate: ${command} → ${decision.decision}${constraintMatch ? ` (${constraintMatch})` : ""}`);

    // Append to gate log (non-blocking)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "check_gate",
      decision: decision.decision,
      command,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("constraint-gate MCP server started");
}

main().catch((err) => {
  console.error(`constraint-gate server error: ${err.message}`);
  process.exit(1);
});

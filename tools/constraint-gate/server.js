/**
 * Constraint Gate MCP Server
 * Exposes check_gate and record_observation tools via stdio transport.
 * Reads coordination config and observation files on each call (stateless).
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
import { readCoordinationConfig, readObservations, readBudgets } from "./file-readers.js";
import { writeObservation } from "./observation-writer.js";

/**
 * Resolve project root. Override via GATE_ROOT env var for testing.
 */
function resolveRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
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
    const config = readCoordinationConfig(root);
    const observations = readObservations(root);
    const budgets = readBudgets(root);

    // Gate logic
    const constraintMatch = matchConstraintPattern(command);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    // Find matching budget for the constraint (if any)
    let budgetStatus = { exhausted: false, windowActive: false };
    if (constraintMatch && observationStatus.found) {
      const obs = observationStatus.observation;
      if (obs.external_system && obs.resource) {
        const budgetData = budgets.find(
          (b) => b.external_system === obs.external_system && b.resource === obs.resource
        );
        budgetStatus = evaluateBudget(budgetData);
      }
    }

    const decision = makeGateDecision(constraintMatch, observationStatus, budgetStatus);

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

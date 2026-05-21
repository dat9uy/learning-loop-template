import { z } from "zod";
import { writeObservation } from "../observation-writer.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const recordObservationTool = {
  name: "record_observation",
  description: "Record a constraint observation as a YAML file. Returns recorded status.",
  schema: {
    constraint_type: z.string().describe("Type of constraint (e.g., sudo, docker, device_limit)"),
    constraint: z.string().describe("Short kebab-case slug describing the constraint"),
    description: z.string().describe("Human-readable description of the observation"),
    source_refs: z.array(z.string()).optional().describe("Source references (e.g., record:..., local:...)"),
  },
  handler: async ({ constraint_type, constraint, description, source_refs }) => {
    const root = resolveRoot();
    const result = writeObservation({
      root,
      constraint_type,
      constraint,
      description,
      source_refs: source_refs || ["local:constraint-gate-mcp"],
    });

    console.error(`gate: record_observation ${constraint} → ${result.recorded ? "recorded" : result.reason}`);

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
  },
};

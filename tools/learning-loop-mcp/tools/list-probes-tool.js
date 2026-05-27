import { z } from "zod";
import { listProbes } from "../../list-probes/list-probes.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const capabilityListProbesTool = {
  name: "capability_list_probes",
  description: "List runtime probe files for a given stack. Read-only discovery.",
  schema: {
    stack: z.string().describe("Stack name (e.g., 'api', 'web')"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const probes = listProbes(root, { stack: args.stack });

    const result = {
      count: probes.length,
      probes: probes.map((p) => ({ path: p.path, stack: p.stack, domain: p.domain })),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "capability_list_probes",
      stack: args.stack,
      count: probes.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

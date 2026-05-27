import { z } from "zod";
import { generateCapabilities } from "#mcp/core/generate-capabilities/generate-capabilities.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const capabilityGenerateTool = {
  name: "capability_generate",
  description: "Generate capability records from product surface adapters. Use dry_run=true first to check for drift, then dry_run=false to write.",
  schema: {
    dry_run: z.boolean().optional().describe("Preview drift without writing (default: false)"),
    stacks: z.array(z.object({
      name: z.string(),
      surfaces: z.array(z.string()),
    })).optional().describe("Override default stacks (default: api+web)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    let result;
    try {
      result = await generateCapabilities({
        root,
        dryRun: args.dry_run,
        stacks: args.stacks,
      });
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            message: error.message,
          }),
        }],
        isError: true,
      };
    }

    const response = {
      drift: result.drift,
      generated: result.diffs
        ?.filter((d) => d.expected !== null)
        .map((d) => ({ id: d.file, stack: d.expected?.stack, surface: d.expected?.surface })) || [],
      diffs: result.diffs,
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "capability_generate",
      dry_run: args.dry_run,
      drift: result.drift,
      diff_count: result.diffs?.length || 0,
    });

    return { content: [{ type: "text", text: JSON.stringify(response) }] };
  },
};

import { z } from "zod";
import { runExtraction } from "../../extract-index/extract-index.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const extractIndexTool = {
  name: "extract_index_entries",
  description: "Extract index entries from evidence markdown files. Idempotent — safe to call multiple times. Use after writing evidence to update the index.",
  schema: {
    capability: z.string().optional().describe("Filter to specific capability (default: all)"),
    dry_run: z.boolean().optional().describe("Preview changes without writing"),
    verbose: z.boolean().optional().describe("Print detailed progress"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = await runExtraction(root, {
      capability: args.capability,
      dryRun: args.dry_run,
      verbose: args.verbose,
    });

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "extract_index_entries",
      ...result.stats,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

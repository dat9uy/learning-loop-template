import { z } from "zod";
import { searchIndex } from "../../search-index/search-index.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const searchIndexTool = {
  name: "search_index_entries",
  description: "Search index entries by capability, dimension, and status. Read-only query.",
  schema: {
    capability: z.string().optional().describe("Filter by capability name"),
    dimension: z.string().optional().describe("Filter by verification dimension (static, install, runtime, product)"),
    status: z.string().optional().describe("Filter by verification status (claimed, verified, rejected)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const results = searchIndex(root, {
      capability: args.capability,
      dimension: args.dimension,
      status: args.status,
    });

    const result = {
      count: results.length,
      results: results.map((r) => ({ id: r.id, frontmatter: r.frontmatter })),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "search_index_entries",
      count: results.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

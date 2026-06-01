import { z } from "zod";
import { searchIndex } from "#mcp/core/search-index.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const indexSearchTool = {
  name: "index_search",
  description: "Search index entries by capability, dimension, and status. Read-only query. Defaults to excluding candidate (unverified) entries unless explicitly requested.",
  schema: {
    capability: z.string().optional().describe("Filter by capability name"),
    dimension: z.string().optional().describe("Filter by verification dimension (static, install, runtime, product)"),
    status: z.string().optional().describe("Filter by verification status (claimed, verified, rejected)"),
    include_candidates: z.boolean().optional().describe("Include candidate entries in results (default: false)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const results = searchIndex(root, {
      capability: args.capability,
      dimension: args.dimension,
      status: args.status,
    }, args.include_candidates ? false : true);

    const result = {
      count: results.length,
      results: results.map((r) => ({ id: r.id, frontmatter: r.frontmatter })),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "index_search",
      count: results.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

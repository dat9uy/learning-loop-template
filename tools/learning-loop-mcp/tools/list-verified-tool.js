import { z } from "zod";
import { listVerifiedClaims } from "#mcp/core/list-verified.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const capabilityListVerifiedTool = {
  name: "capability_list_verified",
  description: "List all verified claims and their supporting evidence. Read-only reporting tool. Defaults to excluding candidate (unverified) entries unless explicitly requested.",
  schema: {
    include_candidates: z.boolean().optional().describe("Include candidate entries in results (default: false)"),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = listVerifiedClaims(root, args.include_candidates || false);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "capability_list_verified",
      claim_count: result.claims.length,
      evidence_count: result.evidence.length,
      assertion_count: (result.assertions || []).length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

import { z } from "zod";
import { listVerifiedClaims } from "../../list-verified/list-verified.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const listVerifiedTool = {
  name: "list_verified_claims",
  description: "List all verified claims and their supporting evidence. Read-only reporting tool.",
  schema: {},
  handler: async () => {
    const root = resolveRoot();
    const result = listVerifiedClaims(root);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "list_verified_claims",
      claim_count: result.claims.length,
      evidence_count: result.evidence.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

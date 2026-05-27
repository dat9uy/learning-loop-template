import { z } from "zod";
import { listVerifiedClaims } from "../../../list-verified/list-verified.js";
import { appendGateLog } from "../../../lib/gate-logging.js";
import { resolveRoot } from "../../../lib/resolve-root.js";

export const capabilityListVerifiedTool = {
  name: "capability_list_verified",
  description: "List all verified claims and their supporting evidence. Read-only reporting tool.",
  schema: {},
  handler: async () => {
    const root = resolveRoot();
    const result = listVerifiedClaims(root);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "capability_list_verified",
      claim_count: result.claims.length,
      evidence_count: result.evidence.length,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

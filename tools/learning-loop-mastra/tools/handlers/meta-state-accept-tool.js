import { z } from "zod";
import { acceptEntry } from "../../core/meta-state.js";
import { replyWithLog } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateAcceptTool = {
  name: "meta_state_accept",
  description: "Mark a finding as `accepted` (standing trade-off terminal). Stamps status=accepted + accepted_at + accepted_by + accepted_reason via true-append v+1. `accepted` is terminal for `isOpen`/`isStaleView`/`deriveStatus`; the finding stops being actionable but is still queryable. `accepted` is archiveable; `accepted` → `resolved` is rejected (`already_terminal`).",
  schema: {
    id: z.string().describe("Finding entry id to accept"),
    accepted_reason: z.string().optional()
      .describe("Human-readable trade-off note (the standing-trade-off rationale)"),
    accepted_by: z.string().optional().default("operator")
      .describe("Operator or rule id that accepted the finding"),
  },
  handler: async ({ id, accepted_reason, accepted_by }) => {
    const root = resolveRoot();
    const result = await acceptEntry(root, id, accepted_by, accepted_reason);
    return replyWithLog(root, "meta_state_accept", { ...result, id });
  },
};
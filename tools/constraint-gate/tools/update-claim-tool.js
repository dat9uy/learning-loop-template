import { z } from "zod";
import { updateClaimVerification } from "../../claim-verification/verify-claim.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

const DIMENSIONS = ["static", "install", "runtime", "product"];
const STATUSES = ["claimed", "verified", "rejected"];
const CLAIM_ID_PATTERN = /^[a-z0-9-]+$/;

export const updateClaimTool = {
  name: "update_claim_verification",
  description: "Update a claim's verification status for a specific dimension. Use with apply=false first to preview, then apply=true to commit.",
  schema: {
    claim_id: z.string().regex(CLAIM_ID_PATTERN).describe("The claim ID to update"),
    dimension: z.enum(DIMENSIONS).describe("Verification dimension"),
    status: z.enum(STATUSES).describe("New verification status"),
    reason: z.string().min(1).describe("Reason for the status change"),
    scope: z.string().optional().describe("Optional scope string"),
    output: z.string().optional().describe("Output capture level"),
    proof_refs: z.array(z.string()).optional().describe("Proof reference IDs"),
    decision_refs: z.array(z.string()).optional().describe("Decision reference IDs"),
    blocked_actions: z.array(z.string()).optional().describe("Actions blocked pending verification"),
    apply: z.boolean().optional().default(false).describe("If false, preview only. If true, write changes."),
  },
  handler: async (args) => {
    const root = resolveRoot();
    const result = await updateClaimVerification({
      root,
      claimId: args.claim_id,
      dimension: args.dimension,
      status: args.status,
      reason: args.reason,
      scope: args.scope,
      output: args.output,
      proofRefs: args.proof_refs,
      decisionRefs: args.decision_refs,
      blockedActions: args.blocked_actions,
      apply: args.apply,
    });

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "update_claim_verification",
      claim_id: args.claim_id,
      dimension: args.dimension,
      status: args.status,
      apply: args.apply,
      updated: result.updated,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

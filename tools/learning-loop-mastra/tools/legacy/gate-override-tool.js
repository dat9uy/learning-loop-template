import { z } from "zod";
import { writeGateOverride } from "../../core/legacy/gate-override.js";
import { loadPromotedRules } from "../../core/legacy/gate-logic.js";
import { resolveRoot } from "#lib/resolve-root.js";

const schemaShape = {
  rule_id: z.string().describe("Rule id to skip (must be an active promoted rule)"),
  ttl_seconds: z.coerce.number().int().positive().max(86400).default(3600).describe("Override TTL in seconds (max 86400)"),
  operator_note: z.string().min(1).describe("Why the override is needed (audit trail)"),
};

const inputSchema = z.object(schemaShape);

export const gateOverrideTool = {
  name: "gate_override",
  description: "Override a promoted gate rule for the current session. The override is TTL'd, audited in runtime-state.jsonl, and applies only to regex/glob rules enforced by the bash gate. Requires a non-empty operator_note for the audit trail.",
  schema: schemaShape,
  handler: async (raw) => {
    const { rule_id, ttl_seconds, operator_note } = inputSchema.parse(raw);
    const root = resolveRoot();
    const rules = loadPromotedRules(root);
    if (!rules.find((r) => r.id === rule_id)) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: `unknown rule_id: ${rule_id}` }) }],
        isError: true,
      };
    }

    writeGateOverride(root, { rule_id, ttl_seconds, operator_note });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ marked: true, rule_id, ttl_seconds, operator_note }),
      }],
    };
  },
};

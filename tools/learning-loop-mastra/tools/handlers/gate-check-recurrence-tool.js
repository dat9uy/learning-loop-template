import { z } from "zod";
import { checkAndEmit } from "../../core/recurrence-tracker.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const gateCheckRecurrenceTool = {
  name: "gate_check_recurrence",
  description: "Check the gate's decision log for recurring false-positive patterns and auto-file findings. Per-session pass: groups by (rule_id, normalized_prefix, session_id), threshold N>=3 per session, full-log scan (no time filter). Cross-session slow-burn pass: groups by (rule_id, normalized_prefix) ignoring session_id, >=5 occurrences across >=2 distinct REAL-tier sessions in a trailing 7-day window. Emits a meta_state finding with a hashed recurrence_key and rule-record-derived evidence_code_ref.",
  schema: {
    threshold: z.coerce.number().int().positive().optional().describe("Minimum occurrences per session to emit (default 3)"),
  },
  handler: async ({ threshold }) => {
    const root = resolveRoot();
    const options = {};
    if (threshold != null) options.threshold = threshold;
    const result = await checkAndEmit(root, options);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

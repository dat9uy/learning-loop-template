import { z } from "zod";
import { checkAndEmit } from "../../core/legacy/recurrence-tracker.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const gateCheckRecurrenceTool = {
  name: "gate_check_recurrence",
  description: "Check the gate's decision log for recurring false-positive patterns and auto-file findings. Reads .gate-decision.log from all surfaces, groups by rule_id + normalized command prefix, and emits a meta_state finding when a pattern recurs at least 3 times within 10 minutes.",
  schema: {
    threshold: z.coerce.number().int().positive().optional().describe("Minimum occurrences to emit (default 3)"),
    window_minutes: z.coerce.number().int().positive().optional().describe("Time window in minutes (default 10)"),
  },
  handler: async ({ threshold, window_minutes }) => {
    const root = resolveRoot();
    const options = {};
    if (threshold != null) options.threshold = threshold;
    if (window_minutes != null) options.windowMs = window_minutes * 60 * 1000;
    const result = checkAndEmit(root, options);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

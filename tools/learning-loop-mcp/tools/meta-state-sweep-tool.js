import { z } from "zod";
import { readRegistry, checkExpiry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

export const metaStateSweepTool = {
  name: "meta_state_sweep",
  description: "Walk the meta-state registry and propose (or apply) lifecycle transitions: expiry for reported entries past expires_at, auto-resolve for entries whose watched file was modified after creation. Dry-run by default. Operator-only (env: OPERATOR_MODE=1). CAS-safe via the version field. Use to keep the registry honest without manual per-entry work.",
  schema: {
    apply: z.boolean().optional().default(false).describe("If true, commit the transitions. Default false (dry-run)."),
  },
  handler: async ({ apply }) => {
    if (apply && process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
      return { content: [{ type: "text", text: JSON.stringify({ swept: false, reason: "operator_role_required" }) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const transitions = [];

    for (const entry of entries) {
      if (TERMINAL_STATUSES.has(entry.status)) continue;
      const exp = checkExpiry(entry);
      if (exp && exp !== entry.status) {
        transitions.push({ id: entry.id, from: entry.status, to: exp, expected_version: entry.version ?? 0 });
      }
    }

    if (apply) {
      const results = [];
      for (const t of transitions) {
        const r = await updateEntry(root, t.id, {
          status: t.to,
          resolved_at: new Date().toISOString(),
          resolved_by: "auto-resolve",
          _expected_version: t.expected_version,
        });
        if (r === "version_mismatch") {
          results.push({ id: t.id, applied: false, reason: "version_mismatch" });
        } else if (r === true) {
          results.push({ id: t.id, applied: true, to: t.to });
        }
      }
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_sweep", applied: results.length, results });
      return { content: [{ type: "text", text: JSON.stringify({ swept: true, results }) }] };
    }

    return { content: [{ type: "text", text: JSON.stringify({ swept: false, dry_run: true, transitions }) }] };
  },
};

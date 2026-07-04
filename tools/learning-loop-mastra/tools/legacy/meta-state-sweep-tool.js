import { z } from "zod";
import { readRegistry, checkExpiry, updateEntry, STALENESS_WINDOW_MS, readFileIndex } from "../../core/meta-state.js";
import { buildRegistrySummary } from "../../core/loop-introspect.js";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// The legacy 'expired' status was removed in plan 260611-1000; the past-TTL
// state is now 'stale' (non-terminal, cascade-closeable in 1 step). This set
// mirrors TERMINAL_STATUSES in core/meta-state.js plus 'stale' for sweep's
// skip-terminal-or-stale iteration.
const TERMINAL_STATUSES = new Set(["auto-resolved", "resolved", "superseded", "stale"]);

/**
 * Check if an entry is past its staleness window.
 * Returns "stale" if `status: "active"` and last update is older than STALENESS_WINDOW_MS.
 * Returns null otherwise.
 *
 * Two stale paths:
 *   1. status: "reported" past expires_at -> "stale" (handled by checkExpiry in core/meta-state.js)
 *   2. status: "active" past STALENESS_WINDOW_MS -> "stale" (this function, NEW)
 */
function checkStaleness(entry) {
  if (entry.entry_kind !== "finding") return null;
  if (entry.status !== "active") return null;
  const referenceTime = entry.acked_at || entry.created_at;
  if (!referenceTime) return null;
  const windowMs = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || STALENESS_WINDOW_MS;
  const age = Date.now() - new Date(referenceTime).getTime();
  if (age > windowMs) return "stale";
  return null;
}

export const metaStateSweepTool = {
  name: "meta_state_sweep",
  description: "Walk the meta-state registry and propose (or apply) lifecycle transitions: expiry for reported entries past expires_at, and staleness-window transitions for active entries. Dry-run by default. Operator-only (env: OPERATOR_MODE=1). CAS-safe via the version field. Use to keep the registry honest without manual per-entry work.",
  schema: {
    apply: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false).describe("If true, commit the transitions. Default false (dry-run)."),
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
      const fromCheckExpiry = checkExpiry(entry);
      const fromCheckStaleness = checkStaleness(entry);
      const targetStatus = fromCheckExpiry || fromCheckStaleness;
      if (targetStatus && targetStatus !== entry.status) {
        transitions.push({ id: entry.id, from: entry.status, to: targetStatus, expected_version: entry.version ?? 0 });
      }
    }

    if (apply) {
      const results = [];
      const sweepTimestamp = new Date().toISOString();
      for (const t of transitions) {
        const isStaleTransition = t.to === "stale";
        const patch = {
          status: t.to,
          _expected_version: t.expected_version,
        };
        if (!isStaleTransition) {
          patch.resolved_at = sweepTimestamp;
          patch.resolved_by = "auto-resolve";
        }
        const r = await updateEntry(root, t.id, patch);
        if (r === "version_mismatch") {
          results.push({ id: t.id, applied: false, reason: "version_mismatch" });
        } else if (r === true) {
          results.push({ id: t.id, applied: true, to: t.to });
        }
      }
      appendGateLog(root, {
        timestamp: sweepTimestamp,
        tool: "meta_state_sweep",
        applied: results.length,
        results,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ swept: true, results }),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            swept: false,
            dry_run: true,
            transitions,
            summary_preview: buildRegistrySummary(entries, readFileIndex(root)),
          }),
        },
      ],
    };
  },
};

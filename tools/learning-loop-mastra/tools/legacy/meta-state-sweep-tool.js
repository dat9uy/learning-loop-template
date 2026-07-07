import { z } from "zod";
import { readRegistry, readFileIndex } from "../../core/meta-state.js";
import { buildRegistrySummary } from "../../core/loop-introspect.js";
import { derivedStaleSet } from "../../core/stale-view.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateSweepTool = {
  name: "meta_state_sweep",
  description: "Read-only reporting view: returns the derived stale-view set as a dry-run report. Plan 260707-0812 Phase 3: the previous `apply:true` mode is removed — sweep no longer writes status. Use `meta_state_resolve` / `meta_state_supersede` to close findings, or `meta_state_re_verify` to re-ground. The derived view is sourced from `isStaleView` (age + drift) so the registry cannot be mutated by sweep. CAS-safe via the version field (read-only). No operator gate.",
  schema: {},
  handler: async () => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const fileIndex = readFileIndex(root);
    const now = Date.now();

    // Derived stale set: age > STALENESS_WINDOW_MS from
    // `last_verified_at`/`created_at` OR hash drift via file-index.jsonl.
    // This is the same set `meta_state_query_drift` + the age filter
    // surface — sweep just packages it as a dedicated read-only report.
    const staleSet = derivedStaleSet(entries, { now, fileIndex });

    // Build the per-finding view the operator would have acted on under the
    // legacy apply:true mode. Now read-only — same shape, no writes.
    const findings = staleSet
      .filter((e) => (e.entry_kind ?? "finding") === "finding")
      .map((e) => ({
        id: e.id,
        status: e.status ?? "open",
        current_version: e.version ?? 0,
        created_at: e.created_at ?? null,
        last_verified_at: e.last_verified_at ?? null,
        category: e.category,
        severity: e.severity,
        affected_system: e.affected_system,
      }));

    const report = {
      swept: false,
      dry_run: true,
      read_only: true,
      total_entries: entries.length,
      stale_view_count: staleSet.length,
      findings,
      summary_preview: buildRegistrySummary(entries, fileIndex),
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_sweep",
      stale_view_count: report.stale_view_count,
      read_only: true,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(report),
        },
      ],
    };
  },
};
// tools/handlers/runtime-state-pause-tool.js — operator-controlled per-surface
// tracking toggle. The tracking toggle is in-band in runtime-state.jsonl:
// `runtime_state_pause` appends a versioned `kind: budget-state, status:
// paused` row under the surface's canonical id (the surface name). The
// gate's `isSurfacePaused` reads `readBudgetTrackingState` — paused
// surfaces no longer surface in the stale-observation scan.
//
// `stop` is terminal for the chain; a `resume` from `stopped` is rejected.
// Restart is a budget-state record under the canonical id, which lives at
// the record-tool layer, not here.
//
// Same preflight marker convention as `runtime_state_record` so the
// operator-preflight guards are uniform.

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { hasSurfacePreflightMarker, isSurfacePaused } from "../../core/runtime-tracking.js";
import {
  appendLedgerEvent,
  readBudgetTrackingState,
  AFFECTED_SYSTEM_ENUM_RUNTIME,
} from "../../core/runtime-state.js";

const PREFLIGHT_MARKER = ".loop-preflight-runtime-tracking";

export const runtimeStatePauseTool = {
  name: "runtime_state_pause",
  description:
    "Pause runtime-state tracking for a surface. Appends an in-band kind:budget-state, status:paused row to runtime-state.jsonl under the canonical id. Requires gate_mark_preflight({surface:'runtime-tracking'}).",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface to pause (must match the runtime-state affected_system enum, not the meta-state superset).",
    ),
  },
  handler: async ({ surface }) => {
    const root = resolveRoot();
    if (!hasSurfacePreflightMarker(root, PREFLIGHT_MARKER)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "preflight_required",
            message: "runtime_state_pause requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-tracking'}) first.",
          }),
        }],
      };
    }
    // A stopped canonical entity cannot be re-paused; restart is a
    // budget-state record under the canonical id. The check here is
    // best-effort (TOCTOU vs a concurrent write) but a stale "already
    // stopped" returns a structured error rather than appending a row.
    let current;
    try {
      current = readBudgetTrackingState(root, surface);
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            error: "corrupt_state",
            surface,
            message: `refusing to pause: budget-tracking state is unreadable (${err.message})`,
          }),
        }],
      };
    }
    if (current === "stopped") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            reason: "already_stopped",
            surface,
            message: "canonical budget-state entity is stopped (terminal); restart is a budget-state record under the canonical id",
          }),
        }],
      };
    }
    if (isSurfacePaused(root, surface)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            already_paused: true,
            surface,
          }),
        }],
      };
    }
    const row = {
      affected_system: surface,
      kind: "budget-state",
      id: surface,
      value: null,
      delta: null,
      source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
      timestamp: new Date().toISOString(),
      status: "paused",
      fingerprint: null,
      metadata: { lifecycle_action: "pause" },
    };
    const written = await appendLedgerEvent(root, row);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, paused: true, surface, status: written.status, version: written.version }),
      }],
    };
  },
};

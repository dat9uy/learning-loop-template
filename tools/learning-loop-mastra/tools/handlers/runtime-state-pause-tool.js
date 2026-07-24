// tools/handlers/runtime-state-pause-tool.js — operator-controlled per-surface
// tracking toggle. In plan 260724-1119 Phase 2, the tracking toggle moved from
// the `.loop/runtime-tracking.json` sidecar into runtime-state.jsonl itself:
// `runtime_state_pause` now appends a versioned `kind: budget-state, status:
// paused` row under the surface's canonical id (D8). The gate's
// `isSurfacePaused` reads `readBudgetTrackingState` (R1) — paused surfaces
// no longer surface in the stale-observation scan.
//
// D1: `stop` is terminal per-id; a `resume` from `stopped` is rejected.
// The canonical id per surface is the surface name itself. Restart = a
// new id (D1) which lives at the tool layer, not here.
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
    "Pause runtime-state tracking for a surface. Appends an in-band kind:budget-state, status:paused row to runtime-state.jsonl under the canonical id (D8). Requires gate_mark_preflight({surface:'runtime-tracking'}).",
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
    // D1: a stopped canonical entity cannot be re-paused; the operator
    // must restart with a fresh id. The check here is best-effort (TOCTOU
    // vs a concurrent write) but a stale "already stopped" returns a
    // structured error rather than appending a row.
    const current = readBudgetTrackingState(root, surface);
    if (current === "stopped") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            reason: "already_stopped",
            surface,
            message: "canonical budget-state entity is stopped (terminal); restart requires a new id",
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

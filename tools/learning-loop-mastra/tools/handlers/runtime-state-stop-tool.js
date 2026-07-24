// tools/handlers/runtime-state-stop-tool.js — operator-controlled per-surface
// non-destructive retire. Plan 260724-1119 Phase 2 D1: appends a versioned
// `kind: budget-state, status: stopped` row under the canonical id. The
// destructive `runtime_state_prune_surface` was removed (D4); `stop` is the
// non-destructive replacement.
//
// Terminal: a `stopped` canonical entity cannot be resumed or paused (D1).
// Restart = a fresh canonical id via `runtime_state_record` (the tool layer
// owns restart semantics — `stop` itself does not create a new id).
//
// Requires confirm:true (mirrors the destructive prune's confirm gating so
// the operator-side cost of a terminal action is identical). Requires the
// preflight marker (same convention as pause/resume).

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { hasSurfacePreflightMarker } from "../../core/runtime-tracking.js";
import {
  appendLedgerEvent,
  readBudgetTrackingState,
  AFFECTED_SYSTEM_ENUM_RUNTIME,
} from "../../core/runtime-state.js";

const PREFLIGHT_MARKER = ".loop-preflight-runtime-tracking";

export const runtimeStateStopTool = {
  name: "runtime_state_stop",
  description:
    "Non-destructively stop runtime-state tracking for a surface. Appends an in-band kind:budget-state, status:stopped row to runtime-state.jsonl under the canonical id (D8). Terminal — restart requires a new id via runtime_state_record. Requires gate_mark_preflight({surface:'runtime-tracking'}) AND confirm:true. Replaces the destructive runtime_state_prune_surface (D4).",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface to stop (must match the runtime-state affected_system enum).",
    ),
    confirm: z
      .union([z.boolean(), z.string()])
      .transform(strictBooleanGuard)
      .optional()
      .default(false)
      .describe(
        "Must be true to authorize the terminal stop. Without true, the tool returns confirm_required and writes nothing.",
      ),
  },
  handler: async ({ surface, confirm = false }) => {
    const root = resolveRoot();
    if (!hasSurfacePreflightMarker(root, PREFLIGHT_MARKER)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "preflight_required",
            message: "runtime_state_stop requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-tracking'}) first.",
          }),
        }],
      };
    }
    if (confirm !== true) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ ok: false, reason: "confirm_required", surface }),
        }],
      };
    }
    const current = readBudgetTrackingState(root, surface);
    if (current === "stopped") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            already_stopped: true,
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
      status: "stopped",
      fingerprint: null,
      metadata: { lifecycle_action: "stop" },
    };
    const written = await appendLedgerEvent(root, row);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, stopped: true, surface, status: written.status, version: written.version }),
      }],
    };
  },
};

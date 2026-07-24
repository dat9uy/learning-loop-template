// tools/handlers/runtime-state-stop-tool.js — operator-controlled per-surface
// non-destructive retire. Appends a versioned `kind: budget-state, status:
// stopped` row under the canonical id. This is the non-destructive
// replacement for the removed destructive prune.
//
// Terminal: a `stopped` canonical entity cannot be resumed or paused.
// Restart = a `runtime_state_record` budget-state row under the canonical
// id — a fresh `active` version on top of the preserved stopped history
// (the tool layer owns restart semantics — `stop` itself does not restart).
//
// Idempotent: stopping an already-stopped surface returns
// `{ok: true, already_stopped: true}` without appending — same posture as
// double-pause/resume-when-active, so retries and scripts are safe. (The
// strict rejections are the cross-state transitions: pause/resume FROM
// stopped.)
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
    "Non-destructively stop runtime-state tracking for a surface. Appends an in-band kind:budget-state, status:stopped row to runtime-state.jsonl under the canonical id. Terminal — restart is a budget-state runtime_state_record under the canonical id. Idempotent on an already-stopped surface (returns already_stopped without appending). Requires gate_mark_preflight({surface:'runtime-tracking'}) AND confirm:true. Replaces the removed destructive runtime_state_prune_surface.",
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
            message: `refusing to stop: budget-tracking state is unreadable (${err.message})`,
          }),
        }],
      };
    }
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

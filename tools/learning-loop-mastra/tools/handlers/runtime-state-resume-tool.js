// tools/handlers/runtime-state-resume-tool.js — operator-controlled per-surface
// tracking toggle (resume side). Appends a versioned `kind: budget-state,
// status: active` row under the canonical id (the surface name).
//
// `stop` is terminal for the chain; `resume` from `stopped` is rejected.
// Restart is a budget-state `runtime_state_record` under the canonical id —
// a stopped surface cannot be silently brought back to life by resume.
// Resume requires a `paused` entity: never-tracked surfaces and `initial`
// entities are rejected rather than silently creating an active row.

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { hasSurfacePreflightMarker } from "../../core/runtime-tracking.js";
import {
  appendLedgerEvent,
  readBudgetTrackingState,
  AFFECTED_SYSTEM_ENUM_RUNTIME,
} from "../../core/runtime-state.js";

const PREFLIGHT_MARKER = ".loop-preflight-runtime-tracking";

export const runtimeStateResumeTool = {
  name: "runtime_state_resume",
  description:
    "Resume runtime-state tracking for a previously paused surface. Appends an in-band kind:budget-state, status:active row to runtime-state.jsonl under the canonical id. Only valid from paused — rejects from stopped (terminal; restart is a budget-state runtime_state_record), from never-tracked surfaces, and from initial entities. Requires gate_mark_preflight({surface:'runtime-tracking'}).",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface to resume (must match the runtime-state affected_system enum).",
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
            message: "runtime_state_resume requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-tracking'}) first.",
          }),
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
            message: `refusing to resume: budget-tracking state is unreadable (${err.message})`,
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
    if (current === "active") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: true,
            already_active: true,
            surface,
          }),
        }],
      };
    }
    // Resume only makes sense from `paused`: a never-tracked surface has
    // nothing to resume (record starts tracking), and `initial` entities
    // have not been paused.
    if (current !== "paused") {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            reason: current === null ? "not_tracked" : "invalid_transition",
            surface,
            status: current,
            message: current === null
              ? "surface has no budget-state entity to resume; use runtime_state_record to start tracking"
              : `resume requires a paused entity, got status "${current}"`,
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
      status: "active",
      fingerprint: null,
      metadata: { lifecycle_action: "resume" },
    };
    const written = await appendLedgerEvent(root, row);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, resumed: true, surface, status: written.status, version: written.version }),
      }],
    };
  },
};

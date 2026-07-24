// tools/handlers/runtime-state-resume-tool.js — operator-controlled per-surface
// tracking toggle (resume side). Plan 260724-1119 Phase 2: appends a versioned
// `kind: budget-state, status: active` row under the canonical id (D8).
//
// D1: `stop` is terminal per-id; `resume` from `stopped` is rejected. The
// operator must restart with a fresh id (`runtime_state_record` with a new
// id) — a stopped surface cannot be silently brought back to life.

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
    "Resume runtime-state tracking for a previously paused surface. Appends an in-band kind:budget-state, status:active row to runtime-state.jsonl under the canonical id (D8). Rejects from stopped (terminal; restart = new id). Requires gate_mark_preflight({surface:'runtime-tracking'}).",
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

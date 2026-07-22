// tools/handlers/runtime-state-resume-tool.js — operator-controlled per-surface
// tracking toggle (resume side). Removes `surface` from the operator sidecar's
// `paused_surfaces`. Same preflight-marker convention as the pause tool and
// `runtime_state_record`.

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SURFACES } from "../../core/surfaces.js";
import { setPausedSurfaces, loadPausedSurfaces } from "../../core/runtime-tracking.js";
import { AFFECTED_SYSTEM_ENUM_RUNTIME } from "../../core/runtime-state.js";

function hasRuntimeTrackingPreflightMarker(root) {
  return SURFACES.some((surface) =>
    existsSync(join(root, surface, "coordination", ".loop-preflight-runtime-tracking")),
  );
}

export const runtimeStateResumeTool = {
  name: "runtime_state_resume",
  description:
    "Resume runtime-state tracking for a previously paused surface. Requires gate_mark_preflight({surface:'runtime-tracking'}).",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface to resume (must match the runtime-state affected_system enum).",
    ),
  },
  handler: async ({ surface }) => {
    const root = resolveRoot();
    if (!hasRuntimeTrackingPreflightMarker(root)) {
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
    const current = loadPausedSurfaces(root);
    const next = current.filter((s) => s !== surface);
    setPausedSurfaces(root, next);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, paused_surfaces: loadPausedSurfaces(root), surface }),
      }],
    };
  },
};

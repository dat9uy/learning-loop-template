// tools/handlers/runtime-state-resume-tool.js — operator-controlled per-surface
// tracking toggle (resume side). Removes `surface` from the operator sidecar's
// `paused_surfaces`. Same preflight-marker convention as the pause tool and
// `runtime_state_record`.

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { mutatePausedSurfaces, hasSurfacePreflightMarker } from "../../core/runtime-tracking.js";
import { AFFECTED_SYSTEM_ENUM_RUNTIME } from "../../core/runtime-state.js";

const PREFLIGHT_MARKER = ".loop-preflight-runtime-tracking";

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
    const paused = await mutatePausedSurfaces(root, (current) => current.filter((s) => s !== surface));
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, paused_surfaces: paused, surface }),
      }],
    };
  },
};

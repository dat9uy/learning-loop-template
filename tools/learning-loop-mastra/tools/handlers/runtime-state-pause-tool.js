// tools/handlers/runtime-state-pause-tool.js — operator-controlled per-surface
// tracking toggle. Adds `surface` to the operator sidecar's `paused_surfaces`
// so `runtime_state_record` and `meta_state_dispatch_finding` stop appending
// rows for it. Requires the per-surface preflight marker
// (`gate_mark_preflight({surface:"runtime-tracking"})`) — same convention as
// `runtime_state_record`, so the operator-preflight guards are uniform.

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

export const runtimeStatePauseTool = {
  name: "runtime_state_pause",
  description:
    "Pause runtime-state tracking for a surface. Requires gate_mark_preflight({surface:'runtime-tracking'}).",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface to pause (must match the runtime-state affected_system enum, not the meta-state superset).",
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
            message: "runtime_state_pause requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-tracking'}) first.",
          }),
        }],
      };
    }
    const current = loadPausedSurfaces(root);
    const next = [...new Set([...current, surface])].sort();
    setPausedSurfaces(root, next);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, paused_surfaces: loadPausedSurfaces(root), surface }),
      }],
    };
  },
};

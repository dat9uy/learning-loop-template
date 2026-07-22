// tools/handlers/runtime-state-prune-surface-tool.js — one-time operator op
// that rewrites runtime-state.jsonl minus every row with `affected_system`
// matching `surface`. Closes finding meta-260722T0006Z's PRIMARY symptom:
// the 20 existing vnstock rows have DISTINCT ids (GAP 1 same-id collapse
// does not touch them) and the inbound gate kept surfacing them.
//
// Destructive: requires both the per-surface preflight marker (`pause`'s
// per-surface convention) AND `confirm:true`. Runs under the same
// withRegistryLock as `appendLedgerEvent`, so a prune cannot interleave
// with a concurrent append.

import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SURFACES } from "../../core/surfaces.js";
import {
  pruneSurfaceRows,
  AFFECTED_SYSTEM_ENUM_RUNTIME,
} from "../../core/runtime-state.js";

function hasRuntimeTrackingPreflightMarker(root) {
  return SURFACES.some((surface) =>
    existsSync(join(root, surface, "coordination", ".loop-preflight-runtime-tracking")),
  );
}

export const runtimeStatePruneSurfaceTool = {
  name: "runtime_state_prune_surface",
  description:
    "One-time destructive rewrite of runtime-state.jsonl removing a paused surface's rows. Requires gate_mark_preflight({surface:'runtime-tracking'}) AND confirm:true. Returns {ok, pruned, remaining, surface}.",
  schema: {
    surface: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).describe(
      "Surface whose rows should be removed from runtime-state.jsonl.",
    ),
    confirm: z.coerce.boolean().optional().default(false).describe(
      "Must be true to authorize the rewrite. Without true, the tool returns confirm_required and writes nothing.",
    ),
  },
  handler: async ({ surface, confirm = false }) => {
    const root = resolveRoot();
    if (!hasRuntimeTrackingPreflightMarker(root)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: "preflight_required",
            message: "runtime_state_prune_surface requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-tracking'}) first.",
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

    const { pruned, remaining } = await pruneSurfaceRows(root, surface);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, pruned, remaining, surface }),
      }],
    };
  },
};

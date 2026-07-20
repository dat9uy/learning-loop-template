import { z } from "zod";
import { join } from "node:path";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { writePreflightMarker, readPreflightMarker } from "../../core/gate-logic.js";
import { SURFACES } from "../../core/surfaces.js";

export const gateMarkPreflightTool = {
  name: "gate_mark_preflight",
  description: "Mark the preflight checklist as completed for a given surface. This is the ONLY way to create a preflight marker — direct file writes to .loop-preflight-* are blocked by the write gate. After calling this tool, writes to that surface's gated paths are unlocked for 30 minutes. The marker file (.loop-preflight-<surface>) is stored in each runtime's coordination/ dir (.claude, .factory, .mastracode) and has a 30-minute TTL. Use when you are about to write to gated paths — `product/**` (surface: \"product\"), `<runtime-surface>/skills/**` (surface: \"skills\"), or `schemas/**` (surface: \"schemas\") — and have walked through the 6-step preflight checklist. Not for record CRUD (records are gated differently) and not for general command checks (use `gate_check` instead).",
  schema: {
    surface: z.enum(["product", "skills", "schemas"]).describe("Surface to mark as preflight-complete. Currently 'product' (unlocks product/** writes), 'skills' (unlocks <runtime-surface>/skills/** writes), and 'schemas' (unlocks schemas/** writes). The marker is named .loop-preflight-<surface>; the write gate reads it back for matching paths."),
  },
  handler: async ({ surface }) => {
    const root = resolveRoot();

    // Write to every surface's coordination/ dir for cross-surface compatibility.
    // If GATE_COORD_DIR is set (test override), use only that directory.
    const coordDirs = process.env.GATE_COORD_DIR
      ? [process.env.GATE_COORD_DIR]
      : SURFACES.map((s) => join(root, s, "coordination"));

    let marker = null;
    for (const coordDir of coordDirs) {
      writePreflightMarker(surface, coordDir);
      marker = readPreflightMarker(surface, coordDir);
    }

    console.error(`gate: mark_preflight_complete ${surface} → marker created at ${marker.completed_at}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "gate_mark_preflight",
      surface,
      marker_created_at: marker.completed_at,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          marked: true,
          surface,
          completed_at: marker.completed_at,
          ttl_minutes: 30,
          note: `Writes to gated paths for surface "${surface}" are unlocked for 30 minutes. After TTL expires, call gate_mark_preflight again.`,
        }),
      }],
    };
  },
};

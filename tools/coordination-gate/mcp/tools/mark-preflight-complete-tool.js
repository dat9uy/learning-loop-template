import { z } from "zod";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { writePreflightMarker, readPreflightMarker } from "../../core/gate-logic.js";

export const markPreflightCompleteTool = {
  name: "mark_preflight_complete",
  description: "Mark the preflight checklist as completed for a given surface. This is the ONLY way to create a preflight marker — direct file writes to .loop-preflight-* are blocked by the write gate. After calling this tool, product/** writes for the surface are unlocked for 30 minutes. The marker file (.loop-preflight-<surface>) is stored in .claude/coordination/ (or .factory/coordination/ for Droid CLI) and has a 30-minute TTL.",
  schema: {
    surface: z.string().describe("Surface to mark as preflight-complete (e.g., 'product'). Must match the surface inferred by the write gate for product/** paths."),
  },
  handler: async ({ surface }) => {
    const root = resolveRoot();

    // Write to both .claude and .factory for cross-surface compatibility
    // If GATE_COORD_DIR is set (test override), use only that directory
    const coordDirs = process.env.GATE_COORD_DIR
      ? [process.env.GATE_COORD_DIR]
      : [`${root}/.claude/coordination`, `${root}/.factory/coordination`];

    let marker = null;
    for (const coordDir of coordDirs) {
      writePreflightMarker(surface, coordDir);
      marker = readPreflightMarker(surface, coordDir);
    }

    console.error(`gate: mark_preflight_complete ${surface} → marker created at ${marker.completed_at}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "mark_preflight_complete",
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
          note: "Product writes for this surface are unlocked for 30 minutes. After TTL expires, you must call mark_preflight_complete again.",
        }),
      }],
    };
  },
};

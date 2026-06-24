import { z } from "zod";
import { readFileSync, existsSync, appendFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { resolveRoot } from "#lib/resolve-root.js";

const SIDECAR_FILENAME = "runtime-state.jsonl";

function computeFingerprint(row) {
  const data = `${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}`;
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

function hasPreflightMarker(root) {
  const claudeMarker = join(root, ".claude", "coordination", ".loop-preflight-runtime-state");
  const factoryMarker = join(root, ".factory", "coordination", ".loop-preflight-runtime-state");
  return existsSync(claudeMarker) || existsSync(factoryMarker);
}

export const runtimeStateRecordTool = {
  name: "runtime_state_record",
  description: "Record a runtime state entry to the sidecar. Operator-preflighted: requires an active preflight marker before writing. Appends a single row to runtime-state.jsonl with computed fingerprint. Use for operator-mediated updates to mutable runtime state (budgets, counters, ledger events).",
  schema: {
    affected_system: z.enum(["vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"])
      .describe("Which system this entry affects"),
    kind: z.enum(["ledger-event", "budget-state"])
      .describe("Entry kind"),
    id: z.string()
      .describe("Stable entry id"),
    value: z.coerce.number().nullable().optional()
      .describe("Current value (nullable)"),
    delta: z.coerce.number().nullable().optional()
      .describe("Delta since last entry (nullable)"),
    source_ref: z.string().regex(/^local:meta-state:.+$/)
      .describe("Pointer to meta-state entry that governs this state"),
    timestamp: z.string().datetime()
      .describe("ISO timestamp"),
    metadata: z.record(z.unknown()).optional()
      .describe("Optional metadata object"),
  },
  handler: async ({ affected_system, kind, id, value, delta, source_ref, timestamp, metadata }) => {
    const root = resolveRoot();

    if (!hasPreflightMarker(root)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "preflight_required", message: "runtime_state_record requires an active preflight marker. Use gate_mark_preflight first." }),
        }],
      };
    }

    const row = {
      affected_system,
      kind,
      id,
      value: value ?? null,
      delta: delta ?? null,
      source_ref,
      timestamp,
      status: "active",
      fingerprint: null,
      metadata: metadata ?? {},
    };

    row.fingerprint = computeFingerprint(row);

    const sidecarPath = join(root, SIDECAR_FILENAME);
    const line = JSON.stringify(row) + "\n";
    appendFileSync(sidecarPath, line, "utf8");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, id, fingerprint: row.fingerprint }),
      }],
    };
  },
};

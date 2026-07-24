import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { appendLedgerEvent, readBudgetTrackingState, AFFECTED_SYSTEM_ENUM_RUNTIME } from "../../core/runtime-state.js";
import { hasSurfacePreflightMarker } from "../../core/runtime-tracking.js";

// Preflight check: this tool is preflight-gated (vs. meta_state_dispatch_finding
// which is LOOP_SESSION_MODE=live-gated). P2 F6 — orthogonal-gate design: each public
// tool has exactly ONE gate; the helper appendLedgerEvent enforces neither.
// stay-at-the-tool-boundary invariant.
const PREFLIGHT_MARKER = ".loop-preflight-runtime-state";

// Walk a JSON value and return true if any Array has an Array child.
// Used by the metadata refine to reject the corruption class observed in
// the npx-roundtrip row 23 (7-deep nested arrays + stray closing-tag
// artifact). Flat arrays of scalars (`["a","b"]`) are allowed; only
// array-valued array elements are rejected.
//
// NOTE: this is structural validation, not content sanitization — a flat
// array of arbitrary strings (e.g. `["</item>..."]`) still passes. String
// content is the caller's responsibility (out of scope for finding D).
// Local helper (1 consumer); promote to a shared util if a second caller
// appears — YAGNI.
function hasNestedArray(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    for (const child of value) {
      if (Array.isArray(child)) return true;
      if (child !== null && typeof child === "object" && hasNestedArray(child)) return true;
    }
    return false;
  }
  for (const v of Object.values(value)) {
    if (hasNestedArray(v)) return true;
  }
  return false;
}

export const runtimeStateRecordTool = {
  name: "runtime_state_record",
  description: "Record one preflight-gated runtime-state row with a computed fingerprint. Use for budgets, counters, or ledger events.",
  schema: {
    affected_system: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME)
      .describe("Affected system"),
    kind: z.enum(["ledger-event", "budget-state"])
      .describe("Row kind"),
    id: z.string()
      .describe("Stable row id"),
    value: z.coerce.number().nullable().optional()
      .describe("Current value"),
    delta: z.coerce.number().nullable().optional()
      .describe("Change since previous row"),
    source_ref: z.string().regex(/^local:meta-state:.+$/)
      .describe("Governing meta-state reference; see field_glossary.source_ref"),
    timestamp: z.string().datetime()
      .describe("ISO timestamp"),
    metadata: z.record(z.unknown()).optional()
      // Reject nested-array metadata at the handler (the only enforcement
      // point — the JSON schema has no code consumer, see
      // schemas/runtime-state.schema.json). Targets the corruption class
      // observed in the npx-roundtrip row 23 (7-deep nested arrays); all
      // 24 currently-stored rows have flat scalar/array metadata and pass.
      .refine((m) => m == null || !hasNestedArray(m), {
        message: "metadata must not contain nested arrays (array-valued array elements); flatten or use scalar/string values",
      })
      .describe("Optional flat metadata object"),
  },
  handler: async ({ affected_system, kind, id, value, delta, source_ref, timestamp, metadata }) => {
    const root = resolveRoot();

    if (!hasSurfacePreflightMarker(root, PREFLIGHT_MARKER)) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ error: "preflight_required", message: "runtime_state_record requires an active preflight marker. Use gate_mark_preflight({surface:'runtime-state'}) first." }),
        }],
      };
    }

    // Per-surface tracking toggle: a paused/stopped surface's writer must
    // refuse BEFORE building the row (no fingerprint, no version
    // assignment, no atomic-append op). This is the mutation boundary, so
    // a corrupt sidecar read is a fail-closed error — never a silent
    // "not paused" (the read gates fail-open; writers must not).
    // Best-effort vs a concurrent lifecycle write (TOCTOU: the check runs
    // outside the append lock); acceptable at single-operator scale.
    let surfaceStatus;
    try {
      surfaceStatus = readBudgetTrackingState(root, affected_system);
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            error: "corrupt_state",
            affected_system,
            message: `refusing to record: budget-tracking state is unreadable (${err.message})`,
          }),
        }],
      };
    }
    // One budget-tracking entity per surface, under the canonical id (the
    // surface name) — pause/resume/stop only ever write that id, so a
    // budget-state record under any other id would fork the lifecycle.
    // Restart: after `stop` (terminal — a stopped chain gets no further
    // pause/resume transitions), the FIRST budget-state record under the
    // canonical id is the sanctioned restart: a fresh `active` version on
    // top of the preserved stopped history.
    if (kind === "budget-state" && id !== affected_system) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            reason: "canonical_id_required",
            affected_system,
            message: `budget-state records must use the canonical id "${affected_system}" (one tracking entity per surface)`,
          }),
        }],
      };
    }
    const blocked =
      kind === "budget-state"
        ? surfaceStatus === "paused" // stopped → allowed: that record IS the restart
        : (surfaceStatus === "paused" || surfaceStatus === "stopped") && id === affected_system;
    if (blocked) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ok: false,
            status: surfaceStatus,
            affected_system,
            message: surfaceStatus === "stopped"
              ? "surface tracking is stopped; ledger events under the canonical id are blocked (a budget-state record under the canonical id restarts tracking)"
              : "surface is paused; resume before recording",
          }),
        }],
      };
    }

    // Kind-conditional status: ledger-event rows carry status "active"
    // (immutable audit). A fresh budget-state record also enters at
    // "active" — the lifecycle's `initial` state is reserved for
    // migration-seeded entities; transitions (paused/stopped) are
    // appended exclusively by the pause/resume/stop tools.
    // `appendLedgerEvent` double-checks via `assertKindConditionalStatus`.
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

    const written = await appendLedgerEvent(root, row);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ok: true, id, fingerprint: written.fingerprint }),
      }],
    };
  },
};
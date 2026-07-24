import { z } from "zod";
import { checkGrounding } from "../../core/check-grounding.js";
import { isOpen } from "../../core/stale-view.js";
import { readFileIndex } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { replyWithLog, loadEntry, appendGateLog } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// meta_state_touch — operator attestation path for re-grounding aged findings
// whose verification model is "operator attestation + evidence hash still
// matches" rather than "executable verification steps". Pairs with
// meta_state_re_verify: re-verify runs steps; touch accepts a clean grounding
// signal (no drift) as the freshness witness. The field `last_verified_at` is
// the freshness stamp both write; it is also a meta_state_patch deny-list
// member, so the guarded path is the only way to refresh it.
//
// Plans: 260724-1931-meta-state-touch-grounding-guarded-re-grounding-for-aged-findings
//   - phase 1: contract (this header).
//   - phase 2: handler + registration on every surface.
//   - phase 3: immutabilize last_verified_at in the patch path.

export const metaStateTouchTool = {
  name: "meta_state_touch",
  description: "Re-ground an open finding whose `verification.steps` is empty by attesting the current grounding signal (no drift, no missing evidence). Stamps `last_verified_at` when checkGrounding reports no negative signal; rejects on drift, missing evidence, wrong kind, wrong status, or missing id. Use meta_state_re_verify when verification.steps is set; use meta_state_touch when the freshness witness is operator attestation rather than a re-runnable step.",
  schema: {
    id: z.string().describe("Entry id to re-ground via operator attestation"),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: touch succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, _expected_version }) => {
    const gateLogTimestamp = new Date().toISOString();
    const root = resolveRoot();
    const entry = loadEntry(root, id);

    if (!entry) {
      return replyWithLog(root, "meta_state_touch", { touched: false, reason: "not_found", id });
    }

    if (entry.entry_kind !== "finding") {
      return replyWithLog(root, "meta_state_touch", {
        touched: false,
        reason: "wrong_kind",
        id,
        entry_kind: entry.entry_kind,
      });
    }

    if (!isOpen(entry)) {
      return replyWithLog(root, "meta_state_touch", {
        touched: false,
        reason: "wrong_status",
        id,
        current_status: entry.status ?? null,
      });
    }

    // Grounding snapshot — pure, no subprocess, file-index injected to keep
    // checkGrounding side-effect-free. Accept: grounded (hash_match:true),
    // skipped (no mechanism_check — the 22-finding common case), unknown
    // (no evidence to ground on). Reject: drifted (hash_match:false OR
    // code_ref_exists:false). The no-baseline case (hash_match:null) is
    // accepted on purpose — matches the existing isStaleView no-drift-default
    // semantics and the gate-log snapshot records the ambiguity for audit.
    const grounding = checkGrounding(entry, {
      root,
      fileIndex: readFileIndex(root),
    });

    const groundingStatus = grounding?.status ?? "unknown";
    if (groundingStatus === "drifted" || grounding?.grounding?.code_ref_exists === false) {
      // Distinguish a hash-mismatch drift from a missing-file drift so the
      // caller can route to the right follow-up (refresh index vs. re-anchor).
      const reason = grounding?.grounding?.code_ref_exists === false ? "missing" : "drifted";
      const result = {
        touched: false,
        reason,
        id,
        grounding: {
          status: groundingStatus,
          hash_match: grounding?.grounding?.hash_match ?? null,
          code_ref_exists: grounding?.grounding?.code_ref_exists ?? null,
        },
      };
      appendGateLog(root, {
        timestamp: gateLogTimestamp,
        tool: "meta_state_touch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const now = new Date().toISOString();
    const expectedVersion = _expected_version !== undefined ? _expected_version : (entry.version ?? 0);
    const updateOutcome = await applyUpdateAndCheck(
      root,
      id,
      { last_verified_at: now, _expected_version: expectedVersion },
      "meta_state_touch",
    );

    if (!updateOutcome.ok) {
      const result = {
        touched: false,
        reason: updateOutcome.reason,
        id,
        ...(updateOutcome.current_version !== undefined ? { current_version: updateOutcome.current_version } : {}),
      };
      appendGateLog(root, {
        timestamp: gateLogTimestamp,
        tool: "meta_state_touch",
        ...result,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const result = {
      touched: true,
      id,
      last_verified_at: now,
      grounding: {
        status: groundingStatus,
        hash_match: grounding?.grounding?.hash_match ?? null,
        code_ref_exists: grounding?.grounding?.code_ref_exists ?? null,
      },
    };

    // replyWithLog writes the canonical per-call breadcrumb carrying the
    // full result body — including the grounding snapshot — for audit.
    return replyWithLog(root, "meta_state_touch", result);
  },
};

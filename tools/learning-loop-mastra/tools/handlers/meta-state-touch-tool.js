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

    const precheck = checkEntryPreconditions(root, id);
    if (!precheck.ok) {
      return replyWithLog(root, "meta_state_touch", precheck.wireResult);
    }
    const entry = precheck.entry;

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

    if (isGroundingReject(grounding)) {
      const wireResult = buildGroundingReject(id, grounding);
      appendGateLog(root, {
        timestamp: gateLogTimestamp,
        tool: "meta_state_touch",
        ...wireResult,
      });
      return { content: [{ type: "text", text: JSON.stringify(wireResult) }] };
    }

    const now = new Date().toISOString();
    const updateOutcome = await applyUpdateAndCheck(
      root,
      id,
      { last_verified_at: now, _expected_version: resolveExpectedVersion(entry, _expected_version) },
      "meta_state_touch",
    );

    if (!updateOutcome.ok) {
      const wireResult = buildUpdateFailure(id, updateOutcome);
      appendGateLog(root, {
        timestamp: gateLogTimestamp,
        tool: "meta_state_touch",
        ...wireResult,
      });
      return { content: [{ type: "text", text: JSON.stringify(wireResult) }] };
    }

    // replyWithLog writes the canonical per-call breadcrumb carrying the
    // full result body — including the grounding snapshot — for audit.
    return replyWithLog(root, "meta_state_touch", {
      touched: true,
      id,
      last_verified_at: now,
      grounding: summarizeGrounding(grounding),
    });
  },
};

// Resolve the `reopens` set on the optional `entry_id`. The new finding
// declares it via `reopens: [...]` so those ids are not orphans.
//
// Pre-conditions on the touched entry: it must exist, be a finding, and be
// open. Each failure mode carries its own wire shape; we return the
// pre-built wireResult so the handler can dispatch it verbatim.
function checkEntryPreconditions(root, id) {
  const entry = loadEntry(root, id);

  if (!entry) {
    return { ok: false, wireResult: { touched: false, reason: "not_found", id } };
  }
  if (entry.entry_kind !== "finding") {
    return {
      ok: false,
      wireResult: {
        touched: false,
        reason: "wrong_kind",
        id,
        entry_kind: entry.entry_kind,
      },
    };
  }
  if (!isOpen(entry)) {
    return {
      ok: false,
      wireResult: {
        touched: false,
        reason: "wrong_status",
        id,
        current_status: entry.status ?? null,
      },
    };
  }
  return { ok: true, entry };
}

// Distinguish a hash-mismatch drift from a missing-file drift so the
// caller can route to the right follow-up (refresh index vs. re-anchor).
// Both reject the touch; the reason differentiates the wire result.
function isGroundingReject(grounding) {
  const groundingStatus = grounding?.status ?? "unknown";
  return groundingStatus === "drifted" || grounding?.grounding?.code_ref_exists === false;
}

function buildGroundingReject(id, grounding) {
  const groundingStatus = grounding?.status ?? "unknown";
  const reason = grounding?.grounding?.code_ref_exists === false ? "missing" : "drifted";
  return {
    touched: false,
    reason,
    id,
    grounding: summarizeGrounding(grounding, groundingStatus),
  };
}

function buildUpdateFailure(id, updateOutcome) {
  return {
    touched: false,
    reason: updateOutcome.reason,
    id,
    ...(updateOutcome.current_version !== undefined ? { current_version: updateOutcome.current_version } : {}),
  };
}

// Collapse the optional-chaining pyramid on `grounding.grounding.*` into one
// place so call sites stay flat. The caller may override `status` to preserve
// the exact snapshot value the handler observed (some reject paths compute
// status before this helper runs).
function summarizeGrounding(grounding, statusOverride) {
  return {
    status: statusOverride ?? grounding?.status ?? "unknown",
    hash_match: grounding?.grounding?.hash_match ?? null,
    code_ref_exists: grounding?.grounding?.code_ref_exists ?? null,
  };
}

// CAS: explicit `_expected_version` if provided, otherwise the entry's
// current version (matches meta_state_re_verify's contract).
function resolveExpectedVersion(entry, _expected_version) {
  return _expected_version !== undefined ? _expected_version : (entry.version ?? 0);
}
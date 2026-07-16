import { z } from "zod";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { runVerification } from "../../core/verification-runner.js";
import { isOpen } from "../../core/stale-view.js";
import { canonicalIndexKey, upsertFileIndexEntry } from "../../core/meta-state.js";
import { computeFileHash } from "../../core/check-grounding.js";
import { resolveSafePath, PathContainmentError } from "../../core/path-containment.js";
import { stripEvidenceAnchor } from "../../core/gate-logic.js";
import { replyWithLog, loadEntry, appendGateLog } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const HISTORY_CAP = 50;

export const metaStateReVerifyTool = {
  name: "meta_state_re_verify",
  description: "Re-verify a meta-state entry by running its verification.steps. Each step is executed via core/verification-runner.js with cmd-allowlist + shell:false + 10s timeout. Plan 260707-0812 Phase 3: the trigger predicate is `isOpen` (covers open/active/reported/stale) — there is no `status: 'stale'` hard-requirement. On a full pass, stamps `last_verified_at` and leaves the entry `open` (no status transition). On any failure, appends to `verification.history` (FIFO cap 50) and leaves the entry `open`. The trigger for re-verify is the derived stale view (the operator/caller decides); the tool just re-grounds. Gated on META_STATE_VERIFY_EXEC=1 (default off).\n\nPlan 260716-0624 Phase 03: opt-in `refresh: true` clears the drift signal on a passing run. Default (no refresh) preserves `rule-no-orphaned-evidence` consult-gate integrity — operators wanting to clear drift use the explicit arg or audited `meta_state_refresh_file_index` path. Index refresh is CAS-ordered AFTER the entry patch lands (no orphan baseline on conflict); gate-log breadcrumb on every refresh attempt.",
  schema: {
    id: z.string().describe("Entry id to re-verify"),
    // RT: M3 — opt-in refresh; default false. The consult-gate must remain
    // inviolable: `rule-no-orphaned-evidence` requires the file to be
    // grounded before resolve. Operators wanting drift-clear opt in here.
    refresh: z.boolean().optional().default(false)
      .describe("Opt-in: refresh file-index baseline for evidence_code_ref on a passing run. Default false (consult-gate preserved)."),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: re-verify succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, refresh = false, _expected_version }) => {
    const gateLogTimestamp = new Date().toISOString();
    if (process.env.META_STATE_VERIFY_EXEC !== "1" && process.env.META_STATE_VERIFY_EXEC !== "true") {
      const result = { re_verified: false, reason: "verify_exec_required", id };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const root = resolveRoot();
    const entry = loadEntry(root, id);
    if (!entry) {
      return replyWithLog(root, "meta_state_re_verify", { re_verified: false, reason: "not_found", id });
    }
    // Plan 260707-0812 Phase 3: drop the `status: "stale"` hard-requirement.
    // re_verify accepts any `isOpen` finding. The caller decides when to
    // trigger (typically when the derived stale view surfaces the entry).
    if (!isOpen(entry)) {
      return replyWithLog(root, "meta_state_re_verify", { re_verified: false, reason: "wrong_status", id, current_status: entry.status ?? null });
    }
    if (!entry.verification || !Array.isArray(entry.verification.steps) || entry.verification.steps.length === 0) {
      return replyWithLog(root, "meta_state_re_verify", { re_verified: false, reason: "no_verification_steps", id });
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const history = Array.isArray(entry.verification.history) ? [...entry.verification.history] : [];
    const now = new Date().toISOString();
    const stepResults = [];
    let allPassed = true;
    for (const step of entry.verification.steps) {
      const r = runVerification(root, step);
      stepResults.push(r);
      history.push({ at: now, status: r.status, signal: r.signal });
      if (r.status !== "passed") {
        allPassed = false;
        break; // short-circuit on first failure
      }
    }
    // FIFO cap
    while (history.length > HISTORY_CAP) history.shift();
    // Plan 260707-0812 Phase 3: on pass, stamp `last_verified_at` only — the
    // entry stays `open` (no status transition). The pre-Phase-3 behavior was
    // to set `status: "active"`; that transition is removed because the
    // status enum no longer carries `active`.
    const patch = {
      verification: { ...entry.verification, history },
      _expected_version: expectedVersion,
    };
    if (allPassed) {
      patch.last_verified_at = now;
    }
    const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_re_verify");
    if (!updateOutcome.ok) {
      return replyWithLog(root, "meta_state_re_verify", { re_verified: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version });
    }

    // Plan 260716-0624 Phase 03 (RT: M1, M14): index refresh AFTER entry
    // update confirmed (CAS passed). On CAS conflict, index never mutates
    // (no orphan baseline). Gate-log breadcrumb on every refresh attempt.
    let indexRefreshed = false;
    const refreshRequested = refresh === true && allPassed;
    if (refreshRequested && typeof entry.evidence_code_ref === "string") {
      const canonical = canonicalIndexKey(entry.evidence_code_ref);
      try {
        // RT: M2 — route through resolveSafePath to reject traversal/symlink/hardlink.
        const absPath = resolveSafePath(root, canonical);
        const currentHash = computeFileHash(absPath);
        const ok = await upsertFileIndexEntry(root, canonical, currentHash);
        if (!ok) {
          appendGateLog(root, {
            timestamp: gateLogTimestamp,
            tool: "meta_state_re_verify",
            action: "index_refresh_skipped",
            id,
            reason: "upsert_returned_false",
          });
        } else {
          indexRefreshed = true;
          // RT: M14 — audit-trail gate-log entry on success.
          appendGateLog(root, {
            timestamp: gateLogTimestamp,
            tool: "meta_state_re_verify",
            action: "index_refreshed",
            id,
            canonical,
            current_hash: currentHash,
          });
        }
      } catch (err) {
        // Best-effort skip; re_verify already returned re_verified:true above.
        // Mirror computeCurrentHashes' classification: a realpath ENOENT inside
        // root surfaces as PathContainmentError("outside_root", resolvedPath:null)
        // — that is a missing file, NOT a containment violation. An actual
        // escape carries a non-null resolvedPath (or a different reason).
        const reason = err instanceof PathContainmentError
          ? (err.reason === "outside_root" && err.resolvedPath === null
              ? "missing"
              : `containment_violation:${err.reason}`)
          : (err?.code === "ENOENT" ? "missing" : (err?.code ?? err?.message ?? "unknown"));
        appendGateLog(root, {
          timestamp: gateLogTimestamp,
          tool: "meta_state_re_verify",
          action: "index_refresh_skipped",
          id,
          reason,
        });
      }
    }

    const result = {
      re_verified: allPassed,
      id,
      status: entry.status ?? "open",
      history_appended: stepResults.length,
      step_results: stepResults,
      last_verified_at: allPassed ? now : (entry.last_verified_at || null),
      index_refreshed: indexRefreshed, // observability (RT: M14)
    };
    return replyWithLog(root, "meta_state_re_verify", result);
  },
};
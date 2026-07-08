import { z } from "zod";
import {
  readRegistry,
} from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { runVerification } from "../../core/verification-runner.js";
import { isOpen } from "../../core/stale-view.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const HISTORY_CAP = 50;

export const metaStateReVerifyTool = {
  name: "meta_state_re_verify",
  description: "Re-verify a meta-state entry by running its verification.steps. Each step is executed via core/verification-runner.js with cmd-allowlist + shell:false + 10s timeout. Plan 260707-0812 Phase 3: the trigger predicate is `isOpen` (covers open/active/reported/stale) — there is no `status: 'stale'` hard-requirement. On a full pass, stamps `last_verified_at` and leaves the entry `open` (no status transition). On any failure, appends to `verification.history` (FIFO cap 50) and leaves the entry `open`. The trigger for re-verify is the derived stale view (the operator/caller decides); the tool just re-grounds. Gated on META_STATE_VERIFY_EXEC=1 (default off).",
  schema: {
    id: z.string().describe("Entry id to re-verify"),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: re-verify succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, _expected_version }) => {
    if (process.env.META_STATE_VERIFY_EXEC !== "1" && process.env.META_STATE_VERIFY_EXEC !== "true") {
      const result = { re_verified: false, reason: "verify_exec_required", id };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      const result = { re_verified: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    // Plan 260707-0812 Phase 3: drop the `status: "stale"` hard-requirement.
    // re_verify accepts any `isOpen` finding. The caller decides when to
    // trigger (typically when the derived stale view surfaces the entry).
    if (!isOpen(entry)) {
      const result = { re_verified: false, reason: "wrong_status", id, current_status: entry.status ?? null };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (!entry.verification || !Array.isArray(entry.verification.steps) || entry.verification.steps.length === 0) {
      const result = { re_verified: false, reason: "no_verification_steps", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
      const result = { re_verified: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version };
      appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const result = {
      re_verified: allPassed,
      id,
      status: entry.status ?? "open",
      history_appended: stepResults.length,
      step_results: stepResults,
      last_verified_at: allPassed ? now : (entry.last_verified_at || null),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
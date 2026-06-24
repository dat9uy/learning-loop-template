import { z } from "zod";
import {
  readRegistry,
  updateEntry,
} from "../../core/legacy/meta-state.js";
import { runVerification } from "../../core/legacy/verification-runner.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const HISTORY_CAP = 50;

export const metaStateReVerifyTool = {
  name: "meta_state_re_verify",
  description: "Re-verify a stale meta-state entry by running its verification.steps. Each step is executed via core/verification-runner.js with cmd-allowlist + shell:false + 10s timeout. On a full pass, transitions the entry stale -> active and stamps last_verified_at. On any failure, stays stale and appends to verification.history (FIFO cap 50). Gated on META_STATE_VERIFY_EXEC=1 (default off). Use to close the TTL recursion: stale findings can be re-validated rather than auto-killed.",
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
    if (entry.status !== "stale") {
      const result = { re_verified: false, reason: "wrong_status", id, current_status: entry.status };
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
    const patch = {
      verification: { ...entry.verification, history },
      _expected_version: expectedVersion,
    };
    if (allPassed) {
      patch.status = "active";
      patch.last_verified_at = now;
    }
    const updateResult = await updateEntry(root, id, patch);
    if (updateResult === "version_mismatch") {
      const result = { re_verified: false, reason: "version_mismatch", id };
      appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (updateResult !== true) {
      throw new Error(`meta_state_re_verify: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`);
    }
    const result = {
      re_verified: allPassed,
      id,
      status: allPassed ? "active" : "stale",
      history_appended: stepResults.length,
      step_results: stepResults,
      last_verified_at: allPassed ? now : (entry.last_verified_at || null),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_re_verify", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

import { z } from "zod";
import { isAbsolute, join } from "node:path";
import { computeFileHash } from "#mcp/core/check-grounding.js";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateRefreshFingerprintTool = {
  name: "meta_state_refresh_fingerprint",
  description: "Refresh the SHA-256 fingerprint of a meta-state entry's evidence_code_ref. Use this when check_grounding returns status: 'drifted' with drift_kind: 'hash_mismatch' and you've decided the change is legitimate. Errors when mechanism_check is not true (nothing to refresh) or the file is missing. Returns { id, code_fingerprint, refreshed_at, status: 'refreshed' }.",
  schema: {
    id: z.string().min(1).describe("Entry id to refresh the fingerprint for"),
  },
  handler: async ({ id }) => {
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }

    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "entry_not_found",
          id,
        }) }],
      };
    }

    // Per H-3: cannot refresh a non-grounded entry
    if (entry.mechanism_check !== true) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "not_grounded",
          id,
          mechanism_check: entry.mechanism_check ?? null,
          reason: "mechanism_check is not true; nothing to refresh",
        }) }],
      };
    }

    // Per H-4: cannot refresh without evidence_code_ref (legacy fallback)
    const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
    if (typeof rawCodeRef !== "string") {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "code_missing",
          id,
          evidence_code_ref: null,
        }) }],
      };
    }

    const absPath = isAbsolute(rawCodeRef) ? rawCodeRef : join(root, rawCodeRef);
    let hash;
    try {
      hash = computeFileHash(absPath);
    } catch {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "code_missing",
          id,
          evidence_code_ref: absPath,
        }) }],
      };
    }

    const updateResult = await updateEntry(root, id, { code_fingerprint: hash });
    if (updateResult !== true) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "update_failed",
          id,
          update_result: updateResult,
        }) }],
      };
    }

    const refreshed_at = new Date().toISOString();
    appendGateLog(root, {
      timestamp: refreshed_at,
      tool: "meta_state_refresh_fingerprint",
      id,
      code_fingerprint: hash,
      refreshed_at,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({
        id,
        code_fingerprint: hash,
        refreshed_at,
        status: "refreshed",
      }) }],
    };
  },
};

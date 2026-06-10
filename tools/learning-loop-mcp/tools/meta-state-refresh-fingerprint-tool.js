import { z } from "zod";
import { isAbsolute, join } from "node:path";
import { computeFileHash } from "#mcp/core/check-grounding.js";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { stripEvidenceAnchor } from "#mcp/core/gate-logic.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Idempotency cache: same (id, previous_code_fingerprint) within 60s returns
// the cached response. Keyed on the *stored* fingerprint so a real file change
// (which mutates entry.code_fingerprint via updateEntry) is automatically a
// cache miss on the next call. In-process Map; cleared on MCP server restart.
const _idempotencyCache = new Map();
const CACHE_TTL_MS = 60_000;

function _cacheKey(id, previousFingerprint) {
  return `${id}::${previousFingerprint ?? "null"}`;
}

function _cacheGet(key) {
  const entry = _idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.stored_at > CACHE_TTL_MS) {
    _idempotencyCache.delete(key);
    return null;
  }
  return entry;
}

function _cacheSet(key, result) {
  _idempotencyCache.set(key, { result, stored_at: Date.now() });
}

// Test-only exports. Production code must not call these.
export function _clearIdempotencyCacheForTests() {
  _idempotencyCache.clear();
}

export function _backdateIdempotencyCacheForTests(key, ageMs) {
  const entry = _idempotencyCache.get(key);
  if (entry) entry.stored_at = Date.now() - ageMs;
}

export const metaStateRefreshFingerprintTool = {
  name: "meta_state_refresh_fingerprint",
  description: "Refresh the SHA-256 fingerprint of a meta-state entry's evidence_code_ref. Use this when check_grounding returns status: 'drifted' with drift_kind: 'hash_mismatch' and you've decided the change is legitimate. Errors when mechanism_check is not true (nothing to refresh) or the file is missing. Returns { id, code_fingerprint, refreshed_at, status: 'refreshed' }. Returns the same response within 60s for identical (id, previous_fingerprint) calls; look for cache_hit: true in the response. For drift detection, use meta_state_check_grounding.",
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

    // Cache lookup: same (id, previous_fingerprint) within 60s returns the cached response.
    const cacheKey = _cacheKey(id, entry.code_fingerprint);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ...cached.result, cache_hit: true }) }],
      };
    }

    // Per H-3: cannot refresh a non-grounded entry
    if (entry.mechanism_check !== true) {
      const resultObj = {
        error: "not_grounded",
        id,
        mechanism_check: entry.mechanism_check ?? null,
        reason: "mechanism_check is not true; nothing to refresh",
      };
      _cacheSet(cacheKey, resultObj);
      return {
        content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
      };
    }

    // Per H-4: cannot refresh without evidence_code_ref
    const rawCodeRef = entry.evidence_code_ref;
    if (typeof rawCodeRef !== "string") {
      const resultObj = {
        error: "code_missing",
        id,
        evidence_code_ref: null,
      };
      _cacheSet(cacheKey, resultObj);
      return {
        content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
      };
    }

    // Strip both `:line` and `#anchor` suffixes before resolving the file
    // path, consistent with checkGrounding and checkResolutionEvidence.
    // Without this, `path/to/file.js:37` and `path/to/file.js#functionName`
    // would be treated as literal file paths and fail with code_missing.
    const strippedCodeRef = stripEvidenceAnchor(rawCodeRef);
    const absPath = isAbsolute(strippedCodeRef) ? strippedCodeRef : join(root, strippedCodeRef);
    let hash;
    try {
      hash = computeFileHash(absPath);
    } catch {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "code_missing",
          id,
          evidence_code_ref: absPath,
          cache_hit: false,
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
          cache_hit: false,
        }) }],
      };
    }

    const refreshed_at = new Date().toISOString();
    const resultObj = {
      id,
      code_fingerprint: hash,
      refreshed_at,
      status: "refreshed",
    };
    _cacheSet(cacheKey, resultObj);
    appendGateLog(root, {
      timestamp: refreshed_at,
      tool: "meta_state_refresh_fingerprint",
      id,
      code_fingerprint: hash,
      refreshed_at,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
    };
  },
};

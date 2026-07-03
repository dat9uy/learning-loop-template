import { z } from "zod";
import { resolve as pathResolve } from "node:path";
import { statSync } from "node:fs";
// computeFileHashCached is the tool-layer hash cache (Phase 2), co-located in the
// check-grounding tool. Shared with this refresh tool so both hash through the
// same (absPath, mtimeMs, size) cache. Importing a sibling legacy tool is the
// existing pattern (the legacy tools are dynamically-loaded shims); extracting a
// shared helper is out of scope for this migration.
import { computeFileHashCached, _clearHashCacheForTests } from "./meta-state-check-grounding-tool.js";
import {
  readRegistry,
  upsertFileIndexEntry,
  canonicalIndexKey,
} from "../../core/meta-state.js";
import { resolveSafePath, PathContainmentError } from "../../core/path-containment.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Idempotency cache: same (canonicalPath, mtimeMs, size) within 60s returns the
// cached response. Keyed on the file's CURRENT state (mtimeMs + size — the same
// shape as computeFileHashCached and read-registry-cache), so a real file change
// is a cache miss (red-team F13's goal: never serve a stale refresh result). The
// prior tool keyed on the per-record code_fingerprint, which goes static once
// Phase 5 stops writing it — that would make every call a hit and mask drift.
// mtime+size never goes static while the file is being edited. In-process Map;
// cleared on MCP server restart.
const _idempotencyCache = new Map();
const CACHE_TTL_MS = 60_000;

function _cacheKey(canonicalPath, mtimeMs, size) {
  return `${canonicalPath}::${mtimeMs}::${size}`;
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
  _clearHashCacheForTests();
}

export function _backdateIdempotencyCacheForTests(key, ageMs) {
  const entry = _idempotencyCache.get(key);
  if (entry) entry.stored_at = Date.now() - ageMs;
}

export const metaStateRefreshFileIndexTool = {
  name: "meta_state_refresh_file_index",
  description:
    "Refresh the path-keyed fingerprint index for a cited path. One call upserts the path's current SHA-256 into file-index.jsonl, re-grounding ALL findings anchored to that path — the O(1)-per-file-change operator. " +
    "AMPLIFIED BLAST RADIUS: a single refresh accepts drift for every mechanism_check:true finding whose evidence_code_ref canonicalizes to this path. Caller identity (session_id/agent) is recorded in the gate log; pass `reason` to document why the change is legitimate. " +
    "Errors when the file is missing (code_missing) or the path escapes root. Returns { path, code_fingerprint, refreshed_at, status, findings_regrounded, reason? }. Idempotent within 60s for an unchanged (path, file mtime+size); look for cache_hit: true. For drift detection, use meta_state_check_grounding.",
  schema: {
    path: z.string().min(1).describe("Cited path to refresh (the evidence_code_ref or its bare file form; :line/#anchor are stripped). Relative to root."),
    reason: z.string().optional().describe("Optional: why this refresh is legitimate (recorded in the gate log for the audit trail)."),
  },
  handler: async ({ path: rawPath, reason } = {}) => {
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

    const canonicalPath = canonicalIndexKey(rawPath);

    // Resolve the file path (LIM-4 realpath containment — rejects escape).
    let absPath;
    try {
      absPath = resolveSafePath(root, canonicalPath);
    } catch (err) {
      if (err instanceof PathContainmentError && err.reason === "outside_root" && err.resolvedPath === null) {
        // Missing file inside root — not cached (a file that appears later must refresh).
        return { content: [{ type: "text", text: JSON.stringify({
          error: "code_missing", path: canonicalPath, evidence_code_ref: pathResolve(root, canonicalPath), cache_hit: false,
        }) }] };
      }
      throw err;
    }

    // Stat the live file (needed for the idempotency key + the cached hash).
    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      return { content: [{ type: "text", text: JSON.stringify({
        error: "code_missing", path: canonicalPath, evidence_code_ref: absPath, cache_hit: false,
      }) }] };
    }

    // Idempotency: keyed on (canonicalPath, mtimeMs, size) — the file's current
    // state. An unchanged file hits; a real edit (new mtime/size) misses (F13).
    const cacheKey = _cacheKey(canonicalPath, stat.mtimeMs, stat.size);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      return {
        content: [{ type: "text", text: JSON.stringify({ ...cached.result, cache_hit: true }) }],
      };
    }

    // Hash the live file (cached in the tool layer — Phase 2/3).
    const hash = await computeFileHashCached(absPath, stat);

    // Count the K mechanism_check:true findings anchored to this canonical path
    // (informational; correctness rests on the canonical key, not the count).
    const entries = readRegistry(root);
    const findingsRegrounded = entries.filter(
      (e) => e.entry_kind === "finding" && e.mechanism_check === true
        && typeof e.evidence_code_ref === "string"
        && canonicalIndexKey(e.evidence_code_ref) === canonicalPath,
    ).length;

    const ok = await upsertFileIndexEntry(root, canonicalPath, hash);
    if (!ok) {
      const resultObj = { error: "upsert_failed", path: canonicalPath, code_fingerprint: hash };
      _cacheSet(cacheKey, resultObj);
      return { content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }] };
    }

    const refreshed_at = new Date().toISOString();
    const resultObj = {
      path: canonicalPath,
      code_fingerprint: hash,
      refreshed_at,
      status: "refreshed",
      findings_regrounded: findingsRegrounded,
      ...(reason !== undefined ? { reason } : {}),
    };
    _cacheSet(cacheKey, resultObj);
    // F10: caller identity + optional reason recorded in the gate log. session_id
    // identifies the agent/process; the tool name anchors the audit trail.
    appendGateLog(root, {
      timestamp: refreshed_at,
      tool: "meta_state_refresh_file_index",
      path: canonicalPath,
      code_fingerprint: hash,
      refreshed_at,
      findings_regrounded: findingsRegrounded,
      ...(reason !== undefined ? { reason } : {}),
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
    };
  },
};

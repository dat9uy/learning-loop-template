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
  readFileIndex,
} from "../../core/meta-state.js";
import { resolveSafePath, PathContainmentError } from "../../core/path-containment.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Plan 260711-0030 Phase 2: in-process 60s idempotency cache dropped (Finding 15
// — extends the cache removal to the sibling refresh-file-index tool). The cache
// masked silent-persistence-fail the same way as meta_state_log_change; hash
// caching in `computeFileHashCached` (tool-layer) remains because hashing is
// expensive but persistence is cheap and atomic.

export function _clearRefreshHashCacheForTests() {
  _clearHashCacheForTests();
}

export const metaStateRefreshFileIndexTool = {
  name: "meta_state_refresh_file_index",
  description:
    "Refresh the path-keyed fingerprint index for a cited path. One call upserts the path's current SHA-256 into file-index.jsonl, re-grounding ALL findings anchored to this path — the O(1)-per-file-change operator. " +
    "AMPLIFIED BLAST RADIUS: a single refresh accepts drift for every mechanism_check:true finding whose evidence_code_ref canonicalizes to this path. Caller identity (session_id/agent) is recorded in the gate log; pass `reason` to document why the change is legitimate. " +
    "Errors when the file is missing (code_missing) or the path escapes root. Returns { path, code_fingerprint, refreshed_at, status, findings_regrounded, reason? }. The response shape always sets cache_hit: false (the in-process dedupe cache was removed in Phase 2; a real file edit now always triggers an upsert). For drift detection, use meta_state_check_grounding.",
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
        return { content: [{ type: "text", text: JSON.stringify({
          error: "code_missing", path: canonicalPath, evidence_code_ref: pathResolve(root, canonicalPath), cache_hit: false,
        }) }] };
      }
      throw err;
    }

    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      return { content: [{ type: "text", text: JSON.stringify({
        error: "code_missing", path: canonicalPath, evidence_code_ref: absPath, cache_hit: false,
      }) }] };
    }

    const hash = await computeFileHashCached(absPath, stat);

    const entries = readRegistry(root);
    const findingsRegrounded = entries.filter(
      (e) => e.entry_kind === "finding" && e.mechanism_check === true
        && typeof e.evidence_code_ref === "string"
        && canonicalIndexKey(e.evidence_code_ref) === canonicalPath,
    ).length;

    // Detect the no-op BEFORE upsert: compare the computed hash against the
    // stored hash in file-index.jsonl. When they match, the upsert would be a
    // no-op (per upsertFileIndexEntry's true-no-op guard) — return status:
    // "no-op" so callers can distinguish a real refresh from a same-content
    // call. cache_hit stays false (the documented contract — the in-process
    // dedupe cache was removed in Phase 2; cache_hit semantics belong to the
    // computeFileHashCached layer, not the persistence layer).
    const existingIndex = readFileIndex(root);
    const storedHash = existingIndex.get(canonicalPath);
    const isNoOp = storedHash === hash;

    const ok = await upsertFileIndexEntry(root, canonicalPath, hash);
    if (!ok) {
      return { content: [{ type: "text", text: JSON.stringify({
        error: "upsert_failed", path: canonicalPath, code_fingerprint: hash, cache_hit: false,
      }) }] };
    }

    const refreshed_at = new Date().toISOString();
    const resultObj = {
      path: canonicalPath,
      code_fingerprint: hash,
      refreshed_at,
      status: isNoOp ? "no-op" : "refreshed",
      findings_regrounded: findingsRegrounded,
      cache_hit: false,
      ...(reason !== undefined ? { reason } : {}),
    };
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
      content: [{ type: "text", text: JSON.stringify(resultObj) }],
    };
  },
};

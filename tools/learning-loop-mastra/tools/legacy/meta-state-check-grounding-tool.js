import { z } from "zod";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { isAbsolute, join } from "node:path";
import { checkGrounding, computeFileHash } from "../../core/check-grounding.js";
import { readFileIndex, upsertFileIndexEntry, canonicalIndexKey } from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { runTest } from "#lib/run-test.js";
import { findEntryOrNotFound } from "#lib/find-entry.js";

/**
 * Tool-layer hash cache for computeFileHash. Keyed on
 * `${absPath}:${mtimeMs}:${size}` — the size component mirrors
 * core/read-registry-cache.js: some filesystems have coarse mtime granularity,
 * and the size check catches "same mtime, different content" in O(1) (red-team
 * F8). Omitting `size` creates a stale-hash window where a same-mtime rewrite
 * returns the old hash and masks drift. The pure computeFileHash stays unchanged;
 * caching is a tool-layer concern (Phase 2 of the file-index migration).
 */
const hashCache = new Map();

/**
 * Cached computeFileHash: returns the stored hash for an unchanged
 * (absPath, mtimeMs, size), else hashes the file, stores, and returns.
 * `stat` is a fs.stat result (or any object with mtimeMs + size) so callers
 * that already stat'd the file can avoid a second stat. The cache is
 * process-lifetime (mirrors testRunCache).
 */
export async function computeFileHashCached(absPath, stat) {
  const mtimeMs = stat.mtimeMs;
  const size = stat.size;
  const key = `${absPath}:${mtimeMs}:${size}`;
  if (hashCache.has(key)) return hashCache.get(key);
  const hash = computeFileHash(absPath);
  hashCache.set(key, hash);
  return hash;
}

/** Test-only: clear the hash cache between assertions. */
export function _clearHashCacheForTests() {
  hashCache.clear();
}

export const metaStateCheckGroundingTool = {
  name: "meta_state_check_grounding",
  description: "Check the grounding of a meta-state entry by computing its SHA-256 fingerprint and comparing to the stored value. Returns the locked shape: { id, raw_status, grounding { ... }, status, drift_kind, fingerprint_was_recorded }. On the first call, auto-records code_fingerprint when mechanism_check is true and the file exists. The agent decides what to do with drift; this tool does NOT auto-resolve entries.",
  schema: {
    id: z.string().min(1).describe("Entry id to check grounding for"),
    run_tests: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false)
      .describe("Opt-in: run the test runner for the entry's test file and populate grounding.test_passed. Default false (file-existence + hash check only)."),
  },
  handler: async ({ id, run_tests = false }) => {
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

    const { entry, notFoundResponse } = findEntryOrNotFound(root, id);
    if (notFoundResponse) return notFoundResponse;

    // Build codeContext. test_passed is computed only when run_tests is true
    // and the entry has an evidence_test field. fileIndex is the cached path-keyed
    // fingerprint sidecar — the authoritative grounding baseline (Phase 3 repoint);
    // loaded here (not inside the pure function) to keep checkGrounding pure.
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const fileIndex = readFileIndex(root);
    const codeContext = { root, run_tests, test_passed, fileIndex };
    const result = checkGrounding(entry, codeContext);

    // Auto-populate the path-keyed fingerprint index (Phase 5 repoint). The index
    // is the authoritative baseline; the per-record code_fingerprint is vestigial.
    // Fires when the index lacks the canonical key for this finding's cited path
    // and the check is grounded/unknown (not drifted). F3: the key is the canonical
    // (stripped relative) evidence_code_ref — NOT the absolute absPath.
    if (
      entry.mechanism_check === true &&
      result.grounding.code_ref_exists === true &&
      result.grounding.code_ref_hash !== null &&
      typeof entry.evidence_code_ref === "string" &&
      !fileIndex.has(canonicalIndexKey(entry.evidence_code_ref)) &&
      (result.status === "grounded" || result.status === "unknown")
    ) {
      const canonicalKey = canonicalIndexKey(entry.evidence_code_ref);
      const hash = result.grounding.code_ref_hash;
      let upsertOk = false;
      let upsertErr = null;
      try {
        upsertOk = await upsertFileIndexEntry(root, canonicalKey, hash);
      } catch (err) {
        upsertErr = err;
      }
      if (upsertOk) {
        result.fingerprint_was_recorded = true;
        // Reflect the authoritative baseline just written to the index.
        result.grounding.code_fingerprint = hash;
      } else {
        // F14 (post-Phase-6): the index write failed (disk full, rename threw,
        // or validation rejected the key). The per-record field is stripped, so
        // there is no bootstrap fallback — the finding stays grounded on
        // file-existence (hash_match: null) with no recorded baseline. Log
        // prominently so the operator can retry the index write; do NOT silently
        // mask the failure. (Pre-Phase-6 this had a dual-path fallback writing
        // entry.code_fingerprint; removed once the field was stripped.)
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_check_grounding",
          warning: "auto_populate_index_failed_no_fallback",
          canonical_key: canonicalKey,
          upsert_error: upsertErr?.message ?? null,
          id,
        });
      }
    }

    // Exactly one gate log line per call (per I-6)
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_check_grounding",
      id,
      run_tests,
      status: result.status,
      drift_kind: result.drift_kind,
      fingerprint_was_recorded: result.fingerprint_was_recorded,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

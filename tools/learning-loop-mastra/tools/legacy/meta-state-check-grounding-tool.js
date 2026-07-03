import { z } from "zod";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { checkGrounding, computeFileHash } from "../../core/check-grounding.js";
import { readRegistry, readFileIndex, upsertFileIndexEntry, canonicalIndexKey } from "../../core/meta-state.js";
import { runVerification } from "../../core/verification-runner.js";
import { resolveSafePath, PathContainmentError } from "../../core/path-containment.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Same pattern as SP1's `meta_state_derive_status` tool. */
// This runTest/testRunCache block is duplicated in meta-state-derive-status-tool.js;
// both legacy tools were touched in lockstep to add LIM-4 realpath containment.
// Dedup is low-value (legacy dynamically-loaded shims), so suppress the introduced
// clone group rather than extract a shared helper into throwaway code.
// fallow-ignore-next-line code-duplication
const testRunCache = new Map();

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

function runTest(root, testPath) {
  // LIM-4: realpath containment — rejects traversal/symlink/hardlink escape.
  // A missing test file inside root (ENOENT, resolvedPath === null) returns
  // null (skip running tests); an actual escape (resolvedPath set) propagates.
  // See core/path-containment.js. Invoked at moment of use per NF3.
  let fullPath;
  try {
    fullPath = resolveSafePath(root, testPath);
  } catch (err) {
    if (err instanceof PathContainmentError && err.reason === "outside_root" && err.resolvedPath === null) {
      return null;  // missing test file — skip running tests
    }
    throw err;
  }
  if (!existsSync(fullPath)) return null;
  const mtime = statSync(fullPath).mtimeMs;
  const key = `${fullPath}:${mtime}`;
  if (testRunCache.has(key)) return testRunCache.get(key);
  const result = runVerification(root, {
    cmd: "pnpm",
    args: ["test", "--", fullPath],
    cwd: root,
    timeout_ms: 30_000,
  });
  if (result.status === "passed") {
    testRunCache.set(key, true);
    return true;
  }
  if (result.status === "failed") {
    testRunCache.set(key, false);
    return false;
  }
  testRunCache.set(key, null);
  return null;
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

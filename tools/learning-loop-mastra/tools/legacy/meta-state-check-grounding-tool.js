import { z } from "zod";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { existsSync, statSync } from "node:fs";
import { checkGrounding } from "../../core/check-grounding.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { runVerification } from "../../core/verification-runner.js";
import { resolveInsideRoot, PathContainmentError } from "../../core/path-containment.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Same pattern as SP1's `meta_state_derive_status` tool. */
const testRunCache = new Map();

function runTest(root, testPath) {
  let fullPath;
  try {
    fullPath = resolveInsideRoot(testPath, root);
  } catch (err) {
    if (err instanceof PathContainmentError) {
      // Path escapes root — refuse to invoke the test runner.
      testRunCache.set(`${root}::${testPath}::denied`, null);
      return null;
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
    // and the entry has an evidence_test field.
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const codeContext = { root, run_tests, test_passed };
    const result = checkGrounding(entry, codeContext);

    // Auto-record (per D-1, intentional deviation from SP1's "verifier never mutates").
    // Only fires when:
    //   - mechanism_check === true (opt-in)
    //   - evidence_code_ref exists (top-level or legacy nested)
    //   - code_fingerprint is not set on the entry
    //   - the file exists and was successfully hashed
    //   - the caller's status is "grounded" or "unknown" (not "drifted")
    if (
      entry.mechanism_check === true &&
      result.grounding.code_ref_exists === true &&
      result.grounding.code_ref_hash !== null &&
      entry.code_fingerprint === undefined &&
      (result.status === "grounded" || result.status === "unknown")
    ) {
      const updateResult = await updateEntry(root, id, {
        code_fingerprint: result.grounding.code_ref_hash,
      });
      if (updateResult === true) {
        result.fingerprint_was_recorded = true;
        // Reflect the freshly-recorded fingerprint in the response so callers
        // see what was written (the pure function ran before the write).
        result.grounding.code_fingerprint = result.grounding.code_ref_hash;
      } else {
        // null (id not found, race) or "version_mismatch" (CAS) — log and continue
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_check_grounding",
          warning: "auto_record_failed",
          update_result: updateResult,
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

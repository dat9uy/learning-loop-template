import { z } from "zod";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { deriveStatus } from "#mcp/core/derive-status.js";
import { readRegistry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/** Per-process test-runner cache (keyed by absolute file path + mtime string).
 *  Cleared on process restart. mtime changes invalidate the cache.
 *  Per H-3 mitigation: cache stores the boolean result only. */
const testRunCache = new Map();

function runTest(root, testPath) {
  const fullPath = isAbsolute(testPath) ? testPath : join(root, testPath);
  if (!existsSync(fullPath)) return null;
  const mtime = statSync(fullPath).mtimeMs;
  const key = `${fullPath}:${mtime}`;
  if (testRunCache.has(key)) return testRunCache.get(key);
  try {
    const result = spawnSync("pnpm", ["test", "--", fullPath], {
      cwd: root,
      timeout: 30_000,
      encoding: "utf8",
    });
    const passed = result.status === 0;
    testRunCache.set(key, passed);
    return passed;
  } catch {
    testRunCache.set(key, null);
    return null;
  }
}

export const metaStateDeriveStatusTool = {
  name: "meta_state_derive_status",
  description: "Derive the effective status of a meta-state entry by reading its stored references + the current filesystem state. Returns the locked shape: { id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }. The agent decides what to do with the answer; this tool does NOT mutate entries. Use when you need to ask \"is this finding still true?\" before resolving it. Not for recording a new finding (use `meta_state_report` instead) or for closing one (use `meta_state_resolve` instead).",
  schema: {
    id: z.string().min(1).describe("Entry id to derive status for"),
    run_tests: z.boolean().optional().default(false)
      .describe("Opt-in: run the test runner for the entry's test file and populate signals.test_passed. Default false (file-existence check only)."),
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
    // and the entry has an evidence_test field (per the H-4 mitigation: the
    // function does not auto-derive a test file path from the code_ref).
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const codeContext = { root, run_tests, test_passed };
    const result = deriveStatus(entry, codeContext);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_derive_status",
      id,
      run_tests,
      derived_status: result.derived_status,
      drift: result.drift,
      recommendation: result.recommendation,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

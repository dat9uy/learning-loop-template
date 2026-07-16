import { z } from "zod";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { isAbsolute, join } from "node:path";
import { deriveStatus } from "../../core/derive-status.js";
import { buildDriftSignals } from "../../core/stale-view.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { runTest } from "#lib/run-test.js";
import { findEntryOrNotFound } from "#lib/find-entry.js";

export const metaStateDeriveStatusTool = {
  name: "meta_state_derive_status",
  description: "Derive the effective status of a meta-state entry by reading its stored references + the current filesystem state. Returns the locked shape: { id, raw_status, derived_status, derivation { kind, signals, checked_at, duration_ms }, drift, recommendation }. The agent decides what to do with the answer; this tool does NOT mutate entries. Use when you need to ask \"is this finding still true?\" before resolving it. Not for recording a new finding (use `meta_state_report` instead) or for closing one (use `meta_state_resolve` instead).",
  schema: {
    id: z.string().min(1).describe("Entry id to derive status for"),
    run_tests: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false)
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

    const { entry, notFoundResponse } = findEntryOrNotFound(root, id);
    if (notFoundResponse) return notFoundResponse;

    // Build codeContext. test_passed is computed only when run_tests is true
    // and the entry has an evidence_test field (per the H-4 mitigation: the
    // function does not auto-derive a test file path from the code_ref).
    const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
    let test_passed = null;
    if (run_tests && testPath !== null) {
      test_passed = runTest(root, testPath);
    }

    const { fileIndex, codeHashes } = buildDriftSignals([entry], root, {
      toolName: "meta_state_derive_status",
    });

    const codeContext = { root, run_tests, test_passed, fileIndex, codeHashes };
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

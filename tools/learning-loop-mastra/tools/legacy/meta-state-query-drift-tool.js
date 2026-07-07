import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { readRegistry, filterEntries, readFileIndex } from "../../core/meta-state.js";
import { queryDrift } from "../../core/query-drift.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { appendGateLog } from "#lib/gate-logging.js";

/**
 * SP3 Drift Query — joins SP1's deriveStatus + SP2's checkGrounding
 * across the registry. Mirrors meta_state_derive_status (read-only;
 * the agent decides what to do with the result).
 *
 * Per Finding 5: try/catch around resolveRoot mirrors SP1/SP2's pattern.
 * Per Finding 6: filter?.status directly (no `|| null` indirection).
 */
export const metaStateQueryDriftTool = {
  name: "meta_state_query_drift",
  description: "Aggregate drift events across the meta-state registry. Joins SP1's deriveStatus + SP2's checkGrounding. Read-only: the agent decides what to do with the result.",
  schema: {
    filter: z.preprocess(stripEnvelope, z.object({
      // Plan 260707-0812 Phase 2: input enum accepts `open` (the canonical
      // post-collapse status) and the legacy open-equivalent set; the filter
      // is mapped via isOpen in the registry reader so consumers see a
      // consistent set pre- and post-migration.
      status: z.enum(["open", "active", "reported", "stale"]).optional()
        .describe("Optional filter: only return entries with this status, mapped via isOpen"),
    })).optional()
      .describe("Optional filter on the registry before computing drift"),
    run_grounding: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional().default(false)
      .describe("Opt-in: also run SP2's checkGrounding for each entry. Default false (derivation-only)."),
  },
  handler: async ({ filter, run_grounding = false }) => {
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

    const registry = readRegistry(root);
    const nonTerminal = filterEntries(registry, { status: filter?.status });

    // fileIndex: the cached path-keyed fingerprint sidecar — the authoritative
    // grounding baseline (Phase 3 repoint). Loaded here so queryDrift's
    // checkGrounding call exercises the index path, not the stale per-record
    // fallback (red-team F5: without this, every edited file reports false drift).
    const fileIndex = readFileIndex(root);
    const codeContext = {
      root,
      run_grounding,
      run_tests: false,
      test_passed: null,
      fileIndex,
      now: () => Date.now(),
    };

    const result = queryDrift(nonTerminal, codeContext);

    appendGateLog(root, {
      event: "meta_state_query_drift",
      filter,
      run_grounding,
      drift_count: result.drift_count,
    });

    return result;
  },
};

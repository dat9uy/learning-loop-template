import { z } from "zod";
import { readRegistry, filterEntries } from "#mcp/core/meta-state.js";
import { queryDrift } from "#mcp/core/query-drift.js";
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
    filter: z.object({
      status: z.enum(["active", "reported"]).optional()
        .describe("Optional filter: only return entries with this status"),
    }).optional()
      .describe("Optional filter on the registry before computing drift"),
    run_grounding: z.boolean().optional().default(false)
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

    const codeContext = {
      root,
      run_grounding,
      run_tests: false,
      test_passed: null,
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

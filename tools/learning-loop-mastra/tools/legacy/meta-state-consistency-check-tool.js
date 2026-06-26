// meta-state-consistency-check-tool.js — Read-only MCP probe for status/audit-field drift.
//
// Implements finding meta-260614T1236Z (no automated registry consistency
// check exists). Mirrors the SP3 probe pattern at
// meta-state-query-drift-tool.js:17-64: no inputs, calls resolveRoot +
// readRegistry, returns the core's output, appends one gate-log line
// per invocation.
//
// Read-only: the agent decides what to do with the result.

import { readRegistry } from "../../core/meta-state.js";
import { consistencyCheck } from "../../core/consistency-check.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { appendGateLog } from "#lib/gate-logging.js";

export const metaStateConsistencyCheckTool = {
  name: "meta_state_consistency_check",
  description: "Detect drift between entry `status` and audit fields. Implements the remediation from finding meta-260614T1236Z. Read-only: the agent decides what to do with the result.",
  // Probe — no inputs. Empty schema accepted by the MCP server; matches the
  // SP3 read-only pattern at meta-state-query-drift-tool.js:20-28.
  schema: {},
  handler: async () => {
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
    const result = consistencyCheck(registry);

    appendGateLog(root, {
      event: "meta_state_consistency_check",
      drift_count: result.drift_count,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
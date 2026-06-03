import {
  writeEntry,
  generateId,
  metaStateFindingEntrySchema,
} from "#mcp/core/meta-state.js";
import { slugify } from "#mcp/core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateReportTool = {
  name: "meta_state_report",
  description: "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator.",
  schema: metaStateFindingEntrySchema.shape,
  handler: async ({
    category,
    subtype,
    severity,
    affected_system,
    description,
    evidence_journal,
    evidence_code_ref,
    evidence_test,
    mechanism_check,
  }) => {
    const root = resolveRoot();
    const id = generateId(slugify(description));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const entry = {
      id,
      entry_kind: "finding",
      category,
      ...(subtype && { subtype }),
      severity,
      affected_system,
      description,
      // Top-level evidence fields (per schema; consumed by SP1 derive-status + SP2 check-grounding)
      ...(evidence_code_ref && { evidence_code_ref }),
      ...(evidence_test && { evidence_test }),
      // Nested evidence block (legacy form; the 8 of 18 pre-SP1 findings use this)
      evidence: {
        ...(evidence_journal && { journal: evidence_journal }),
        ...(evidence_code_ref && { code_ref: evidence_code_ref }),
        ...(evidence_test && { test: evidence_test }),
      },
      ...(mechanism_check !== undefined && { mechanism_check }),
      status: "reported",
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      acked_at: null,
      resolved_at: null,
      resolved_by: null,
    };

    await writeEntry(root, entry);

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_report",
      id,
      category,
      severity,
      affected_system,
    });

    const result = {
      reported: true,
      id,
      status: "reported",
      expires_at: expiresAt.toISOString(),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

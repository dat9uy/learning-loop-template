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
  description: "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator. Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`. Use when you observe a loop issue (gate bug, missing tool, anti-pattern) that needs operator review. Not for system changes (use `meta_state_log_change` instead) or for closing a finding (use `meta_state_resolve` instead).",
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
    session_id,
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
      ...(evidence_journal && { evidence_journal }),
      ...(evidence_test && { evidence_test }),
      ...(mechanism_check !== undefined && { mechanism_check }),
      // session_id is the idempotency key for hook-emitted findings. The schema
      // and the prior hook (`.factory/hooks/loop-surface-inject.cjs`,
      // `cold-session-discoverability.test.cjs`) all assume the tool persists
      // this; honor it here so callers can use the canonical MCP surface.
      ...(session_id && { session_id }),
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

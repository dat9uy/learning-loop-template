import {
  writeEntry,
  generateId,
  metaStateFindingEntrySchema,
} from "../../core/meta-state.js";
import { slugify } from "../../core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateReportTool = {
  name: "meta_state_report",
  description: "Report a new meta-state finding to the agent-maintained registry. Status starts as reported with a 24h TTL until acked by an operator. Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`. Use when you observe a loop issue (gate bug, missing tool, anti-pattern) that needs operator review. Not for system changes (use `meta_state_log_change` instead) or for closing a finding (use `meta_state_resolve` instead). When `evidence_code_ref` is provided, `mechanism_check` defaults to `true`; pass `mechanism_check: false` explicitly to opt out (a warning is returned). To re-surface a stale finding from the same finding (the cross-reference affordance), pass `reopens: ['<old_stale_id>']`. The legacy 'expired' status was removed in plan 260611-1000; only 'stale' parents are cascade-closeable. Run `meta_state_relationship_validate({ description, entry_id? })` first to lint orphan ids.",
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
    reopens,
  }) => {
    const root = resolveRoot();
    const id = generateId(slugify(description));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Auto-default: if caller provides evidence_code_ref, opt them into
    // mechanism_check unless they explicitly opted out.
    // ?? (not ||) preserves an explicit mechanism_check: false.
    const effective_mechanism_check = mechanism_check ?? Boolean(evidence_code_ref);

    // Build warnings based on caller intent vs. tool default.
    const warnings = [];
    if (evidence_code_ref && mechanism_check === false) {
      warnings.push({
        code: "evidence_without_mechanism_check",
        message:
          "evidence_code_ref is set but mechanism_check is false; the fingerprint will not be tracked. " +
          "Pass mechanism_check: true to opt in to grounding checks; the path-keyed fingerprint index is refreshed via meta_state_refresh_file_index.",
        suggestion: "Remove mechanism_check or set it to true to opt in to grounding checks.",
      });
    }

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
      // Store explicit `false` so the opt-out is preserved in the registry.
      // Store `true` when auto-defaulted or explicitly passed.
      // Omit the field entirely when neither is provided.
      ...(mechanism_check === false
        ? { mechanism_check: false }
        : effective_mechanism_check === true
          ? { mechanism_check: true }
          : {}),
      // session_id is the idempotency key for hook-emitted findings. The schema
      // and the prior hook (`.factory/hooks/loop-surface-inject.cjs`,
      // `cold-session-discoverability.test.cjs`) all assume the tool persists
      // this; honor it here so callers can use the canonical MCP surface.
      ...(session_id && { session_id }),
      ...(reopens && { reopens }),
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
      ...(warnings.length > 0 && { warnings }),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

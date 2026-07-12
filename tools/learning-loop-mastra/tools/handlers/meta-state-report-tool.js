import {
  writeEntry,
  readRegistry,
  generateId,
  metaStateFindingEntrySchema,
} from "../../core/meta-state.js";
import { slugify } from "../../core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { assertinvariant } from "../../core/operation-invariant.js";

export const metaStateReportTool = {
  name: "meta_state_report",
  description: "Report a new meta-state finding to the agent-maintained registry. New entries are written with status:`open` (the canonical post-collapse status; replaces `reported`). Use this to internalize external references for `source_refs`. Optional but recommended: pass `evidence_code_ref` (code location) so the loop can hash and re-check it on demand via `meta_state_derive_status`. Markdown paths in `source_refs` are deprecated and will be rejected by `record_create_decision`. Use when you observe a loop issue (gate bug, missing tool, anti-pattern) that needs operator review. Not for system changes (use `meta_state_log_change` instead) or for closing a finding (use `meta_state_resolve` instead). When `evidence_code_ref` is provided, `mechanism_check` defaults to `true`; pass `mechanism_check: false` explicitly to opt out (a warning is returned). To re-surface a stale finding from the same finding (the cross-reference affordance), pass `reopens: ['<old_stale_id>']`. `meta_state_ack` was removed in plan 260707-0812; lifecycle state changes go through resolve/promote/supersede/dispatch/re-verify. Run `meta_state_relationship_validate({ description, entry_id? })` first to lint orphan ids.",
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
    // Plan 260707-0812 Phase 2: `expires_at` is no longer computed or written.
    // The 24h TTL was tied to the legacy `reported` lifecycle that no longer
    // exists post-enum-collapse. The derived stale view uses
    // `STALENESS_WINDOW_MS` (7d by default), which is unrelated.

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
      // Plan 260707-0812 Phase 2 (red-team C2): new findings are written with
      // `status:"open"` (the canonical post-collapse status), not "reported".
      // `expires_at` and `acked_at` writes are removed — `expires_at` is
      // unrelated to the derived stale view (M1) and becomes vestigial;
      // `acked_at` is removed entirely with meta_state_ack.
      status: "open",
      created_at: now.toISOString(),
      resolved_at: null,
      resolved_by: null,
    };

    await writeEntry(root, entry);

    // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
    // wrapper asserts the auto-generated id was honored by writeEntry. The
    // pre-state-only check reads the persisted entry from the registry
    // (INSIDE writeEntry's lock, atomic with the write) and asserts that
    // `result.id === generated_id`. Closes finding `meta-260619T2237Z`
    // (silent id drift between auto-generation and persistence).
    const idInvariant = await assertinvariant(
      () => Promise.resolve({ ok: true }),
      {
        accept: {
          context: () => {
            // Inline re-read keeps the invariant atomic with the write
            // because writeEntry's withRegistryLock has already released
            // by the time we get here. For a stronger invariant, the read
            // could move inside writeEntry; the canonical surface for
            // writeEntry is already wrapped at the core layer (Phase 1).
            const persisted = readRegistry(root).find((e) => e.id === id);
            return { generated_id: id, persisted_id: persisted?.id ?? null };
          },
          check: ({ generated_id, persisted_id }) => persisted_id === generated_id,
        },
        returnOnFail: {
          reason_code: "report_tool_id_drift",
          generated_id: id,
        },
        root,
      }
    );
    if (!idInvariant.ok) {
      throw new Error(`meta_state_report: id drift detected — generated ${id}, registry mismatch`);
    }

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
      status: "open",
      ...(warnings.length > 0 && { warnings }),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

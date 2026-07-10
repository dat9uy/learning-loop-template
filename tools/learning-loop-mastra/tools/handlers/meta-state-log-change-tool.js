import { writeEntry, generateId, metaStateChangeEntrySchema } from "../../core/meta-state.js";
import { slugify } from "../../core/slugify.js";
import { assertWriteVisible, WriteNotVisibleError } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Plan 260711-0030 Phase 2: in-process idempotency cache dropped.
// The previous 60s Map at this module masked silent-persistence-fail by
// returning {logged: true, cache_hit: true} when the underlying writeEntry
// silently dropped the entry. With Phase 1's cross-process file lock, the
// underlying write is safe; idempotency now belongs to the durable registry
// (the freshly-generated `id` differs for each call because `created_at`
// advances within the millisecond). Replay protection, if needed, lives in
// `meta_state_list({id: ...})`, not in a per-process Map.

const MIGRATED_FIELDS = {
  change_dimension: true,
  change_target: true,
  change_diff: true,
  reason: true,
  applies_to: true,
  supersedes: true,
  consolidates: true,
  evidence_code_ref: true,
  evidence_journal: true,
};

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  description: "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest) as a change-log entry in the meta-state registry. The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry. Use when you ship a meaningful code or rule change that should appear in the durable audit log. Not for operator-observed issues (use `meta_state_report` instead) or for closing a finding (use `meta_state_resolve` instead). For verify-after-write, call `meta_state_list({id: ...})` to confirm the entry landed — there is no in-process cache that masks persistence failures.",
  schema: metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).shape,
  handler: async ({
    change_dimension,
    change_target,
    change_diff,
    reason,
    applies_to,
    supersedes,
    consolidates,
    evidence_code_ref,
    evidence_journal,
  }) => {
    const root = resolveRoot();

    const id = generateId(slugify(change_target));
    const now = new Date();

    const entry = {
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      change_diff,
      reason,
      ...(applies_to && { applies_to }),
      ...(supersedes && { supersedes }),
      ...(consolidates && { consolidates }),
      ...(evidence_code_ref && { evidence_code_ref }),
      ...(evidence_journal && { evidence_journal }),
      status: "active",
      created_at: now.toISOString(),
      version: 0,
    };

    await writeEntry(root, entry);

    // Plan 260711-0030 Phase 3: post-write visibility re-read. Closes T4
    // (silent-persistence-fail class). If the entry is not visible after
    // writeEntry returns, return a structured failure rather than claiming
    // {logged: true}.
    try {
      await assertWriteVisible(root, id, "meta_state_log_change");
    } catch (err) {
      if (err instanceof WriteNotVisibleError) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              logged: false,
              ok: false,
              reason: "write_not_visible",
              id,
            }),
          }],
        };
      }
      throw err;
    }

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_log_change",
      id,
      change_dimension,
      change_target,
    });

    const result = {
      logged: true,
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      created_at: now.toISOString(),
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  },
};
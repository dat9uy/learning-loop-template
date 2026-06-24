import { writeEntry, generateId, metaStateChangeEntrySchema } from "../../core/meta-state.js";
import { slugify } from "../../core/slugify.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Idempotency cache: same (change_dimension, change_target, reason) within 60s
// returns the cached response without writing a duplicate entry.
// In-process Map; cleared on MCP server restart.
const _idempotencyCache = new Map();
const CACHE_TTL_MS = 60_000;

function _cacheKey(root, changeDimension, changeTarget, reason) {
  return `${root}::${changeDimension}::${changeTarget}::${reason}`;
}

function _cacheGet(key) {
  const entry = _idempotencyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.stored_at > CACHE_TTL_MS) {
    _idempotencyCache.delete(key);
    return null;
  }
  return entry;
}

function _cacheSet(key, result) {
  _idempotencyCache.set(key, { result, stored_at: Date.now() });
}

// Test-only exports. Production code must not call these.
export function _clearIdempotencyCacheForTests() {
  _idempotencyCache.clear();
}

export function _backdateIdempotencyCacheForTests(key, ageMs) {
  const entry = _idempotencyCache.get(key);
  if (entry) entry.stored_at = Date.now() - ageMs;
}

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
  description: "Log a system change (schema, rule, tool, policy, surface, lifecycle, manifest) as a change-log entry in the meta-state registry. The entry is immutable, status=active, no TTL. Use supersedes to replace a prior change entry. Use when you ship a meaningful code or rule change that should appear in the durable audit log. Not for operator-observed issues (use `meta_state_report` instead) or for closing a finding (use `meta_state_resolve` instead). Returns the same response within 60s for identical (change_dimension, change_target, reason) calls; look for cache_hit: true in the response.",
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

    // Idempotency check: identical (change_dimension, change_target, reason) within 60s
    // returns the cached response without writing a duplicate entry.
    const cacheKey = _cacheKey(root, change_dimension, change_target, reason);
    const cached = _cacheGet(cacheKey);
    if (cached) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ ...cached.result, cache_hit: true }),
        }],
      };
    }

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
    _cacheSet(cacheKey, result);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ...result, cache_hit: false }),
      }],
    };
  },
};

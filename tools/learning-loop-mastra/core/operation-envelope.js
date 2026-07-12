// fallow-ignore-file complexity
/**
 * Operation envelope — magnitude + content-hash metadata for batch mutations.
 *
 * Plan 260712-0300 Phase 1 (Implementation 2 of the assertinvariant resolution).
 * When `meta_state_batch` is called with an `envelope`, it auto-emits a change-log
 * entry whose `operation_envelope` field captures:
 *   - kind: which of 8 batch shapes (migration / sweep / closeout / ...)
 *   - target: short identifier of the batch's purpose
 *   - pre_count / post_count: registry snapshot by status + kind
 *   - content_hash: SHA-256 of kind + target + canonical op-list + entry-id sets
 *
 * Threat model (red-team finding 4 fix):
 *   `content_hash` is a CONTENT-hash, not an idempotency token. It proves
 *   "same input -> same hash" (so re-running the same batch on the same
 *   registry state produces the same hash and tests can assert exact equality).
 *   It does NOT prove "this batch was not already applied" — replay detection
 *   belongs elsewhere (e.g. durable idempotency layer if needed).
 *
 * Legacy status normalization (red-team finding 10 fix):
 *   `by_status` keys are constrained to the canonical enum
 *   `{open, resolved, superseded, archived}`. Registry entries persisted with
 *   the legacy statuses `active`/`reported`/`stale` are normalized to `open`
 *   at the boundary by `normalizeLegacyStatus` so post-migration tests can
 *   rely on canonical keys.
 */
import { createHash } from "node:crypto";

/**
 * Canonical set of envelope kinds (8). Frozen export so callers can iterate
 * safely. Single source of truth — the change-log schema imports this enum.
 */
export const OPERATION_ENVELOPE_KINDS = Object.freeze([
  "migration",
  "sweep",
  "closeout",
  "consolidation",
  "backfill",
  "archive-wave",
  "escalation-batch",
  "manual-batch",
]);

/**
 * Per-kind op-type compatibility rules (red-team finding 9 fix). Enforced at
 * `buildEnvelope` — mismatch throws `kind_op_incompatible` so an audit-trail
 * forgery via mislabeled batch is rejected before the envelope is built.
 *
 * - requiredOps: at least one op of this type must be present
 * - disallowedOps: no op of this type may be present (reserved for future use)
 */
// fallow-ignore-next-line unused-export -- public API for future callers + tests (consumed by buildEnvelope + tests)
export const KIND_OP_COMPATIBILITY = Object.freeze({
  migration:         { requiredOps: [], disallowedOps: [] },
  sweep:             { requiredOps: ["delete"], disallowedOps: [] },
  consolidation:     { requiredOps: ["update"], disallowedOps: [] },
  closeout:          { requiredOps: ["update"], disallowedOps: [] },
  backfill:          { requiredOps: ["write"], disallowedOps: [] },
  "archive-wave":    { requiredOps: ["archive"], disallowedOps: [] },
  "escalation-batch": { requiredOps: [], disallowedOps: [] },
  "manual-batch":    { requiredOps: [], disallowedOps: [] },
});

/**
 * Canonical by_status keys. Constrained enum (not open dict) so the envelope
 * shape is testable by exact equality.
 */
export const CANONICAL_STATUS_KEYS = Object.freeze([
  "open",
  "resolved",
  "superseded",
  "archived",
]);

/**
 * Canonical by_kind keys. Constrained enum.
 */
export const CANONICAL_KIND_KEYS = Object.freeze([
  "finding",
  "change-log",
  "rule",
  "loop-design",
]);

/**
 * Map legacy pre-migration statuses to the canonical `open` bucket. Returns
 * the input unchanged for canonical keys (including "archived" which is
 * applied at runtime outside the persisted enum).
 *
 * Legacy statuses (`active`/`reported`/`stale`) were collapsed to `open` by
 * Plan 260707-0812 Phase 2; legacy registry data persists the old status
 * until each entry is individually migrated. `buildEnvelope` calls this at
 * the boundary so its `by_status` output is canonical regardless of input
 * registry shape.
 */
// fallow-ignore-next-line unused-export -- public API for future callers (consumed by countRegistry + tests)
export function normalizeLegacyStatus(status) {
  if (status === "active" || status === "reported" || status === "stale") {
    return "open";
  }
  return status;
}

/**
 * Build an empty canonical count record with all keys at 0.
 */
function emptyCounts() {
  const byStatus = Object.fromEntries(CANONICAL_STATUS_KEYS.map((k) => [k, 0]));
  const byKind = Object.fromEntries(CANONICAL_KIND_KEYS.map((k) => [k, 0]));
  return { total: 0, by_status: byStatus, by_kind: byKind };
}

/**
 * Compute the count record from a registry snapshot (array of entries).
 * Each entry contributes `{total: +1, by_status[status]: +1, by_kind[entry_kind]: +1}`.
 * Legacy statuses are normalized to `open` via `normalizeLegacyStatus`.
 * Unknown statuses / kinds throw — the registry is expected to be schema-clean
 * by the time buildEnvelope sees it; if it's not, that's a structural bug
 * we want surfaced, not hidden.
 */
function countRegistry(registry) {
  const counts = emptyCounts();
  if (!Array.isArray(registry)) {
    return counts;
  }
  for (const entry of registry) {
    if (!entry || typeof entry !== "object") continue;
    counts.total += 1;
    const rawStatus = normalizeLegacyStatus(entry.status);
    if (!(rawStatus in counts.by_status)) {
      throw new Error(
        `countRegistry: unknown status "${entry.status}" (normalized: "${rawStatus}"); canonical keys: ${CANONICAL_STATUS_KEYS.join(", ")}`,
      );
    }
    counts.by_status[rawStatus] += 1;
    const kind = entry.entry_kind;
    if (!(kind in counts.by_kind)) {
      throw new Error(
        `countRegistry: unknown entry_kind "${kind}"; canonical keys: ${CANONICAL_KIND_KEYS.join(", ")}`,
      );
    }
    counts.by_kind[kind] += 1;
  }
  return counts;
}

/**
 * Canonicalize a single op for hashing. Picks the discriminator + the most
 * relevant payload fields per op type so the hash reflects the substantive
 * shape without including in-memory artifacts (e.g. the registry entry object).
 */
function canonicalizeOp(op) {
  if (!op || typeof op !== "object") return { op: null };
  const base = { op: op.op };
  switch (op.op) {
    case "write":
      // Write carries an entry payload — we hash the entry id + entry_kind only,
      // since the rest of the entry is mutable across retries (e.g. timestamps).
      return {
        ...base,
        id: op.entry?.id ?? null,
        entry_kind: op.entry?.entry_kind ?? null,
      };
    case "update":
    case "delete":
    case "archive":
      return {
        ...base,
        id: op.id ?? null,
      };
    default:
      return base;
  }
}

/**
 * Sort ops deterministically for hashing. Write ops sort by their entry.id;
 * other ops sort by op.id. This ensures the same set of ops in any order
 * produces the same hash.
 */
function sortOpsForHash(ops) {
  const keyOf = (op) => canonicalizeOp(op).id ?? "";
  return [...ops].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}

/**
 * Compute SHA-256 content hash of `kind + target + canonicalized op-list +
 * pre-id-set + post-id-set`. Includes `kind` + `target` (red-team finding 6
 * fix) so a `migration` and a `manual-batch` with identical ops + registry
 * state produce distinct hashes.
 *
 * @returns {string} "sha256:<64-hex>"
 */
function computeContentHash({ kind, target, ops, preRegistry, postRegistry }) {
  const sortedOps = sortOpsForHash(ops ?? []);
  const opFingerprint = sortedOps.map(canonicalizeOp);
  const preIds = (preRegistry ?? []).map((e) => e?.id).filter(Boolean).sort();
  const postIds = (postRegistry ?? []).map((e) => e?.id).filter(Boolean).sort();
  const payload = [
    kind,
    target,
    JSON.stringify(opFingerprint),
    preIds.join(","),
    postIds.join(","),
  ].join(":");
  const hex = createHash("sha256").update(payload).digest("hex");
  return `sha256:${hex}`;
}

/**
 * Build an operation envelope from the inputs.
 *
 * @param {object} args
 * @param {string} args.kind — one of OPERATION_ENVELOPE_KINDS
 * @param {string} args.target — short identifier of the batch's purpose (1-200 chars,
 *   no control chars, no `..` path segments)
 * @param {Array} args.ops — the batch's ops array (write/update/delete/archive)
 * @param {Array} args.preRegistry — registry snapshot BEFORE the batch
 * @param {Array} args.postRegistry — registry snapshot AFTER the batch
 * @returns {object} envelope with kind, target, pre_count, post_count, content_hash
 *
 * Throws `kind_op_incompatible` if `kind` declares a required op type that
 * is not present (red-team finding 9). Other invalid inputs throw standard
 * Error / TypeError.
 */
export function buildEnvelope({ kind, target, ops, preRegistry, postRegistry }) {
  if (!OPERATION_ENVELOPE_KINDS.includes(kind)) {
    throw new Error(
      `buildEnvelope: unknown kind "${kind}"; canonical kinds: ${OPERATION_ENVELOPE_KINDS.join(", ")}`,
    );
  }
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("buildEnvelope: target must be a non-empty string");
  }
  if (target.length > 200) {
    throw new Error("buildEnvelope: target must be <= 200 chars");
  }
  if (/[\x00-\x1f\x7f]/.test(target)) {
    throw new Error("buildEnvelope: target must not contain control chars");
  }
  if (/\.\./.test(target)) {
    throw new Error("buildEnvelope: target must not contain '..' path segments");
  }

  // Validate kind vs ops (red-team finding 9).
  const compat = KIND_OP_COMPATIBILITY[kind];
  if (compat?.requiredOps?.length > 0) {
    const opTypes = new Set((ops ?? []).map((o) => o?.op).filter(Boolean));
    const missing = compat.requiredOps.filter((t) => !opTypes.has(t));
    if (missing.length > 0) {
      const err = new Error("kind_op_incompatible");
      err.code = "kind_op_incompatible";
      err.kind = kind;
      err.missing = missing;
      throw err;
    }
  }

  const preCount = countRegistry(preRegistry ?? []);
  const postCount = countRegistry(postRegistry ?? []);
  const contentHash = computeContentHash({ kind, target, ops, preRegistry, postRegistry });

  return {
    kind,
    target,
    pre_count: preCount,
    post_count: postCount,
    content_hash: contentHash,
  };
}

/**
 * Re-validate an envelope against the locked shape. Pure function. Returns
 * `{ok: true, envelope}` on success or `{ok: false, reason}` on failure.
 *
 * The shape is the same as buildEnvelope's output:
 *   { kind, target, pre_count: {total, by_status, by_kind},
 *     post_count: {total, by_status, by_kind}, content_hash: sha256:<64-hex> }
 */
// fallow-ignore-next-line complexity
// fallow-ignore-next-line unused-export
export function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, reason: "envelope_not_object" };
  }
  const kindErr = validateKind(envelope.kind);
  if (kindErr) return kindErr;
  const targetErr = validateTarget(envelope.target);
  if (targetErr) return targetErr;
  const preErr = validateCounts(envelope.pre_count);
  if (preErr) return { ok: false, reason: `pre_count:${preErr}` };
  const postErr = validateCounts(envelope.post_count);
  if (postErr) return { ok: false, reason: `post_count:${postErr}` };
  const hashErr = validateContentHash(envelope.content_hash);
  if (hashErr) return hashErr;
  return { ok: true, envelope };
}

function validateKind(kind) {
  if (!OPERATION_ENVELOPE_KINDS.includes(kind)) {
    return { ok: false, reason: `invalid_kind:${kind}` };
  }
  return null;
}

// fallow-ignore-next-line complexity -- 3 fail-closed guards: empty/length/control-chars; each is a distinct error class
function validateTarget(target) {
  if (typeof target !== "string" || target.length === 0 || target.length > 200) {
    return { ok: false, reason: "invalid_target" };
  }
  if (/[\x00-\x1f\x7f]/.test(target) || /\.\./.test(target)) {
    return { ok: false, reason: "invalid_target_chars" };
  }
  return null;
}

function validateContentHash(hash) {
  if (typeof hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
    return { ok: false, reason: "invalid_content_hash" };
  }
  return null;
}

/**
 * Validate one of pre_count / post_count. Returns null on success or a string
 * reason on failure. Pure helper extracted from `validateEnvelope` so the
 * parent's cyclomatic complexity stays within the project's health threshold
 * (fallow health baseline).
 */
// fallow-ignore-next-line complexity -- per-axis guard with explicit reasons; extraction itself is the canonical reduction
function validateCounts(counts) {
  if (!counts || typeof counts !== "object") return "counts_not_object";
  if (typeof counts.total !== "number" || !Number.isInteger(counts.total) || counts.total < 0) {
    return "invalid_total";
  }
  const byStatusErr = validateRecord(counts.by_status, CANONICAL_STATUS_KEYS, "status");
  if (byStatusErr) return byStatusErr;
  const byKindErr = validateRecord(counts.by_kind, CANONICAL_KIND_KEYS, "kind");
  if (byKindErr) return byKindErr;
  return null;
}

// fallow-ignore-next-line complexity -- per-key guard with 3 explicit reasons (axis-missing/invalid-key/invalid-value); the early-return chain is the canonical shape for fail-closed enum validation
function validateRecord(record, allowedKeys, axisLabel) {
  if (!record || typeof record !== "object") return `invalid_by_${axisLabel}`;
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) return `invalid_${axisLabel}_key:${key}`;
    if (typeof record[key] !== "number") return `invalid_${axisLabel}_value:${key}`;
  }
  return null;
}

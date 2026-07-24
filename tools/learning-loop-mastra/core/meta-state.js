// fallow-ignore-file complexity — registry CRUD with Zod, CAS, TTL
import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync, unlinkSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { z } from "zod";
import { deepStripEnvelope } from "./envelope-stripper.js";
import { readRegistryWithCache, invalidateCache } from "./read-registry-cache.js";
// Registry-write helpers (persistRegistryAtomic + appendRegistryEntryAtomic)
// are inlined here as private functions after the previous-commit extraction
// to a separate facade hit two fallow `new-only` findings: (a) the new file
// was flagged as not-imported by another module, (b) the `REGISTRY_FILENAME`
// export was flagged as unused. Keeping the helpers in the same module as
// their only callers (this file) means fallow sees the call-graph edge
// implicitly (same-file symbol references), and the path constant stays a
// private module-level binding rather than a cross-module export.
import { withRegistryLock } from "./registry-lock.js";
// Plan 260712-0300 Phase 1: operation_envelope field on change-log entries
// (Implementation 2 of the assertinvariant resolution). The helper owns the
// kind enum + content-hash construction; the schema imports the enum so there
// is one source of truth.
import {
  OPERATION_ENVELOPE_KINDS,
  CANONICAL_STATUS_KEYS,
  CANONICAL_KIND_KEYS,
  buildEnvelope,
} from "./operation-envelope.js";
// Plan 260712-0300 Phase 2: single source of truth for BATCH_SIZE_LIMIT
// (closes the 500-vs-100 default divergence between handler and core).
import { BATCH_SIZE_LIMIT } from "./constants.js";
// Plan 260711-0030 Phase 4: schema-version-skew detection. isSchemaBranchSupported
// reads the per-worktree .loop-version file and rejects writes whose entry_kind
// is not in the worktree's schema_branches list. Future per-kind field-shape
// drift detection lands in a follow-up plan.
import { isSchemaBranchSupported, readLoopVersion } from "./worktree-version.js";
// TERMINAL_HASH_REGEX is the canonical stored-fingerprint format. Shared with
// the index so a corrupt index value is dropped on read (H-2 defense preserved
// on the index path) instead of feeding a false baseline. check-grounding.js
// does not import this module, so this edge is acyclic.
import { TERMINAL_HASH_REGEX } from "./check-grounding.js";
// Canonical index key form delegates to gate-logic.js#stripEvidenceAnchor so the
// index key never diverges from the path checkGrounding resolves. gate-logic.js
// already imports from this module (readRegistry), so this adds a second edge of
// the same pre-existing meta-state ↔ gate-logic cycle. Both modules use the
// import only inside functions (no top-level cross-module binding use), so the
// cycle is runtime-safe — see the identical suppression in check-grounding.js.
// Breaking the cycle (extracting stripEvidenceAnchor into a shared path lib) is
// out of scope for this migration.
// fallow-ignore-next-line circular-dependency
import { stripEvidenceAnchor } from "./gate-logic.js";
// Plan 260712-0724 (Implementation 3): universal `assertinvariant` primitive
// applied to every mutation op that owns an invariant the agent depends on
// (writeEntry, updateEntry, archiveEntry, deleteEntry, metaStateBatch).
// Pre-state-only — see core/operation-invariant.js for the architecture.
import { assertinvariant } from "./operation-invariant.js";
// Plan 260716-1101 Tier 2 Phase B: true-append write helper + canonical
// comparator. `trueAppendAtomic` replaces the read-all → full-rewrite pattern
// with O_APPEND + fsync'd writes (H1, RT). `canonicalize` powers the no-op
// short-circuit that resolves meta-260715T2311Z-gratuitous-mutations (C2, RT).
import { trueAppendAtomic as trueAppendAtomicRaw } from "./registry-append-atomic.js";
import { entriesEqual } from "./canonical-compare.js";

// === Registry-write helpers (inlined from former core/registry-writes.js) ===
// Single source of truth for the meta-state registry's on-disk path. Kept as
// private module-level bindings because the only callers are writeEntry /
// archiveEntry / deleteEntry / claimEntry / shipLoopDesign — all in this
// same file. The atomic write uses tmp-rename so a crash mid-write leaves
// the previous registry intact; invalidateCache fires after the rename so
// any subsequent read picks up the new contents.
const REGISTRY_FILENAME = "meta-state.jsonl";
// The change-log stream is a true-append log of immutable `entry_kind=change-log`
// entries. Reads go through the same chokepoint (`readRegistry`) which unions both
// files; writes branch on `entry_kind` and route change-logs to this file via
// `appendChangeLogEntryAtomic`. merge=union on this file is safe because change-logs
// are never mutated in place (enforced by the core-layer immutability guard in
// updateEntry/archiveEntry and the `entry_kind=change-log` branch in writeEntry).
const CHANGE_LOG_FILENAME = "change-log.jsonl";

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

function getChangeLogPath(root) {
  return join(root, CHANGE_LOG_FILENAME);
}

function persistRegistryAtomic(entries, root) {
  // Tier 1 red-team finding 2: reject any non-table-only persist once
  // change-log.jsonl exists. See assertNoChangeLogLeak jsdoc.
  assertNoChangeLogLeak(entries, root);
  const path = getRegistryPath(root);
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  renameSync(tmpPath, path);
  invalidateCache(root);
}

/**
 * Strip change-log entries from a union array. The `persistRegistryAtomic`
 * write path lands in `meta-state.jsonl` (the mutable table); the
 * `change-log.jsonl` stream is true-append only and must NEVER be the
 * destination of an in-place read-modify-write. Tier 2 Phase B rewrote
 * every persist site to true-append via `trueAppendAtomic`, which carries
 * its own `assertNoChangeLogLeak` guard (see core/registry-append-atomic.js).
 * The table-set projection is no longer needed at persist sites — change-log
 * writes are dispatched to `change-log.jsonl` by `appendChangeLogEntryAtomic`,
 * never to `meta-state.jsonl`. This helper remains documented for the
 * historical record (Tier 1 callers that read the union and want the
 * table-set projection for in-memory analytics).
 */

/**
 * Defensive assert: once `change-log.jsonl` exists, persist sites MUST NOT
 * pass a change-log entry to `meta-state.jsonl`. A non-table-only write here
 * would copy change-logs from `change-log.jsonl` into `meta-state.jsonl`,
 * and `merge=union` later would double them on the next parallel merge.
 *
 * Plan 260715-0801 Tier 1 red-team finding 2: a partial state where
 * `change-log.jsonl` exists but a persist site still passes a change-log
 * would silently corrupt the registry. This guard fails loud so the bug
 * surfaces immediately instead of at merge time.
 *
 * Pre-split (no change-log.jsonl): no-op — change-logs in meta-state.jsonl
 * are the expected state.
 * Post-split (change-log.jsonl present): the guard fires on any leak.
 *
 * The active enforcement lives in core/registry-append-atomic.js#assertNoChangeLogLeak,
 * which fires inside `trueAppendAtomic` BEFORE the file write. The legacy
 * `persistRegistryAtomic` callers (compaction only — see Phase C) inherit
 * the same contract via this local copy.
 */
function assertNoChangeLogLeak(entries, root) {
  if (!existsSync(getChangeLogPath(root))) return;
  for (const entry of entries) {
    if (entry.entry_kind === "change-log") {
      throw new Error(
        "change_log_leak: meta-state.jsonl persist received a change-log entry while change-log.jsonl exists. " +
        "Route change-log entries to change-log.jsonl via appendChangeLogEntryAtomic. " +
        "See core/registry-append-atomic.js#assertNoChangeLogLeak (active) and core/meta-state.js#assertNoChangeLogLeak (legacy).",
      );
    }
  }
}

/**
 * Restore a registry file to its pre-batch byte content. The byte-snapshot
 * rollback discipline (capture preBatchContent BEFORE the apply loop, restore
 * on any post-validation failure) is shared by every metaStateBatch failure
 * path. Tier 2 Phase B introduces this helper to DRY the three rollback sites
 * (table-append failure, change-log-append failure, auto-emit failure).
 *
 * Idempotent: calling on an already-restored file is a no-op (writeFileSync
 * overwrites with the same bytes; unlinkSync of a missing file is a no-op).
 *
 * @param {string} path - absolute filesystem path to the registry file
 * @param {string} preBatchContent - bytes captured BEFORE the batch started
 * @returns {void}
 */
function restorePreBatchContent(path, preBatchContent) {
  if (preBatchContent) {
    writeFileSync(path, preBatchContent, "utf8");
  } else if (existsSync(path)) {
    unlinkSync(path);
  }
}

function appendRegistryEntryAtomic(root, entry) {
  // Plan 260716-1101 Tier 2 Phase B: true-append (no read-all → full rewrite).
  // The previous implementation read the whole file, pushed, and full-rewrote;
  // that's unsafe for parallel-branch merges and is replaced by O_APPEND +
  // fsync via trueAppendAtomic. New entries start at version 0; later patches
  // bump to version N+1 (last-wins-by-max-version per Phase A projection).
  //
  // Pre-condition: caller MUST hold `withRegistryLock(root)`. writeEntry
  // acquires it via the enqueue queue.
  const path = getRegistryPath(root);
  const versionedEntry = { ...entry, version: entry.version ?? 0 };
  trueAppendAtomicRaw(root, path, versionedEntry);
  invalidateCache(root);
}

/**
 * True-append a single change-log entry to `change-log.jsonl`.
 *
 * Callers MUST hold `withRegistryLock(root)` on the caller-provided root
 * (typically the writeEntry wrapper at L760-803) — two concurrent MCP
 * servers calling this outside the lock can interleave byte-for-byte.
 *
 * The cache invalidation here covers BOTH files (`read-registry-cache.js`
 * keys on meta-state.jsonl mtime+size AND change-log.jsonl mtime+size); a
 * write to change-log.jsonl must bust the cache so the next read sees the
 * new entry. Without invalidation, a stale cached union could omit the
 * new change-log.
 *
 * Plan 260716-1101 Tier 2 Phase B: also uses `trueAppendAtomic` so the
 * change-log stream benefits from explicit fsync. Process kill mid-write
 * was previously the partial-last-line crash class (RT H1); fsync closes it.
 */
function appendChangeLogEntryAtomic(root, entry) {
  const path = getChangeLogPath(root);
  // trueAppendAtomic enforces the change-log-leak guard; here we pass the
  // change-log file path so the guard no-ops (path doesn't end with
  // meta-state.jsonl — see registry-append-atomic.js#assertNoChangeLogLeak).
  trueAppendAtomicRaw(root, path, entry);
  invalidateCache(root);
}

// Plan 260707-0812 (lifecycle-status-stale-mechanism) collapses the finding
// status enum to `{open, resolved, superseded}` (+ `archived` runtime-applied
// at archive time, outside the enum). `reported`/`active`/`stale`/`auto-resolved`
// are removed from the enum — read sites use `isOpen`/`isStaleView` instead.
// `archived` lives outside the enum because it is applied by `archiveEntry`
// after the entry has been removed from the canonical set.
export const TERMINAL_STATUSES = new Set(["resolved", "superseded"]);
const AFFECTED_SYSTEM_ENUM = [
  "meta",
  "gate-logic",
  "record-validation",
  "index-extractor",
  "mcp-tools",
  "workflow-registry",
  "vnstock_vendor",
  "vnstock",
  "fastapi",
  "tanstack",
  "product",
  "api",
  "web",
  "meta-state-tools",
  "runtime-state",
];

const AFFECTED_SYSTEM_DEFAULT = "meta";

function withDefaults(entry) {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    if (entry.affected_system === undefined || entry.affected_system === null) {
      entry.affected_system = AFFECTED_SYSTEM_DEFAULT;
    }
  }
  return entry;
}
const COMPACTION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Plan 260707-0812 Phase 1: STALENESS_WINDOW_MS is sourced from core/constants.js
// (the shared canonical owner) so core/stale-view.js and meta-state-sweep-tool.js
// cannot drift. The env-var override `META_STATE_STALENESS_WINDOW_MS` is honored
// by constants.js. Re-exported below for backward compat with callers that
// import STALENESS_WINDOW_MS directly from this module.

// Source-of-truth categories for finding entries. Export so introspection
// layers (e.g. core/loop-introspect.js) can derive from the same source.
// `stale-ref` was removed in plan 260704-0301-stale-findings-dispatch-handle
// (Rec 8 collapse): stale findings are no longer recorded as a category — the
// information is surfaced as a derived view via `meta_state_relationships`.
export const META_STATE_FINDING_CATEGORIES = [
  "gate-logic-bug", "record-repair-gap", "schema-drift",
  "mcp-tool-missing", "budget-check",
  "loop-anti-pattern",
];

/**
 * Entry-id reference prefixes. A value in a cross-reference array
 * (proposed_design_for, addresses, reopens) must start with one of these.
 * Single source of truth — shared by the schema refiners below and by the
 * cold-tier regression test, so the test enforces the same rule the schema
 * does instead of hand-rolling a copy. Tool names, file paths, and schema
 * export names are NOT entry-id refs; a design that targets those documents
 * them in its description and leaves the cross-ref array empty.
 */
const ENTRY_ID_REF_PREFIXES = ["meta-", "rule-", "loop-design-"];

// fallow-ignore-next-line unused-export -- public predicate consumed by cold-tier-regression.test.js; also used internally by entryIdRefsRefine
export function isValidEntryIdRef(ref) {
  return typeof ref === "string" && ENTRY_ID_REF_PREFIXES.some((p) => ref.startsWith(p));
}

/**
 * superRefine that rejects non-entry-id refs in a cross-reference array with
 * an actionable, path-tagged message. This is the validator middleware: every
 * write surface (meta_state_propose_design, meta_state_patch, meta_state_batch
 * write) derives from the per-kind schemas below, so this is the single choke
 * point that prevents invalid bodies from being persisted. Empty arrays pass
 * (no elements to check). The message tells the caller exactly what to do —
 * clear the field or use a real entry id — and to escalate rather than retry
 * wire shapes, so the agent runtime does not loop against the gate.
 */
function entryIdRefsRefine(val, ctx) {
  for (let i = 0; i < val.length; i++) {
    if (!isValidEntryIdRef(val[i])) {
      ctx.addIssue({
        code: "custom",
        path: [i],
        message:
          `must be a valid entry-id ref (start with ${ENTRY_ID_REF_PREFIXES.join(" / ")}); got ${JSON.stringify(val[i])}. ` +
          `To target a non-entry-id (MCP tool name, file path, schema export), set this field to [] and document the target in the description. ` +
          `If unsure, return to the operator instead of retrying.`,
      });
    }
  }
}

/** Array of entry-id refs with wire-envelope stripping + prefix validation. */
const entryIdRefArray = () =>
  z.preprocess(deepStripEnvelope, z.array(z.string()).superRefine(entryIdRefsRefine));

/**
 * Finding branch schema — used by the 5 existing meta-state finding tools.
 * Has .shape available for tool schema reuse.
 */
export const metaStateFindingEntrySchema = z.object({
  id: z.string().optional().describe("Entry id; see field_glossary.id"),
  entry_kind: z.literal("finding").default("finding"),
  created_at: z.string().optional().describe("ISO timestamp"),
  category: z.enum([
    "gate-logic-bug", "record-repair-gap", "schema-drift",
    "mcp-tool-missing", "budget-check",
    "loop-anti-pattern",
  ]).describe("Category of the finding"),
  severity: z.enum(["warning", "escalate"]).describe("Severity level"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).describe("Affected system"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional()
    .describe("Subtype for loop-anti-pattern findings; see field_glossary"),
  recurrence_key: z.string().optional()
    .describe("Recurring-false-positive dedup key; see field_glossary"),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code location; see field_glossary.evidence_code_ref"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["open", "resolved", "superseded"]).optional()
    .describe("Finding lifecycle; use field_glossary.status and the dedicated lifecycle tools."),
  consolidated_into: z.string().optional()
    .describe("Canonical change-log id for a superseded finding; see field_glossary.id"),
  verification: z.object({}).passthrough().optional()
    .describe("Verification reproduction object; see field_glossary.verification"),
  superseded_at: z.string().optional()
    .describe("ISO timestamp set by meta_state_supersede."),
  superseded_by: z.string().optional()
    .describe("Operator id set by meta_state_supersede. Default 'operator'."),
  session_id: z.string().optional()
    .describe("Session idempotency key for hook-emitted findings; see field_glossary.session_id"),
  mechanism_check: z.coerce.boolean().optional()
    .describe("Whether evidence_code_ref participates in grounding checks; see field_glossary.mechanism_check"),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("Deprecated per-record fingerprint; refresh file-index.jsonl instead."),
  code_ref: z.string().optional()
    .describe("Optional code reference with fingerprint."),
  ledger_ref: z.string().optional()
    .describe("Optional runtime-state ledger pointer; see field_glossary.ledger_ref"),
  expires_at: z.string().nullable().optional()
    .describe("Legacy nullable timestamp; no longer written."),
  resolved_at: z.string().nullable().optional()
    .describe("ISO timestamp when the entry was resolved. Set by meta_state_resolve."),
  resolved_by: z.string().nullable().optional()
    .describe("Operator or rule id that resolved the entry. Set by meta_state_resolve."),
  resolution: z.string().nullable().optional()
    .describe("Human-readable resolution note. Set by meta_state_resolve."),
  promoted_to_rule: z.string().nullable().optional()
    .describe("Operator or rule id that promoted this finding."),
  auto_resolve: z.coerce.boolean().nullable().optional()
    .describe("Whether TTL auto-resolution is allowed."),
  reopens: entryIdRefArray().optional()
    .describe("Stale finding ids re-surfaced by this entry; see field_glossary.reopens"),
});

/**
 * Change-log branch schema — used by meta_state_log_change.
 * Has .shape available for tool schema reuse.
 */
export const metaStateChangeEntrySchema = z.object({
  id: z.string().optional().describe("Entry id; see field_glossary.id"),
  entry_kind: z.literal("change-log").describe("Discriminator: change-log"),
  change_dimension: z.enum(["semantic", "mechanical", "surface"])
    .describe("What kind of change"),
  change_target: z.string().min(1)
    .describe("Specific path or identifier being changed"),
  change_diff: z.object({
    added: z.array(z.string()).default([]).describe("Paths/fields added"),
    removed: z.array(z.string()).default([]).describe("Paths/fields removed"),
    changed: z.array(z.string()).default([]).describe("Paths/fields whose meaning changed (not value)"),
  }).describe("Structured diff"),
  reason: z.string().min(20)
    .describe("Why the change was made (min 20 chars)"),
  applies_to: z.object({
    tools: z.array(z.string()).optional().describe("Tool names affected"),
    surfaces: z.array(z.string()).optional().describe("Surface names affected"),
    rules: z.array(z.string()).optional().describe("Rule IDs affected"),
    statuses: z.array(z.string()).optional().describe("Status values affected"),
    schemas: z.array(z.string()).optional().describe("Schema files affected"),
  }).optional().describe("Wider impact scope"),
  supersedes: z.string().optional()
    .describe("ID of a previous change-log entry this one replaces"),
  // Plan 260715-0801 Validation Session 1 Q2: consolidates is multi-valued
  // (the relationships tool at meta-state-relationships-tool.js:21-25 has
  // always grouped it as an array). Schema now enforces the array form;
  // the migration script converts any legacy single-string value to a
  // one-element array as part of the change-log.jsonl split (same PR).
  consolidates: z.array(z.string()).optional()
    .describe("Finding ids consolidated by this change-log; see field_glossary.id"),
  evidence_code_ref: z.string().optional()
    .describe("Code reference, e.g. path/to/file.js:line"),
  evidence_journal: z.string().optional()
    .describe("Journal path; see field_glossary.evidence_journal"),
  evidence_test: z.string().optional()
    .describe("Test path; see field_glossary.evidence_test"),
  evidence: z.never().optional()
    .describe("Nested evidence block is no longer supported; use top-level evidence_code_ref, evidence_journal, evidence_test"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).optional().describe("Which system this change affects"),
  code_ref: z.string().optional().describe("Optional code reference with fingerprint."),
  ledger_ref: z.string().optional().describe("Optional pointer to a runtime-state.jsonl sidecar ledger."),
  status: z.literal("active").default("active").describe("Status — change-log entries are always 'active' (immutable audit log)"),
  created_at: z.string().describe("ISO timestamp"),
  version: z.number().default(0).describe("CAS version (not used by change-log entries but consistent shape)"),
  expires_at: z.string().optional()
    .describe("Forward-compat: optional TTL for future change-log subtypes that may expire."),
  // Plan 260712-0300 Phase 1: optional magnitude envelope for batch mutations.
  // Auto-emitted by `meta_state_batch` when callers pass an `envelope` field;
  // describes kind + target + pre/post registry snapshot + content-hash. The
  // canonical enum keys (by_status / by_kind) are constrained so post-hoc
  // tests can assert exact equality. Field is OPTIONAL — pre-existing change-log
  // entries are valid without it (no backfill required).
  operation_envelope: z.object({
    kind: z.enum(OPERATION_ENVELOPE_KINDS)
      .describe("Magnitude kind; see loop-design-operation-envelope-on-change-log"),
    target: z.string().min(1).max(200)
      .regex(/^[^\x00-\x1f\x7f]+$/, "target must not contain control chars")
      .regex(/^(?!.*\.\.).*$/, "target must not contain '..' path segments")
      .describe("Identifier for the batch's target (e.g., 'drift-closeout-2026-07-12'). Validated for path safety; not a filesystem path."),
    pre_count: z.object({
      total: z.number().int().nonnegative(),
      by_status: z.record(z.enum(CANONICAL_STATUS_KEYS), z.number().int().nonnegative()),
      by_kind: z.record(z.enum(CANONICAL_KIND_KEYS), z.number().int().nonnegative()),
    }).describe("Registry snapshot before the batch"),
    post_count: z.object({
      total: z.number().int().nonnegative(),
      by_status: z.record(z.enum(CANONICAL_STATUS_KEYS), z.number().int().nonnegative()),
      by_kind: z.record(z.enum(CANONICAL_KIND_KEYS), z.number().int().nonnegative()),
    }).describe("Registry snapshot after the batch"),
    content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
      .describe("Content-hash of kind + target + canonicalized op-list + entry-id-set; same input -> same hash. NOT a replay protection — replay detection belongs elsewhere."),
  }).optional().describe("Optional magnitude envelope for batch mutations; see loop-design-operation-envelope-on-change-log"),
});

/**
 * Rule branch schema — promoted gate/agent rules with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateRuleEntrySchema = z.object({
  entry_kind: z.literal("rule").default("rule"),
  id: z.string().regex(/^rule-[a-z0-9-]+$/).describe("Stable rule id; see field_glossary.id"),
  origin: z.string().describe("Finding id that originated this rule"),
  enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced"),
  pattern_type: z.enum(["regex", "glob", "determinism-checklist", "agent-checklist"]).describe("Pattern language"),
  pattern: z.string().describe("The pattern (regex body, glob path, or session_id)"),
  scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()
    .describe("Optional project scope predicate"),
  applies_to_resolution: z.string().optional()
    .describe("Finding id gated by a determinism checklist"),
  supersedes: z.string().optional()
    .describe("Prior rule id refined by this rule"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Rule lifecycle; inactive rules are not enforced"),
  promoted_at: z.string().describe("ISO timestamp"),
  promoted_by: z.string().describe("Operator id"),
  evidence_code_ref: z.string().optional()
    .describe("Code reference; SP2 grounding still applies"),
  evidence_journal: z.string().optional()
    .describe("Journal path; see field_glossary.evidence_journal"),
  evidence_test: z.string().optional()
    .describe("Test path; see field_glossary.evidence_test"),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("Deprecated per-record fingerprint; refresh file-index.jsonl instead."),
  refined_at: z.string().optional().describe("ISO timestamp of last refinement"),
  refined_by: z.string().optional().describe("Operator id of last refinement"),
  refinement_reason: z.string().optional().describe("Why the rule was last refined"),
  // Phase 3 (plans/260717-1826-unify-context-injection): rule-derived
  // process hint prose. Persisted on agent-checklist rule entries; the
  // meta_state_promote_rule tool REQUIRES this on creation (actionable
  // rejection), and the hint-renderer resolves `text` from `rule.hint_text`
  // at SessionStart render time. Optional on the schema because non-
  // agent-checklist rules (gate-enforced) don't need injection prose;
  // the hint-renderer treats a missing rule hint as a skip-with-warning.
  hint_text: z.string().min(20).optional()
    .describe("Agent-checklist process hint text; required when promoted as agent-checklist"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).optional().describe("Which system this rule affects"),
  // Plan 260712-0724 follow-up (Fix B): parallel to change-log's applies_to
  // (line 180-186). Scope-narrowing that complements scope_predicate — used
  // by universal rules (e.g., rule-assertinvariant-at-boundary) to suppress
  // test-mock false positives without relying solely on regex hand-curation.
  applies_to: z.object({
    tools: z.array(z.string()).optional().describe("Tool names this rule applies to (narrows firing scope)"),
    surfaces: z.array(z.string()).optional().describe("Surface names this rule applies to"),
    rules: z.array(z.string()).optional().describe("Rule ids this rule applies to (chain-of-rules scoping)"),
    statuses: z.array(z.string()).optional().describe("Status values this rule applies to (e.g., narrow to active findings)"),
    schemas: z.array(z.string()).optional().describe("Schema files this rule applies to"),
  }).optional().describe("Optional scope selectors; see field_glossary.applies_to"),
  code_ref: z.string().optional().describe("Optional code reference with fingerprint."),
  ledger_ref: z.string().optional().describe("Optional pointer to a runtime-state.jsonl sidecar ledger."),
  created_at: z.string().optional().describe("ISO timestamp"),
});

/**
 * Loop-design branch schema — deferred design notes with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateLoopDesignSchema = z.object({
  entry_kind: z.literal("loop-design").default("loop-design"),
  id: z.string().describe("Design id; see field_glossary.id"),
  title: z.string().min(10).describe("Short human-readable title"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Binary. Flips to inactive when the proposed work ships."),
  proposed_design_for: entryIdRefArray()
    .describe("Forward entry-id refs for rules/schemas/tools; see field_glossary.proposed_design_for"),
  addresses: z.preprocess(deepStripEnvelope, z.array(z.string()).superRefine(entryIdRefsRefine).default([]))
    .describe("Motivating finding ids; see field_glossary.addresses"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).describe("Which system this design affects"),
  severity_hint: z.enum(["low", "medium", "high"]).optional()
    .describe("Operator's read on the urgency of shipping this design"),
  code_ref: z.string().optional().describe("Optional code reference with fingerprint."),
  ledger_ref: z.string().optional().describe("Optional pointer to a runtime-state.jsonl sidecar ledger."),
  created_at: z.string().describe("ISO timestamp"),
  created_by: z.string().describe("Operator id"),
  shipped_in_plan: z.string().optional()
    .describe("Plan id (plans/YYMMDD-slug/) that shipped this design; set when status flips to inactive"),
  shipped_at: z.string().optional()
    .describe("ISO timestamp of the ship event"),
});

/**
 * Cross-cutting union validator — for readRegistry validation, loop_describe, etc.
 * Does NOT have .shape (by zod design); use the branch schemas for .shape.
 * Includes preprocess to default affected_system to 'meta' for legacy entries.
 */
export const metaStateEntrySchema = z.preprocess(
  withDefaults,
  z.union([
    metaStateFindingEntrySchema,
    metaStateChangeEntrySchema,
    metaStateRuleEntrySchema,
    metaStateLoopDesignSchema,
  ])
);

/**
 * Identity and audit-trail fields that cannot be patched via meta_state_patch
 * or meta_state_batch update ops. Single source of truth — the patch tool and
 * the batch function both consult this set so the two mutation surfaces
 * enforce the same invariant.
 *
 * Notes:
 * - `entry_kind` is enforced OFF the patch path by Fix A in
 *   buildPatchSchemaFor (omits `entry_kind` from every per-kind patch schema
 *   BEFORE .partial().strict() so Zod's .default() on the literal cannot
 *   inject identity on empty/non-kind-specific patches). `entry_kind` is
 *   additionally stripped at the core layer by Fix B in updateEntry
 *   (defense-in-depth for direct core callers that bypass the patch schema).
 *   The deny-list entry below is the post-repair stopgap that closes the
 *   batch update hole until the universal assertinvariant wrapper
 *   (Implementation 3, loop-design-assertinvariant-universal-scope) replaces
 *   the deny-list with a before/after comparison guard. Plan 260712-0109.
 * - `status` (on rule + loop-design) is enforced OFF the patch path by
 *   Fix A (omits `status` from the rule + loop-design patch schemas; the
 *   finding schema does not .default() status so no injection there). The
 *   deny-list entry below extends the guard to the batch path as a stopgap.
 * - `promoted_to_rule` removed from deny-list — the field is no longer written
 *   on findings after the Phase 2 migration to first-class rule entries.
 * - `id` and `op` and `_expected_version` are stripped before the patch is
 *   applied (see metaStateBatch line ~520 and meta_state_patch line ~73), so
 *   they are safe by construction; listed here for clarity.
 */
export const IMMUTABLE_PATCH_FIELDS = new Set([
  "id",
  "version",
  "created_at",
  "created_by",
  "code_fingerprint",
  "consolidated_into",
  "resolved_at",
  "resolved_by",
  "resolution",
  "entry_kind",  // identity — stopgap until the universal assertinvariant wrapper (Impl 3)
  "status",      // lifecycle identity — stopgap (rule/loop-design deactivation/ship is operator-decided)
  "operation_envelope",  // Plan 260712-0300 Phase 2 — auto-emit ONLY (meta_state_batch); replace via patch is a forge vector. Stopgap until universal wrapper (Impl 3).
  // Freshness stamps are produced only by verification (re-verify) or
  // grounding-guarded attestation (touch). Patching would forge freshness
  // without evidence. Plan 260724-1931 phase 3 closes this backdoor.
  "last_verified_at",
]);

/**
 * Derive the list of patchable kinds from the entry_kind enum.
 * Single source of truth — no separate hardcoded array to drift.
 *
 * NOTE: change-log is handler-level immutable (meta-state-patch-tool.js:56-59
 * rejects all change-log patches with reason "change_log_immutable"), but
 * the schema is still included so the union covers all 4 kinds. The handler
 * guard is the enforcement; the schema is permissive.
 */
export const PATCH_KINDS = ["finding", "change-log", "rule", "loop-design"];

/**
 * Derive a per-kind patch schema from the 4 per-kind source-of-truth
 * schemas. Patches are partial (.partial() marks all fields optional);
 * unknown keys are rejected (.strict() closes typo/unknown-field
 * pollution via Object.assign at the updateEntry boundary).
 *
 * Identity + lifecycle fields are OMITTED from the per-kind projection
 * BEFORE .partial().strict() so Zod's .default() on the literal/enum
 * cannot inject `entry_kind` or `status` on empty/non-kind-specific
 * patches (Plan 260712-0109, finding meta-260712T0053Z):
 * - `entry_kind` is identity; set by the tool's top-level branch-selector
 *   param (the `entry_kind` argument), never by a field patch.
 * - `status` (on rule + loop-design) is lifecycle identity; deactivation
 *   / ship is an operator decision via meta_state_promote_rule /
 *   propose_design + meta_state_patch is NOT the lifecycle-flip tool —
 *   but with status in the patch schema + .default("active"), any patch
 *   silently re-activates.
 *
 * IMPORTANT: .strict() does NOT reject __proto__ via JSON.parse (JS
 * engine absorbs it into prototype chain before Zod sees it). The real
 * defense is the explicit `delete cleanPatch.__proto__` at
 * core/meta-state.js:376.
 *
 * This is a pure projection: any change to the per-kind schemas in
 * this file is reflected here automatically. Tests in
 * __tests__/meta-state-patch-derived-schema.test.js assert the round-trip
 * behavior end-to-end.
 */
export function buildPatchSchemaFor(kind) {
  switch (kind) {
    case "finding":    return metaStateFindingEntrySchema.omit({ entry_kind: true }).partial().strict();
    case "change-log": return metaStateChangeEntrySchema.omit({ entry_kind: true }).partial().strict();
    case "rule":       return metaStateRuleEntrySchema.omit({ entry_kind: true, status: true }).partial().strict();
    case "loop-design": return metaStateLoopDesignSchema.omit({ entry_kind: true, status: true }).partial().strict();
    default:
      throw new Error(
        `buildPatchSchemaFor: unknown kind "${kind}". Expected one of: ${PATCH_KINDS.join(", ")}`
      );
  }
}

/**
 * Patch validator — accepts any top-level key because patches are partial
 * by definition and may contain any subset of the union fields.
 *
 * Defense-in-depth: rejects empty objects at the schema boundary so
 * direct core callers (e.g. updateEntry, fix-loop-design-refs.mjs) cannot
 * silently no-op via the entriesEqual short-circuit. The patch-tool
 * handler has a parallel empty-patch check that fires BEFORE the CAS
 * field is added (so the user-facing case is caught even when the only
 * user-supplied fields are stripped identity/CAS fields).
 * Resolves meta-260717T1026Z-...empty-patch.
 */
export const metaStateEntryPatchSchema = z.object({}).passthrough()
  .refine((p) => Object.keys(p).length > 0, {
    message: "patch must contain at least one field; empty patches are rejected at the schema boundary (see meta-260717T1026Z)",
  });

/**
 * Thrown when writeEntry receives an entry that fails validation against
 * metaStateEntrySchema.
 */
export class InvalidEntryError extends Error {
  constructor(validationErrors) {
    super("Invalid meta-state entry: " + validationErrors.message);
    this.name = "InvalidEntryError";
    this.errors = validationErrors.format();
  }
}

/**
 * Plan 260711-0030 Phase 4: thrown when writeEntry's entry.entry_kind is not
 * in the current worktree's schema_branches (declared in .loop-version).
 * Closes the parallel-operation schema-version-skew gap.
 */
export class SchemaVersionSkewError extends Error {
  constructor(root, branch, currentVersion) {
    const branches = Array.isArray(currentVersion?.schema_branches) ? currentVersion.schema_branches.join(", ") : "<unparsed>";
    super(
      `schema_version_skew: entry_kind="${branch}" not in worktree's schema_branches=[${branches}]. Worktree: ${root}. The receiving worktree may run an older L2 version that does not recognize this entry_kind.`,
    );
    this.name = "SchemaVersionSkewError";
    this.code = "SCHEMA_VERSION_SKEW";
    this.branch = branch;
    this.currentVersion = currentVersion;
    this.root = root;
  }
}

/** Per-root write queue to prevent read-modify-write races. */
const writeQueues = new Map();

function enqueue(root, fn) {
  const key = root;
  const prev = writeQueues.get(key) || Promise.resolve();
  const result = prev.then(fn);
  const next = result.catch(() => {}); // keep chain alive regardless of failure
  writeQueues.set(key, next);
  // Return `result` (not `next`) so callers receive rejection reasons.
  // Prior code returned `next`, which swallowed errors silently.
  return result;
}

/**
 * Shared dual-source read: meta-state.jsonl (mutable table) +
 * change-log.jsonl (true-append log of immutable change-logs).
 *
 * Returns the parsed entry list with backward-compat coercions applied and
 * NO projection / NO sort — the two callers (`_readAndParseRegistry` and
 * `parseFnAllVersions`) differ ONLY in what they do after this step. Keep
 * it that way: if a coercion is needed, add it here, not in one caller —
 * the projected and all-versions reads MUST NOT diverge on parse semantics.
 */
function readRawLines(root) {
  const metaStatePath = getRegistryPath(root);
  const changeLogPath = getChangeLogPath(root);
  const metaStateLines = existsSync(metaStatePath)
    ? readFileSync(metaStatePath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const changeLogLines = existsSync(changeLogPath)
    ? readFileSync(changeLogPath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const allLines = [...metaStateLines, ...changeLogLines];
  return allLines.map((line) => {
    const entry = JSON.parse(line);
    if (!entry.entry_kind) {
      entry.entry_kind = "finding"; // Backward-compat coerce
    }
    withDefaults(entry); // Apply affected_system default for legacy entries
    return entry;
  });
}

function _readAndParseRegistry(root) {
  // Tier 2 Phase A projection (last-wins-by-max-version):
  //   1. Concat both files
  //   2. Group by id
  //   3. Pick max_by(version) per id (tie-break: later created_at wins)
  //   4. Re-sort by created_at ascending for chronological output
  //
  // Pure-JS (Array.prototype.sort is V8-stable). Tier 1 used sort-only
  // projection (identity for singleton-per-id); same output today since
  // every id in the live registry is a singleton. Phase B write-path will
  // produce multi-line-per-id (versioned append) where this projection
  // becomes load-bearing.
  //
  // Pre-condition: every id has ≥1 non-null integer `version` (backfilled
  // by tools/learning-loop-mastra/tools/handlers/scripts/backfill-versions.mjs
  // before this projection goes live). Without the backfill, `max_by` would
  // mispick on all-null-version groups (returns arbitrary group member).
  const parsed = readRawLines(root);
  // Last-wins-by-max-version dedupe (Phase A projection).
  // Tie-break on equal version: later created_at wins (matches the tie-break
  // in migrate-change-log-stream.mjs#dedupeById so script → reader is
  // consistent). For null/missing version, treat as 0 — backfill guarantees
  // no group is all-null-version post-Phase-A.
  const byId = new Map();
  for (const entry of parsed) {
    const prior = byId.get(entry.id);
    if (!prior) {
      byId.set(entry.id, entry);
      continue;
    }
    const priorV = prior.version ?? 0;
    const nextV = entry.version ?? 0;
    if (nextV > priorV) {
      byId.set(entry.id, entry);
      continue;
    }
    if (nextV === priorV) {
      const priorT = prior.created_at ?? "";
      const nextT = entry.created_at ?? "";
      if (nextT > priorT) byId.set(entry.id, entry);
    }
    // else: keep prior
  }
  const projected = [...byId.values()];
  // Re-sort by created_at ascending so callers see a chronological union.
  projected.sort((a, b) => {
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  return projected;
}

/**
 * All-versions parse: same dual-source read as `_readAndParseRegistry` but
 * SKIPS the `group_by(.id) | max_by(.version)` collapse. Every line per id
 * is returned, sorted by (id ascending, version ascending) with created_at
 * as the tie-break (matches the projection's tie-break for parity).
 *
 * Null/missing version is treated as 0 (same null-as-0 invariant as the
 * projection) so legacy pre-Phase-A entries parse cleanly. Deliberately
 * NOT sorted by created_at: multi-line-per-id means a created_at sort
 * would shuffle versions arbitrarily within an id group.
 */
function parseFnAllVersions(root) {
  const parsed = readRawLines(root);
  parsed.sort((a, b) => {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const va = a.version ?? 0;
    const vb = b.version ?? 0;
    if (va !== vb) return va - vb;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  return parsed;
}

// Both projections share one cache slot per (root + mtime + size) — a single
// cold miss computes both, so projected callers and all-versions callers
// never see two separate parses of the same file state.
const REGISTRY_PARSE_FNS = {
  projected: _readAndParseRegistry,
  allVersions: parseFnAllVersions,
};

/**
 * Read the JSONL registry and return an array of parsed entries.
 * Returns empty array if the file does not exist.
 * Uses process-lifetime LRU cache keyed on mtimeMs + size.
 */
export function readRegistry(root) {
  return readRegistryWithCache(root, REGISTRY_PARSE_FNS).projected;
}

/**
 * Read the JSONL registry WITHOUT the max_by(version) collapse: every line
 * per id, sorted by (id, version) ascending. Shares the cache slot with
 * `readRegistry` (same file-state key). Used by meta_state_list's
 * `include_all_versions` affordance.
 */
export function readRegistryAllVersions(root) {
  return readRegistryWithCache(root, REGISTRY_PARSE_FNS).allVersions;
}

// ─── File-index sidecar (path-keyed shared fingerprint index) ──────────────
// The grounding baseline moved off the per-finding `code_fingerprint` to a
// shared `file-index.jsonl` sidecar so one file edit re-grounds all anchored
// findings in a single upsert (O(findings_per_file) -> O(1)). One JSONL line
// per { path, code_fingerprint, updated_at }; uniqueness is structural (read
// whole map -> set key -> write whole map). Single writer (MCP server), same
// per-root `enqueue` queue as writeEntry — no new race class.
//
// The per-record `code_fingerprint` field stays as a vestigial fallback (see
// check-grounding.js); this index is the authoritative baseline. Phase 1 is
// additive only — nothing reads the index yet.
export const FILE_INDEX_FILENAME = "file-index.jsonl";

/** Path to the sidecar, mirroring getRegistryPath. */
export function getFileIndexPath(root) {
  return join(root, FILE_INDEX_FILENAME);
}

/**
 * Canonical index key: the stripped relative evidence_code_ref (no `:line`,
 * no `#anchor`, no root prefix, no absolute path). Single source of truth so
 * the refresh tool, auto-populate, and lookup can't diverge (red-team F3).
 * `evidence_code_ref` values in the registry are relative; the grounding
 * result's absolute `absPath` MUST NOT be used as a key.
 */
export function canonicalIndexKey(evidenceCodeRef) {
  return stripEvidenceAnchor(evidenceCodeRef);
}

// mtime+size cache for readFileIndex (mirrors read-registry-cache.js). Why
// mtime+size not just mtime: some filesystems have coarse mtime granularity;
// the size check catches "same mtime, different content" in O(1).
const _fileIndexCache = new Map();

/** Test-only: reset the file-index read cache between assertions. */
export function _resetFileIndexCacheForTests() {
  _fileIndexCache.clear();
}

function _invalidateFileIndexCache(root) {
  _fileIndexCache.delete(root);
}

/**
 * Read the file-index sidecar into a Map<canonicalKey, hash>. Empty/missing
 * file -> empty Map. Cached on (mtimeMs, size); upsertFileIndexEntry and any
 * direct write invalidate it.
 *
 * Validation (red-team F6): each line's hash is tested against TERMINAL_HASH_REGEX;
 * a line whose hash fails is dropped (treated as absent), mirroring the per-record
 * `code_fingerprint` validation in check-grounding.js.
 *
 * Resilience: malformed JSON lines are skipped with a defensive try-catch. This
 * is NEW behavior — the registry reader `_readAndParseRegistry` throws on
 * malformed JSON; the index reader is deliberately more defensive because a
 * single poisoned line must not break grounding for every other cited path.
 */
export function readFileIndex(root) {
  const path = getFileIndexPath(root);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    _fileIndexCache.delete(root);
    return new Map();
  }
  const { mtimeMs, size } = stat;
  const cached = _fileIndexCache.get(root);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.entries;
  }
  const raw = readFileSync(path, "utf8");
  const map = new Map();
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      // Malformed JSON line — skip (NEW resilience; see jsdoc).
      continue;
    }
    const key = typeof row.path === "string" ? canonicalIndexKey(row.path) : null;
    const hash = typeof row.code_fingerprint === "string" ? row.code_fingerprint : null;
    if (key === null || !TERMINAL_HASH_REGEX.test(hash)) {
      // Drop lines with a missing/invalid path or a hash that fails the regex
      // (F6) — never feed a corrupt baseline into grounding.
      continue;
    }
    map.set(key, hash);
  }
  _fileIndexCache.set(root, { entries: map, mtimeMs, size });
  return map;
}

/**
 * Upsert one path's current hash into the sidecar (atomic tmp+rename under the
 * per-root write queue). Returns true on success, false if the hash is invalid
 * or the path is absolute (rejected as a key — F3). `updated_at` is stamped
 * with the current time when the entry is new or its hash changed; an
 * unchanged-hash re-upsert is a no-op that touches nothing (no rewrite, no
 * re-stamp, no cache invalidation). Invalidates the read cache on real writes.
 */
export function upsertFileIndexEntry(root, evidenceCodeRef, hash) {
  // Reject absolute paths as keys (F3) and validate the hash before any write.
  if (typeof evidenceCodeRef !== "string" || isAbsolute(stripEvidenceAnchor(evidenceCodeRef))) {
    return false;
  }
  if (typeof hash !== "string" || !TERMINAL_HASH_REGEX.test(hash)) {
    return false;
  }
  const key = canonicalIndexKey(evidenceCodeRef);
  return enqueue(root, () => {
    const path = getFileIndexPath(root);
    // Clone the cached Map before mutating: readFileIndex returns its cached
    // entries by reference, so an in-place `set` would mutate the shared cache
    // object. If the write below throws, the cache would be left holding a key
    // that was never persisted to disk — and since the file's mtime/size are
    // unchanged by a failed write, the next readFileIndex would return that
    // phantom baseline and mask drift. Cloning + invalidating in `finally`
    // makes a failed write impossible to desync the cache from the file.
    const map = new Map(readFileIndex(root));
    // No-op early return: the stored hash already matches. Skipping the rewrite
    // keeps file-index.jsonl byte-stable on no-change re-seeds, which keeps the
    // cold-tier cache (keyed on sha256(contents)) warm. The check runs inside
    // the per-root enqueue so concurrent upserts of the same key stay serialized.
    if (map.get(key) === hash) {
      return true;
    }
    map.set(key, hash);
    const lines = [...map.entries()].map(
      ([p, h]) => JSON.stringify({ path: p, code_fingerprint: h, updated_at: new Date().toISOString() }),
    );
    const tmpPath = path + ".tmp";
    try {
      writeFileSync(tmpPath, lines.join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
    } finally {
      _invalidateFileIndexCache(root);
    }
    return true;
  });
}

/**
 * Module-private helper: assert the entry at `entries[idx]` is NOT in the
 * `archived` status. Used by `archiveEntry` (single-entry archive path) and by
 * `metaStateBatch`'s `case "archive"` (batch archive path) — both paths were
 * flagged by fallow for duplicating the same `assertinvariant` already-archived
 * pre-condition inline. Returns true when the entry may be archived; returns
 * false when the entry is already archived (and emits the structured
 * `already_archived` failure to the gate log via the assertinvariant wrapper).
 *
 * Module-private (not exported): only this file owns the registry semantics,
 * and `already_archived` is the only currently-shared pre-condition. If a
 * second invariant emerges (e.g., `not_terminal` for re-archive attempts),
 * promote this to a small family of helpers.
 */
async function assertNotArchived(entries, idx, root, id) {
  const invariantResult = await assertinvariant(
    () => Promise.resolve({ ok: true }),
    {
      accept: {
        context: () => entries[idx],
        check: (e) => e.status !== "archived",
      },
      returnOnFail: {
        reason_code: "already_archived",
        id,
      },
      root,
    }
  );
  return invariantResult.ok;
}

// Change-log immutability pre-condition for batch ops. Change-logs live in
// `change-log.jsonl` (true-append); the table persist strips them before
// writing `meta-state.jsonl`, so mutating one in `entries[]` is a silent
// no-op. Shared by the `update` and `delete` ops so both reject explicitly.
async function assertNotChangeLog(entries, idx, root, id) {
  const invariantResult = await assertinvariant(
    () => Promise.resolve({ ok: true }),
    {
      accept: {
        context: () => entries[idx],
        check: (e) => e.entry_kind !== "change-log",
      },
      returnOnFail: {
        reason_code: "change_log_immutable",
        entry_kind: entries[idx].entry_kind,
        id,
      },
      root,
    }
  );
  return invariantResult.ok;
}

/**
 * Atomically append a single entry to the JSONL registry.
 * Queued per-root to prevent read-modify-write races under concurrent calls
 * within one process, AND locked at the filesystem level (proper-lockfile) to
 * prevent read-modify-write races across processes. Plan 260711-0030 Phase 1.
 */
export function writeEntry(root, entry) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // pre-state-only wrapper at the writeEntry boundary. The wrapper
      // enforces general identity pre-conditions (entry has an id; entry
      // has a recognized entry_kind). The forge-vector guard for
      // caller-supplied envelopes on `meta_state_batch` case "write" lives
      // at metaStateBatch (the only caller that opens the forge surface;
      // meta_state_log_change legitimately writes change-logs with
      // operation_envelope via the auto-emit path).
      const invariantResult = await assertinvariant(
        () => Promise.resolve({ entry }),
        {
          accept: {
            context: () => entry,
            check: (e) =>
              Boolean(e) && typeof e.id === "string" && typeof e.entry_kind === "string",
          },
          returnOnFail: {
            reason_code: "write_entry_identity_precondition_failed",
          },
          root,
        }
      );
      if (!invariantResult.ok) {
        throw new Error("invalid_entry: write_entry_identity_precondition_failed");
      }

      // Plan 260711-0030 Phase 4: schema-version-skew gate. Reject writes whose
      // entry_kind is not in the current worktree's schema_branches BEFORE the
      // validation pass (clearer error path) and BEFORE any registry mutation.
      // Lazy .loop-version creation happens inside readLoopVersion.
      if (entry && entry.entry_kind && !isSchemaBranchSupported(root, entry.entry_kind)) {
        throw new SchemaVersionSkewError(root, entry.entry_kind, readLoopVersion(root));
      }
      const validation = metaStateEntrySchema.safeParse(entry);
      if (!validation.success) {
        throw new InvalidEntryError(validation.error);
      }
      // Plan 260715-0801 Tier 1 Phase 2: write dispatch by entry_kind.
      // Change-logs true-append to change-log.jsonl (merge=union safe);
      // everything else lands in meta-state.jsonl. Runs INSIDE the
      // withRegistryLock wrapper so concurrent MCP servers cannot interleave
      // byte-for-byte on the change-log file.
      if (validation.data.entry_kind === "change-log") {
        appendChangeLogEntryAtomic(root, validation.data);
      } else {
        appendRegistryEntryAtomic(root, validation.data);
      }
    })
  );
}

/**
 * Atomically update an entry by id, applying a patch object.
 * Plan 260716-1101 Tier 2 Phase B: true-append (no full rewrite). The patch
 * is applied to a COPY of the existing entry; if the patched copy is
 * canonically equal to the existing entry (canonical-comparator short-circuit,
 * resolves meta-260715T2311Z-gratuitous-mutations), no line is appended. If a
 * real change is detected, a new highest-version line is appended to
 * `meta-state.jsonl` via `trueAppendAtomic`; the original line is never
 * modified. Inline compaction (terminal entries older than 7 days) is removed
 * — Phase C ships `compact-registry.sh --full` as the canonical compaction
 * path. CAS via `_expected_version` is unchanged.
 *
 * Returns:
 *   - `true` if the patch produced a real change and a line was appended
 *   - `true` if the patch was a no-op (canonical-equal) — semantic no-op success
 *   - `null` if the entry id was not found
 *   - `"version_mismatch"` if CAS check fails
 *   - `"validation_failed"` if the patch fails schema validation
 *   - `"immutable_field"` if the wrapper rejects the patch
 */
export function updateEntry(root, id, patch) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      let found = false;
      let currentVersion = 0;
      let existingEntry = null;

      // Check id exists before any mutation. readRegistry returns the
      // max-version line per id (Phase A projection); this is the canonical
      // "existing" entry for the short-circuit compare.
      for (const entry of entries) {
        if (entry.id === id) {
          found = true;
          currentVersion = entry.version ?? 0;
          existingEntry = entry;
          break;
        }
      }
      if (!found) return null;
      // Core-layer immutability guard: change-log entries are NEVER mutated
      // in place — that's what makes `merge=union` safe on change-log.jsonl.
      // Reject the update BEFORE any other validation or mutation runs.
      // Handler-level guards exist on resolve/patch tools; this guard catches
      // direct core callers (e.g. fix-loop-design-refs.mjs) that bypass handlers.
      if (existingEntry.entry_kind === "change-log") {
        throw new Error("change_log_immutable: change-log entries cannot be updated in place");
      }

      const patchValidation = metaStateEntryPatchSchema.safeParse(patch);
      if (!patchValidation.success) {
        return "validation_failed";
      }

      // Plan 260712-0724 (Implementation 3): Fix B's `delete cleanPatch.entry_kind`
      // defense runs FIRST so the wrapper sees a patch that has already been
      // sanitized.
      const preStripPatch = { ...patch };
      delete preStripPatch.entry_kind;

      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // pre-state-only wrapper on the post-Fix-B patch.
      const invariantResult = await assertinvariant(
        () => Promise.resolve({ ok: true }),
        {
          accept: {
            context: () => ({ existing: existingEntry, patch: preStripPatch }),
            check: ({ existing, patch: p }) =>
              !("entry_kind" in p) || p.entry_kind === existing.entry_kind,
          },
          returnOnFail: {
            reason_code: "entry_kind_immutable_via_patch",
            id,
            from_kind: existingEntry.entry_kind,
          },
          root,
        }
      );
      if (!invariantResult.ok) {
        return "immutable_field";
      }

      // CAS check
      if ("_expected_version" in patch) {
        if (currentVersion !== patch._expected_version) {
          return "version_mismatch";
        }
      }

      // Compute patched entry on a copy so the existing entry (the projection's
      // canonical "current" line) stays unmodified. Strip the CAS + identity
      // fields from the patch before applying.
      const cleanPatch = { ...patch };
      delete cleanPatch._expected_version;
      delete cleanPatch.__proto__;    // .strict() does NOT reject __proto__ via JSON.parse
      delete cleanPatch.constructor;  // defense-in-depth
      delete cleanPatch.entry_kind;   // identity invariant — never patchable

      // Phase B H9 precondition: applyDefaults before canonicalize so legacy
      // entries lacking schema-defaulted fields canonicalize identically to
      // post-default reads.
      const patched = withDefaults({ ...existingEntry, ...cleanPatch });

      // Plan 260716-1101 Tier 2 Phase B: NO-OP SHORT-CIRCUIT. Resolves
      // meta-260715T2311Z-gratuitous-mutations (a no-op update previously
      // bumped the version and forced a full rewrite). The canonical
      // comparator is sorted-keys + set-semantics on arrays so reordering a
      // multi-element array doesn't falsely trigger a bump.
      if (entriesEqual(patched, existingEntry)) {
        return true; // no append, no version bump, no file change
      }

      // Real change detected: append a new highest-version line.
      const newVersion = currentVersion + 1;
      const newEntry = { ...patched, version: newVersion };
      trueAppendAtomicRaw(root, getRegistryPath(root), newEntry);
      invalidateCache(root);
      return true;
    })
  );
}

/**
 * Atomically archive an entry by id. Plan 260716-1101 Tier 2 Phase B:
 * true-append an archived tombstone line with `tombstone_kind: "archive"`.
 * The original line is never modified. The projection's
 * last-wins-by-max-version picks the tombstone line for the id; the
 * `meta_state_list` tool layer filters `status: "archived"` from the
 * default response (the projection alone returns the max-version entry;
 * the list-tool layer applies the filter — see
 * tools/learning-loop-mastra/tools/handlers/meta-state-list-tool.js).
 *
 * Tombstone fields: status, archived_at, archived_by, archived_reason,
 * tombstone_kind (the discriminator — see RT H6). The
 * `archived_reason` is the user-supplied free-form string; the
 * `tombstone_kind` discriminator is the canonical enum used by all
 * post-Phase-B reads.
 */
export function archiveEntry(root, id, reason, archivedBy) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { archived: false, reason: "not_found", id };
      // Core-layer immutability guard: change-log entries are NEVER archived.
      if (entries[idx].entry_kind === "change-log") {
        throw new Error("change_log_immutable: change-log entries cannot be archived");
      }
      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // wrapper enforces the already-archived pre-condition.
      if (!(await assertNotArchived(entries, idx, root, id))) {
        return { archived: false, reason: "already_archived", id };
      }
      const archivedAt = new Date().toISOString();
      const existingEntry = entries[idx];
      const currentVersion = existingEntry.version ?? 0;
      const tombstone = {
        ...existingEntry,
        status: "archived",
        archived_at: archivedAt,
        archived_by: archivedBy,
        archived_reason: reason,
        tombstone_kind: "archive",
        version: currentVersion + 1,
      };
      trueAppendAtomicRaw(root, getRegistryPath(root), tombstone);
      invalidateCache(root);
      return { archived: true, id, archived_at: archivedAt };
    })
  );
}

/**
 * Atomically delete an entry by id (soft CRUD enforcement).
 *
 * Plan 260716-1101 Tier 2 Phase B: hard-delete is GONE (union-safety forbids
 * line removal — `merge=union` keeps every line from both sides; removing a
 * line on one side and not the other is a conflict, not a delete). The
 * delete operation now appends a tombstone with `tombstone_kind: "delete"`
 * (the discriminator that distinguishes "user requested delete" from
 * "operator archived"). The projection's last-wins-by-max-version picks the
 * tombstone; the list-tool layer hides it.
 *
 * Backward-compat: pre-Phase-B callers expecting `entries.splice(idx, 1)`
 * behavior see the projection hide the tombstone. The pre-batch byte-snapshot
 * rollback discipline still works (we capture file bytes pre-batch, not
 * registry shape).
 */
export function deleteEntry(root, id, reason) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const targetEntry = entries.find((e) => e.id === id);
      if (!targetEntry) return { deleted: false, reason: "not_found", id };
      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // wrapper enforces the change-log-immutability pre-condition.
      const invariantResult = await assertinvariant(
        () => Promise.resolve({ ok: true }),
        {
          accept: {
            context: () => targetEntry,
            check: (e) => e.entry_kind !== "change-log",
          },
          returnOnFail: {
            reason_code: "change_log_immutable",
            entry_kind: targetEntry.entry_kind,
            id,
          },
          root,
        }
      );
      if (!invariantResult.ok) {
        return { deleted: false, reason: "change_log_immutable", id };
      }
      const archivedAt = new Date().toISOString();
      const currentVersion = targetEntry.version ?? 0;
      // RT H6 discriminator: tombstone_kind:"delete" distinguishes from
      // tombstone_kind:"archive" emitted by archiveEntry.
      const tombstone = {
        ...targetEntry,
        status: "archived",
        archived_at: archivedAt,
        archived_by: "operator",
        archived_reason: `deleted: ${reason || "no reason given"}`,
        tombstone_kind: "delete",
        version: currentVersion + 1,
      };
      trueAppendAtomicRaw(root, getRegistryPath(root), tombstone);
      invalidateCache(root);
      return { deleted: true, id };
    })
  );
}

/**
 * Atomically mark a loop-design entry as shipped (status: active → inactive)
 * and stamp the lifecycle signals. Closes Implementation 3 Gap #1: no MCP tool
 * could previously flip loop-design status because meta_state_patch omits
 * status from the loop-design patch projection (buildPatchSchemaFor) and
 * IMMUTABLE_PATCH_FIELDS blocks status on the batch update path.
 *
 * This helper is the single source of truth for loop-design ship semantics:
 * - Acquires the registry lock (cross-process race safe)
 * - Validates entry_kind === "loop-design" (rejects findings, rules, change-logs)
 * - Validates current status === "active" (idempotent — already-shipped is a no-op)
 * - Stamps status + shipped_in_plan + shipped_at atomically
 * - Bumps the version field (CAS-friendly for callers)
 *
 * @param {string} root
 * @param {string} id
 * @param {string} plan - plan id (e.g., "260712-0724-assertinvariant-universal-primitive")
 * @param {number} [expectedVersion] - optional CAS version
 * @returns {Promise<{shipped: true, id, status, shipped_in_plan, shipped_at} | {shipped: false, reason, ...}>}
 */
export function shipLoopDesign(root, id, plan, expectedVersion) {
  return enqueue(root, () =>
    withRegistryLock(root, () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { shipped: false, reason: "not_found", id };
      const entry = entries[idx];
      if (entry.entry_kind !== "loop-design") {
        return { shipped: false, reason: "not_a_loop_design", id, entry_kind: entry.entry_kind };
      }
      const currentVersion = entry.version ?? 0;
      if (expectedVersion !== undefined && currentVersion !== expectedVersion) {
        return { shipped: false, reason: "version_mismatch", id, current_version: currentVersion };
      }
      // Idempotent: already-shipped loop-design returns shipped:false with
      // reason:"already_shipped" so callers can distinguish from a no-op success.
      if (entry.status === "inactive") {
        return {
          shipped: false,
          reason: "already_shipped",
          id,
          shipped_in_plan: entry.shipped_in_plan,
          shipped_at: entry.shipped_at,
        };
      }
      if (entry.status !== "active") {
        return { shipped: false, reason: "invalid_status", id, current_status: entry.status };
      }
      const shippedAt = new Date().toISOString();
      // Plan 260716-1101 Tier 2 Phase B: true-append (no full rewrite).
      // The shipped line becomes the new max-version per Phase A projection.
      const tombstone = {
        ...entry,
        status: "inactive",
        shipped_in_plan: plan,
        shipped_at: shippedAt,
        version: currentVersion + 1,
      };
      trueAppendAtomicRaw(root, getRegistryPath(root), tombstone);
      invalidateCache(root);
      return {
        shipped: true,
        id,
        status: "inactive",
        shipped_in_plan: plan,
        shipped_at: shippedAt,
        version: currentVersion + 1,
      };
    })
  );
}

const BATCH_OP_TYPES = new Set(["write", "update", "delete", "archive"]);
// Plan 260711-0030 Phase 1: BATCH_SIZE_LIMIT reduced from 500 → 100 so that
// worst-case batch fits inside the registry-lock's `stale: 30000` window on
// slow disks (Finding 12). Larger batches risk lock-stealing by concurrent
// processes that observe a >30s-old lock. Operators can still override via
// META_STATE_BATCH_LIMIT env var.
// Plan 260712-0300 Phase 2: removed local definition in favor of importing
// from core/constants.js (single source of truth; 500-vs-100 default divergence fixed).

/**
 * Atomically apply a batch of meta-state operations.
 * All-or-nothing rollback on any failure. Single cache invalidation.
 *
 * Plan 260716-1101 Tier 2 Phase B: true-append per op. Each mutation op
 * (`update`/`archive`/`delete`) appends a new highest-version line to
 * `meta-state.jsonl` instead of mutating-in-place + full-rewrite. The
 * no-op short-circuit (canonical comparator) drops updates that produce
 * no field change. `case "delete"` now routes through `deleteEntry` —
 * the splice is replaced by an `archived` tombstone append with
 * `tombstone_kind: "delete"`. Change-log writes still true-append to
 * `change-log.jsonl`.
 *
 * The all-or-nothing rollback discipline is preserved: ops are validated
 * one-by-one, building `pendingMetaStateAppends` and `pendingChangeLogAppends`
 *; if any op throws we restore `preBatchContent` byte-for-byte and return
 * failure. Applies happen AFTER all validations succeed.
 *
 * Plan 260712-0300 Phase 2: optional `envelope` argument. When present, after a
 * successful batch, an envelope-annotated change-log entry is auto-emitted with
 * pre_count/post_count computed from the registry before/after the batch and
 * content_hash = SHA-256(kind + target + canonical op-list + entry-id-set).
 */
export function metaStateBatch(root, operations, envelope) {
  if (!Array.isArray(operations)) {
    return Promise.resolve({ applied: 0, failed_at: 0, reason: "operations_not_array" });
  }
  if (operations.length > BATCH_SIZE_LIMIT) {
    return Promise.resolve({ applied: 0, failed_at: 0, reason: "batch_size_exceeded", limit: BATCH_SIZE_LIMIT });
  }
  return enqueue(root, async () =>
    withRegistryLock(root, async () => {
      const path = getRegistryPath(root);
      const preBatchContent = existsSync(path) ? readFileSync(path, "utf8") : "";

      const entries = readRegistry(root);
      // Phase B: pendingMetaStateAppends collects one new versioned line per
      // mutation op (no in-place mutation, no full rewrite). Applies happen
      // AFTER all ops validate; on failure the byte-snapshot rollback restores
      // the pre-batch file.
      //
      // IMPORTANT: each queued append is ALSO reflected into `entries[]` so
      // subsequent ops in the same batch see the post-mutation state (the
      // projection view, not the disk file). Without this, an op that
      // creates-then-patches an entry in the same batch would fail at the
      // lookup step.
      const pendingMetaStateAppends = [];
      // change-log writes (op:"write" with entry_kind=change-log) — true-append
      // to change-log.jsonl after all validations succeed. Queueing prevents
      // orphan change-logs on mid-batch failure.
      const pendingChangeLogAppends = [];
      // Plan 260712-0300 Phase 2: snapshot the registry BEFORE the batch so
      // the envelope's pre_count reflects actual pre-batch state.
      const preRegistrySnapshot = envelope
        ? entries.map((e) => ({ id: e.id, status: e.status, entry_kind: e.entry_kind }))
        : null;
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        if (!BATCH_OP_TYPES.has(op.op)) {
          if (preBatchContent) {
            writeFileSync(path, preBatchContent, "utf8");
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
          invalidateCache(root);
          return { applied: i, failed_at: i, reason: "unknown_op_type", op_type: op.op };
        }
        try {
          switch (op.op) {
            case "write": {
              // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
              // wrapper at the batch write-op boundary.
              const writeInvariant = await assertinvariant(
                () => Promise.resolve({ ok: true }),
                {
                  accept: {
                    context: () => op.entry,
                    check: (e) =>
                      !(e && e.entry_kind === "change-log" && e.operation_envelope !== undefined),
                  },
                  returnOnFail: {
                    reason_code: "caller_supplied_envelope_on_change_log",
                    entry_kind: "change-log",
                  },
                  root,
                }
              );
              if (!writeInvariant.ok) {
                const err = new Error("immutable_field");
                err.denied_fields = ["operation_envelope"];
                throw err;
              }

              const validation = metaStateEntrySchema.safeParse(op.entry);
              if (!validation.success) throw new Error("validation_failed");
              // Plan 260715-0801 Tier 1 Phase 2: dispatch change-log writes
              // to change-log.jsonl (true-append). Queue them here; append
              // happens AFTER the table persist so a mid-batch failure
              // doesn't leave orphan change-logs behind.
              if (validation.data.entry_kind === "change-log") {
                pendingChangeLogAppends.push(validation.data);
              } else {
                // Phase B: new entries start at version 0; the projection
                // dedupes to max-version per id. Also reflect into entries[]
                // so subsequent ops in the same batch see the new state.
                const versionedEntry = { ...validation.data, version: validation.data.version ?? 0 };
                pendingMetaStateAppends.push(versionedEntry);
                entries.push(versionedEntry);
              }
              break;
            }
            case "update": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              if (op._expected_version !== undefined) {
                const current = entries[idx].version ?? 0;
                if (current !== op._expected_version) throw new Error("version_mismatch");
              }
              // Change-log immutability guard.
              if (!(await assertNotChangeLog(entries, idx, root, op.id))) {
                throw new Error("change_log_immutable");
              }
              // Strip op discriminator + lookup id + CAS version before checking
              // the deny-list and applying.
              const { op: _op, id: _id, _expected_version, ...patch } = op;
              const updateInvariant = await assertinvariant(
                () => Promise.resolve({ ok: true }),
                {
                  accept: {
                    context: () => ({ existing: entries[idx], patch }),
                    check: ({ existing, patch: p }) =>
                      !("entry_kind" in p) || p.entry_kind === existing.entry_kind,
                  },
                  returnOnFail: {
                    reason_code: "entry_kind_immutable_via_patch",
                    id: op.id,
                  },
                  root,
                }
              );
              if (!updateInvariant.ok) {
                const err = new Error("immutable_field");
                err.denied_fields = ["entry_kind"];
                throw err;
              }
              // Enforce IMMUTABLE_PATCH_FIELDS deny-list.
              const denied = Object.keys(patch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
              if (denied.length > 0) {
                const err = new Error("immutable_field");
                err.denied_fields = denied;
                throw err;
              }
              // Phase B: compute patched entry on a copy; canonical-comparator
              // short-circuit drops no-op updates; otherwise queue the new
              // highest-version line for true-append AND reflect into entries[]
              // so subsequent ops in the same batch see the new state.
              const existingEntry = entries[idx];
              const cleanPatch = { ...patch };
              delete cleanPatch.__proto__;
              delete cleanPatch.constructor;
              delete cleanPatch.entry_kind;
              const patched = withDefaults({ ...existingEntry, ...cleanPatch });
              if (!entriesEqual(patched, existingEntry)) {
                const newEntry = {
                  ...patched,
                  version: (existingEntry.version ?? 0) + 1,
                };
                pendingMetaStateAppends.push(newEntry);
                // Replace the in-memory entries[] entry so subsequent ops
                // see the new max-version (the projection picks the
                // max-version line per id).
                entries[idx] = newEntry;
              }
              break;
            }
            case "delete": {
              // Phase B (RT H3): case "delete" now routes through deleteEntry —
              // appends an archived tombstone with tombstone_kind: "delete".
              // The function splice is gone; the tombstone is the audit-visible
              // record. Pre-batch byte-snapshot rollback still works (we
              // capture file bytes, not registry shape).
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              if (!(await assertNotChangeLog(entries, idx, root, op.id))) {
                throw new Error("change_log_immutable");
              }
              const targetEntry = entries[idx];
              const archivedAt = new Date().toISOString();
              const deleteTombstone = {
                ...targetEntry,
                status: "archived",
                archived_at: archivedAt,
                archived_by: op.archived_by ?? "operator",
                archived_reason: `deleted: ${op.reason ?? "no reason given"}`,
                tombstone_kind: "delete",
                version: (targetEntry.version ?? 0) + 1,
              };
              pendingMetaStateAppends.push(deleteTombstone);
              // Reflect into entries[] for subsequent ops (the tombstone
              // becomes the max-version line per id).
              entries[idx] = deleteTombstone;
              break;
            }
            case "archive": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              if (!(await assertNotArchived(entries, idx, root, op.id))) {
                const err = new Error("already_archived");
                throw err;
              }
              const existingEntry = entries[idx];
              const archiveTombstone = {
                ...existingEntry,
                status: "archived",
                archived_at: new Date().toISOString(),
                archived_by: op.archived_by ?? "operator",
                archived_reason: op.reason ?? "batch_archive",
                tombstone_kind: "archive",
                version: (existingEntry.version ?? 0) + 1,
              };
              pendingMetaStateAppends.push(archiveTombstone);
              entries[idx] = archiveTombstone;
              break;
            }
          }
        } catch (err) {
          // Rollback: restore pre-batch byte content. We haven't appended
          // anything yet (the apply happens AFTER the loop), so this is a
          // no-op restore (the file is unchanged) — but it clears any stale
          // cache state.
          if (preBatchContent) {
            writeFileSync(path, preBatchContent, "utf8");
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
          invalidateCache(root);
          const extra = {};
          if (err.denied_fields) extra.denied_fields = err.denied_fields;
          return { applied: 0, failed_at: i, reason: err.message, op, ...extra };
        }
      }

      // Plan 260712-0300 Phase 2: build the envelope-annotated change-log entry
      // AFTER all ops validate (so a mid-batch throw doesn't leak an auto-emit).
      let autoEmitId = null;
      let autoEmitEntry = null;
      if (envelope) {
        // Compute postRegistrySnapshot from in-memory entries (mutated
        // in-place for the in-memory view). For Phase B true-append the
        // post-state is still derivable from entries[].
        const postRegistrySnapshot = entries.map((e) => ({
          id: e.id,
          status: e.status,
          entry_kind: e.entry_kind,
        }));
        const builtEnvelope = buildEnvelope({
          kind: envelope.kind,
          target: envelope.target,
          ops: operations,
          preRegistry: preRegistrySnapshot,
          postRegistry: postRegistrySnapshot,
        });
        autoEmitId = `meta-${new Date().toISOString().replace(/[-:.]/g, "")}-${Math.random().toString(16).slice(2, 8)}`;
        if (entries.some((e) => e.id === autoEmitId)) {
          const err = new Error("auto_emit_id_collision");
          err.id = autoEmitId;
          throw err;
        }
        autoEmitEntry = {
          id: autoEmitId,
          entry_kind: "change-log",
          change_dimension: "mechanical",
          change_target: envelope.target,
          change_diff: { added: [], removed: [], changed: [] },
          reason: "Auto-emitted by meta_state_batch envelope pass-through (plan 260712-0300; loop-design-operation-envelope-on-change-log).",
          operation_envelope: builtEnvelope,
          status: "active",
          created_at: new Date().toISOString(),
          version: 0,
        };
      }

      // Phase B: APPLY the queued appends. If any throw (e.g. fsync failure
      // mid-append), rollback to preBatchContent. Since we fsync'd each append
      // individually, the partial state is `preBatchContent + some appends`;
      // we truncate to preBatchContent on failure.
      try {
        for (const entry of pendingMetaStateAppends) {
          trueAppendAtomicRaw(root, path, entry);
        }
      } catch (err) {
        restorePreBatchContent(path, preBatchContent);
        invalidateCache(root);
        return { applied: 0, failed_at: null, reason: "append_failed", error: err.message };
      }

      // Phase B: true-append change-log writes (op:"write") AFTER the table
      // appends so the failure rollback can truncate cleanly. If any change-log
      // append throws (e.g. fsync failure, ENOSPC), rollback the table to
      // preBatchContent — preserves the all-or-nothing contract.
      try {
        for (const cl of pendingChangeLogAppends) {
          appendChangeLogEntryAtomic(root, cl);
        }
      } catch (err) {
        restorePreBatchContent(path, preBatchContent);
        invalidateCache(root);
        return { applied: 0, failed_at: null, reason: "change_log_append_failed", error: err.message };
      }

      // Plan 260712-0300 Phase 2: auto-emit routes through
      // appendChangeLogEntryAtomic (true-append to change-log.jsonl). Same
      // rollback discipline: a failed auto-emit truncates both table + change-log.
      if (autoEmitEntry) {
        try {
          appendChangeLogEntryAtomic(root, autoEmitEntry);
        } catch (err) {
          restorePreBatchContent(path, preBatchContent);
          // Note: pendingChangeLogAppends already landed in change-log.jsonl.
          // We can't roll those back without a snapshot of that file too; the
          // assertWriteVisible check below detects this case via
          // `change_log_not_visible` and reports it as a structured failure.
          invalidateCache(root);
          return { applied: 0, failed_at: null, reason: "auto_emit_append_failed", error: err.message };
        }
      }

      invalidateCache(root);

      // Plan 260712-0300 Phase 2 (red-team finding 1): assertWriteVisible after
      // the writes complete.
      const allExpectedChangeLogIds = (envelope && autoEmitId ? [autoEmitId] : [])
        .concat(pendingChangeLogAppends.map((cl) => cl.id));
      if (allExpectedChangeLogIds.length > 0) {
        const freshEntries = readRegistry(root);
        const missing = allExpectedChangeLogIds.find(
          (id) => !freshEntries.find((e) => e.id === id),
        );
        if (missing) {
          if (preBatchContent) {
            writeFileSync(path, preBatchContent, "utf8");
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
          invalidateCache(root);
          return { applied: 0, failed_at: null, reason: "change_log_not_visible", missing_id: missing };
        }
      }

      return { applied: operations.length, failed_at: null };
    })
  );
}

/**
 * Filter entries by optional criteria (category, status, affected_system, session_id).
 * All provided filters must match (AND logic).
 *
 * Plan 260707-0812 Phase 2: status filtering treats the canonical open set
 * (`open`) and the legacy open-equivalent set (`active`/`reported`/`stale`)
 * as a single bucket so consumers see a consistent open set pre-migration.
 * `status:"open"` returns entries where `isOpen(e)` is true; `status:"stale"`,
 * `status:"active"`, and `status:"reported"` still return legacy entries
 * pre-migration (backward compat until phase 4).
 */
export function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    if (filters.entry_kind && entry.entry_kind !== filters.entry_kind) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.session_id && entry.session_id !== filters.session_id) return false;
    if (filters.status && !matchesStatusFilter(entry, filters.status)) return false;
    if (filters.affected_system && entry.affected_system !== filters.affected_system) return false;
    return true;
  });
}

function matchesStatusFilter(entry, status) {
  if (entry.status === status) return true;
  // Backward-compat: legacy `stale`/`active`/`reported` map to `open` until
  // phase 4 migrates them. Pre-migration consumers see the consistent open set.
  if (status === "open" && (entry.status === "active" || entry.status === "reported" || entry.status === "stale")) {
    return true;
  }
  // After migration (or for clean registries) literal equality suffices.
  return false;
}

/**
 * Atomically claim a session-id-keyed finding entry.
 *
 * Under the existing per-root `enqueue` lock, reads the registry and checks
 * whether an active/reported finding already exists for the exact
 * (sessionId, subtype, runtime, layer) key. If yes, returns the existing
 * entry without writing. If no, calls `entryBuilder()` to produce a new
 * entry, validates it, appends it to the registry, and returns the new id.
 *
 * The `enqueue` lock is per-process. `pnpm test` and the cold-session test
 * are single-process, so this is sufficient. If multi-process testing is
 * ever introduced, wrap this in a file-system lock (e.g., `flock`).
 *
 * @param {string} root — project root containing meta-state.jsonl
 * @param {object} key — { sessionId, subtype, runtime, layer }
 * @param {function} entryBuilder — () => entry object (called only on claim success)
 * @returns {Promise<{claimed: true, id: string} | {claimed: false, existing: object}>>}
 */
export function tryClaimSessionId(root, key, entryBuilder) {
  return enqueue(root, () => {
    const entries = readRegistry(root);
    const match = entries.find((e) =>
      e.entry_kind === "finding"
      && e.session_id === key.sessionId
      && e.subtype === key.subtype
      && (e.status === "open" || e.status === "active" || e.status === "reported")
      && e.description.includes(`runtime: ${key.runtime}`)
      && e.description.includes(`layer: ${key.layer}`),
    );
    if (match) {
      return { claimed: false, existing: match };
    }

    const entry = entryBuilder();
    const validation = metaStateEntrySchema.safeParse(entry);
    if (!validation.success) {
      throw new InvalidEntryError(validation.error);
    }

    appendRegistryEntryAtomic(root, validation.data);
    return { claimed: true, id: entry.id };
  });
}

/**
 * Generate a meta-state entry id: meta-{YYMMDD}T{HHmm}Z-{slug}
 */
export function generateId(slug) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `meta-${yy}${mm}${dd}T${hh}${mi}Z-${slug}`;
}

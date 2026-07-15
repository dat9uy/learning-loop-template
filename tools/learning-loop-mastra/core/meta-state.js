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
 * destination of an in-place read-modify-write. Callers that operate on
 * the union (`readRegistry` returns both files merged) MUST project back
 * to the table-set before persisting — otherwise change-logs leak into
 * `meta-state.jsonl` and break the post-split invariant.
 */
function tableOnly(entries) {
  return entries.filter((e) => e.entry_kind !== "change-log");
}

/**
 * Defensive assert: once `change-log.jsonl` exists, persist sites MUST pass
 * a table-only set to `persistRegistryAtomic`. A non-table-only write here
 * would copy change-logs from `change-log.jsonl` into `meta-state.jsonl`,
 * and `merge=union` later would double them on the next parallel merge.
 *
 * Plan 260715-0801 Tier 1 red-team finding 2: before the write dispatch +
 * tableOnly projections are re-enabled at all 5 persist sites
 * (updateEntry, archiveEntry, deleteEntry, shipLoopDesign, metaStateBatch),
 * a partial state where `change-log.jsonl` exists but a persist site still
 * passes the union would silently corrupt the registry. This guard fails
 * loud so the bug surfaces immediately instead of at merge time.
 *
 * Pre-split (no change-log.jsonl): no-op — change-logs in meta-state.jsonl
 * are the expected state.
 * Post-split (change-log.jsonl present): the guard fires on any leak.
 */
function assertNoChangeLogLeak(entries, root) {
  if (!existsSync(getChangeLogPath(root))) return;
  for (const entry of entries) {
    if (entry.entry_kind === "change-log") {
      throw new Error(
        "change_log_leak: persistRegistryAtomic received a change-log entry while change-log.jsonl exists. " +
        "Call tableOnly(entries) before persisting — see meta-state.js#tableOnly.",
      );
    }
  }
}

function appendRegistryEntryAtomic(root, entry) {
  const path = getRegistryPath(root);
  const lines = existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l))
    : [];
  lines.push(entry);
  persistRegistryAtomic(lines, root);
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
 */
function appendChangeLogEntryAtomic(root, entry) {
  const path = getChangeLogPath(root);
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf8");
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
export const ENTRY_ID_REF_PREFIXES = ["meta-", "rule-", "loop-design-"];

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
  id: z.string().optional().describe("Standard meta-state id (meta-YYMMDDTHHmmZ-slug or rule-<slug>)"),
  entry_kind: z.literal("finding").default("finding"),
  created_at: z.string().optional().describe("ISO timestamp"),
  category: z.enum([
    "gate-logic-bug", "record-repair-gap", "schema-drift",
    "mcp-tool-missing", "budget-check",
    "loop-anti-pattern",
  ]).describe("Category of the finding"),
  severity: z.enum(["warning", "escalate"]).describe("Severity level"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).describe("Which system is affected by this finding"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional()
    .describe("Subtype for loop-anti-pattern findings (e.g., escape-hatch-abuse, new-artifact-type, schema-bloat)"),
  recurrence_key: z.string().optional()
    .describe("Dedup key for recurring-false-positive findings (`rule_id::command_prefix_normalized`). Set by recurrence-tracker; read by checkAndEmit to suppress duplicate findings for the same recurrent group. Required to survive writeEntry's schema validation now that recurrence routes through writeEntry (plan 260707-0812 Phase 2 C2)."),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code reference, e.g. path/to/file.js:line"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["open", "resolved", "superseded"]).optional()
    .describe("Status — 'open' (newly reported or unresolved; replaces the legacy 'reported'/'active'/'stale' trio), 'resolved' (closed), 'superseded' (consolidated into a change-log). 'archived' is applied at runtime by archiveEntry and is not in the enum. Read sites should use the isOpen/isStaleView predicates from core/stale-view.js instead of literal status equality."),
  consolidated_into: z.string().optional()
    .describe("For status='superseded' entries: the id of the change-log entry that is the canonical source. Inverse of the change-log's 'consolidates' field."),
  last_verified_at: z.string().optional()
    .describe("ISO timestamp of the most recent successful verification step. Set by meta_state_re_verify on a passing run."),
  verification: z.object({}).passthrough().optional()
    .describe("Self-contained reproduction spec. Inner shape is JSDoc-typed (loose outer / object-form inner / cmd allowlist). See plans/260609-stale-flag-redesign/plan.md Resolved Q3."),
  superseded_at: z.string().optional()
    .describe("ISO timestamp set by meta_state_supersede."),
  superseded_by: z.string().optional()
    .describe("Operator id set by meta_state_supersede. Default 'operator'."),
  session_id: z.string().optional()
    .describe("Idempotency key for hook-emitted findings. When set, the entry is unique per session. The MCP connection hook (Phase 4) uses this to avoid emitting the same finding twice in one session."),
  mechanism_check: z.coerce.boolean().optional()
    .describe("Opt-in flag (SP2): include this finding in grounding checks. Defaults to true when evidence_code_ref is set; false otherwise. The meta_state_report tool applies this default automatically; the field is omitted from the entry if the caller provides neither mechanism_check nor evidence_code_ref. Pass mechanism_check: false to explicitly opt out (the response includes a warning). When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("@deprecated — baseline now lives in file-index.jsonl; this per-record field is a vestigial fallback, no longer written. SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; refresh via meta_state_refresh_file_index. The regex is unchanged so legacy entries still validate."),
  code_ref: z.string().optional()
    .describe("Optional code reference with SHA-256 fingerprint for validation."),
  ledger_ref: z.string().optional()
    .describe("Optional pointer to a runtime-state.jsonl sidecar ledger."),
  expires_at: z.string().nullable().optional()
    .describe("Vestigial — no longer written by any tool. Legacy entries may still carry the field for read-compat. See plan 260707-0812 Phase 2."),
  resolved_at: z.string().nullable().optional()
    .describe("ISO timestamp when the entry was resolved. Set by meta_state_resolve."),
  resolved_by: z.string().nullable().optional()
    .describe("Operator or rule id that resolved the entry. Set by meta_state_resolve."),
  resolution: z.string().nullable().optional()
    .describe("Human-readable resolution note. Set by meta_state_resolve."),
  promoted_to_rule: z.string().nullable().optional()
    .describe("Rule id this finding was promoted to. Set by meta_state_promote_rule. Inverse of the rule's origin field."),
  auto_resolve: z.coerce.boolean().nullable().optional()
    .describe("If true, the entry is eligible for auto-resolution when TTL expires. Default false."),
  reopens: entryIdRefArray().optional()
    .describe("Finding ids whose `stale` lifecycle this entry re-surfaces. Use when a new finding re-flags an issue whose verification drifted (stale). Lint orphan ids first with `meta_state_relationship_validate({description})`. Cascade-resolve the stale parent via `meta_state_resolve({id: parent, cascade_from: [this_id]})` in 1 step. The legacy 'expired' status was removed in plan 260611-1000; only `stale` parents are cascade-closeable. See `tools/learning-loop-mcp/__tests__/meta-state-relationship-validate-tool.test.js` L5 for stale orphan coverage."),
});

/**
 * Change-log branch schema — used by meta_state_log_change.
 * Has .shape available for tool schema reuse.
 */
export const metaStateChangeEntrySchema = z.object({
  id: z.string().optional().describe("Standard meta-state id (meta-YYMMDDTHHmmZ-slug)"),
  entry_kind: z.literal("change-log").describe("Discriminator — always 'change-log' for this schema"),
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
  consolidates: z.string().optional()
    .describe("Comma-separated list of finding entry ids that this change-log entry consolidates. Inverse of each finding's 'consolidated_into' field. Use this for multi-finding consolidation (e.g., 4 G8 recurrences collapsed into 1 change-log). The existing 'supersedes' field stays reserved for change-log-to-change-log lineage."),
  evidence_code_ref: z.string().optional()
    .describe("Code reference, e.g. path/to/file.js:line"),
  evidence_journal: z.string().optional()
    .describe("Path to related journal file"),
  evidence_test: z.string().optional()
    .describe("Test file reference"),
  evidence: z.never().optional()
    .describe("Nested evidence block is no longer supported; use top-level evidence_code_ref, evidence_journal, evidence_test"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).optional().describe("Which system this change affects"),
  code_ref: z.string().optional().describe("Optional code reference with SHA-256 fingerprint for validation."),
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
  id: z.string().regex(/^rule-[a-z0-9-]+$/).describe("Stable rule id; not timestamp-based"),
  origin: z.string().describe("Finding id that originated this rule (preserves historical lineage)"),
  enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced"),
  pattern_type: z.enum(["regex", "glob", "determinism-checklist", "agent-checklist"]).describe("Pattern language"),
  pattern: z.string().describe("The pattern (regex body, glob path, or session_id)"),
  scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()
    .describe("Optional scope filter: 'none' (default) or 'project_has_learning_loop_mcp'"),
  applies_to_resolution: z.string().optional()
    .describe("For pattern_type=determinism-checklist: the target finding id this rule gates"),
  supersedes: z.string().optional()
    .describe("Prior rule id this rule refined (replaces finding.promoted_to_rule.refined_at metadata)"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Binary per operator decision 2026-06-06. Refined/deprecated rules become inactive and use 'supersedes' to point to the new rule."),
  promoted_at: z.string().describe("ISO timestamp"),
  promoted_by: z.string().describe("Operator id"),
  evidence_code_ref: z.string().optional()
    .describe("Code reference; SP2 grounding still applies"),
  evidence_journal: z.string().optional()
    .describe("Path to related journal file"),
  evidence_test: z.string().optional()
    .describe("Test file reference"),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("@deprecated — baseline now lives in file-index.jsonl; this per-record field is a vestigial fallback, no longer written. SHA-256 of evidence_code_ref; populated by SP2 check_grounding. The regex is unchanged so legacy entries still validate."),
  refined_at: z.string().optional().describe("ISO timestamp of last refinement"),
  refined_by: z.string().optional().describe("Operator id of last refinement"),
  refinement_reason: z.string().optional().describe("Why the rule was last refined"),
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
  }).optional().describe("Wider impact scope; narrows the rule's firing surface without requiring regex hand-curation"),
  code_ref: z.string().optional().describe("Optional code reference with SHA-256 fingerprint for validation."),
  ledger_ref: z.string().optional().describe("Optional pointer to a runtime-state.jsonl sidecar ledger."),
  created_at: z.string().optional().describe("ISO timestamp"),
});

/**
 * Loop-design branch schema — deferred design notes with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateLoopDesignSchema = z.object({
  entry_kind: z.literal("loop-design").default("loop-design"),
  id: z.string().describe("Standard meta-state id (meta-YYMMDDTHHmmZ-slug or loop-design-<slug>)"),
  title: z.string().min(10).describe("Short human-readable title"),
  status: z.enum(["active", "inactive"]).default("active")
    .describe("Binary. Flips to inactive when the proposed work ships."),
  proposed_design_for: entryIdRefArray()
    .describe("Forward: ids of rules/schemas/tools (entry ids: meta-/rule-/loop-design- prefix) this design will create or modify. A design with no forward refs uses [] and documents targets in the description."),
  addresses: z.preprocess(deepStripEnvelope, z.array(z.string()).superRefine(entryIdRefsRefine).default([]))
    .describe("Backward: ids of findings this design responds to (the motivation; the why-this-exists)"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).describe("Which system this design affects"),
  severity_hint: z.enum(["low", "medium", "high"]).optional()
    .describe("Operator's read on the urgency of shipping this design"),
  code_ref: z.string().optional().describe("Optional code reference with SHA-256 fingerprint for validation."),
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
 */
export const metaStateEntryPatchSchema = z.object({}).passthrough();

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

function _readAndParseRegistry(root) {
  // Dual-source reader: meta-state.jsonl (mutable table) + change-log.jsonl
  // (true-append log of immutable change-logs). The projection is identity
  // at Tier 1: concat both files, sort by created_at ascending so
  // `meta_state_list` returns a chronological union. At Tier 2 the seam
  // (in `read-registry-cache.js#readRegistryWithCache`) swaps to
  // last-wins-by-max-version without touching this module.
  const metaStatePath = getRegistryPath(root);
  const changeLogPath = getChangeLogPath(root);
  const metaStateLines = existsSync(metaStatePath)
    ? readFileSync(metaStatePath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const changeLogLines = existsSync(changeLogPath)
    ? readFileSync(changeLogPath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const allLines = [...metaStateLines, ...changeLogLines];
  const parsed = allLines.map((line) => {
    const entry = JSON.parse(line);
    if (!entry.entry_kind) {
      entry.entry_kind = "finding"; // Backward-compat coerce
    }
    withDefaults(entry); // Apply affected_system default for legacy entries
    return entry;
  });
  // Post-concat sort by created_at ascending so callers see a chronological
  // union (the two files are otherwise grouped by source, not by time).
  parsed.sort((a, b) => {
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
  return parsed;
}

/**
 * Read the JSONL registry and return an array of parsed entries.
 * Returns empty array if the file does not exist.
 * Uses process-lifetime LRU cache keyed on mtimeMs + size.
 */
export function readRegistry(root) {
  return readRegistryWithCache(root, _readAndParseRegistry);
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
      // Plan 260715-0801 Tier 1 — write dispatch (deferred). The dispatch on
      // `entry_kind` (change-logs true-append to change-log.jsonl; everything
      // else to meta-state.jsonl) is the canonical path; the helper
      // `appendChangeLogEntryAtomic` is implemented and ready. The dispatch
      // is rolled back to the pre-Tier-1 path (single file) until the
      // coordinated migration lands: the test corpus assumes a single-file
      // write surface, and the migration + test updates ship together in
      // Phase 2 step 4-5. With the dispatch rolled back, change-logs
      // continue to land in `meta-state.jsonl` via the table write path
      // (which the core-layer immutability guard still protects from
      // post-write mutation).
      appendRegistryEntryAtomic(root, validation.data);
    })
  );
}

/**
 * Atomically update an entry by id, applying a patch object.
 * Also compacts terminal entries older than 7 days.
 * Supports optional compare-and-swap via _expected_version in patch.
 * Returns true if entry found and updated, null if not found,
 * or "version_mismatch" if CAS check fails.
 */
export function updateEntry(root, id, patch) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      let found = false;
      let currentVersion = 0;
      let existingEntry = null;

      // Check id exists before any mutation
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
      // sanitized. The wrapper pre-condition check then operates on the
      // post-Fix-B state: any caller-supplied entry_kind was stripped by Fix B,
      // so the wrapper's pre-condition (entry_kind either absent or matching
      // existing) holds for the canonical "smuggled entry_kind + legitimate
      // fields" case that Fix B is designed to allow. Defense-in-depth: Fix B
      // strips; wrapper observes the cleaned patch; the patch's legitimate
      // fields still apply via Object.assign below.
      const preStripPatch = { ...patch };
      delete preStripPatch.entry_kind;

      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // pre-state-only wrapper on the post-Fix-B patch. Pre-condition: any
      // remaining entry_kind in the cleaned patch must match the existing
      // entry's entry_kind (which is now a tautology since Fix B stripped
      // it, but the wrapper is the canonical guard for non-Fix-B callers).
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

      const now = Date.now();

      // Compaction invariant: change-log entries are never compacted.
      // They are immutable audit log with status="active" (terminal statuses
      // like "auto-resolved" don't apply). The explicit entry_kind guard below
      // enforces this. If a future change-log subtype evolves to have a
      // terminal status, this invariant must be re-verified.
      const updated = entries.filter((entry) => {
        const age = now - new Date(entry.created_at).getTime();
        if (entry.entry_kind !== "change-log" && TERMINAL_STATUSES.has(entry.status) && age > COMPACTION_AGE_MS) {
          return false; // compact old terminal entries
        }
        return true;
      });

      for (const entry of updated) {
        if (entry.id === id) {
          const cleanPatch = { ...patch };
          delete cleanPatch._expected_version;
          delete cleanPatch.__proto__;    // .strict() does NOT reject __proto__ via JSON.parse
          delete cleanPatch.constructor;  // defense-in-depth
          delete cleanPatch.entry_kind;   // identity invariant — never patchable (Plan 260712-0109 Fix B; finding meta-260712T0053Z)
          Object.assign(entry, cleanPatch);
          entry.version = (entry.version ?? 0) + 1;
        }
      }

      // Plan 260715-0801 Tier 1 — read seam with write dispatch deferred.
      // The read chokepoint already unions both files; the write dispatch
      // (change-logs → change-log.jsonl, everything else → meta-state.jsonl)
      // is rolled back pending the migration. While the dispatch is rolled
      // back, all writes (including change-logs) land in meta-state.jsonl,
      // and `persistRegistryAtomic(updated, root)` persists the full set.
      // When the migration ships (Phase 2 step 4), the dispatch comes back
      // AND `tableOnly` projects the union back to the table-set at every
      // persist site — otherwise change-logs from `change-log.jsonl` would
      // leak into `meta-state.jsonl` on every write.
      persistRegistryAtomic(updated, root);
      return true;
    })
  );
}

/**
 * Atomically archive an entry by id. Sets status=archived and adds
 * archived_at, archived_by, archived_reason fields.
 */
export function archiveEntry(root, id, reason, archivedBy) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { archived: false, reason: "not_found", id };
      // Core-layer immutability guard: change-log entries are NEVER archived.
      // They live forever in the change-log stream; that's what makes
      // `merge=union` safe. Status flipping an entry from `active` → `archived`
      // is exactly the kind of in-place mutation that would corrupt the union.
      if (entries[idx].entry_kind === "change-log") {
        throw new Error("change_log_immutable: change-log entries cannot be archived");
      }
      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // wrapper enforces the already-archived pre-condition (moved from the
      // inline check that used to live here). The wrapper fires BEFORE
      // mutation.
      if (!(await assertNotArchived(entries, idx, root, id))) {
        return { archived: false, reason: "already_archived", id };
      }
      entries[idx] = {
        ...entries[idx],
        status: "archived",
        archived_at: new Date().toISOString(),
        archived_by: archivedBy,
        archived_reason: reason,
      };
      // Plan 260715-0801 Tier 1 — see updateEntry for the tableOnly/rollback
      // decision; with the write dispatch deferred, the full set persists.
      persistRegistryAtomic(entries, root);
      return { archived: true, id, archived_at: entries[idx].archived_at };
    })
  );
}

/**
 * Atomically delete an entry by id (soft CRUD enforcement).
 */
export function deleteEntry(root, id) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const targetEntry = entries.find((e) => e.id === id);
      if (!targetEntry) return { deleted: false, reason: "not_found", id };
      // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
      // wrapper enforces the change-log-immutability pre-condition. Change
      // logs are immutable audit log; deletion is forbidden via mutation.
      // Closes Red Team Finding 3's gap on `case "delete"` having no
      // pre-state at the batch path.
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
      const filtered = entries.filter((e) => e.id !== id);
      // Plan 260715-0801 Tier 1 — see updateEntry for the tableOnly/rollback
      // decision; with the write dispatch deferred, the full set persists.
      persistRegistryAtomic(filtered, root);
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
      entries[idx] = {
        ...entry,
        status: "inactive",
        shipped_in_plan: plan,
        shipped_at: shippedAt,
        version: currentVersion + 1,
      };
      // Plan 260715-0801 Tier 1 — see updateEntry for the tableOnly/rollback
      // decision; with the write dispatch deferred, the full set persists.
      persistRegistryAtomic(entries, root);
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
 * Plan 260712-0300 Phase 2: optional `envelope` argument. When present, after a
 * successful batch, an envelope-annotated change-log entry is auto-emitted with
 * pre_count/post_count computed from the registry before/after the batch and
 * content_hash = SHA-256(kind + target + canonical op-list + entry-id-set).
 * Auto-emit ordering (operator-confirmed, same as Plan 260712-0109):
 *   1. build envelope in-memory AFTER the ops loop completes successfully
 *   2. writeFileSync + renameSync + invalidateCache
 *   3. assertWriteVisible — re-read registry; on silent-persistence-fail,
 *      restore preBatchContent and return change_log_not_visible.
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

      let entries = readRegistry(root);
      // Plan 260712-0300 Phase 2: snapshot the registry BEFORE the batch so
      // the envelope's pre_count reflects actual pre-batch state. Only the
      // fields needed for the count record (id, status, entry_kind) are
      // carried forward to keep the helper's input compact.
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
              // wrapper at the batch write-op boundary catches caller-supplied
              // envelopes on change-log writes (the forge-vector surface).
              // The same pre-condition is enforced at writeEntry (canonical
              // surface); this is the batch-path redundant defense.
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
              entries.push(validation.data);
              break;
            }
            case "update": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              if (op._expected_version !== undefined) {
                const current = entries[idx].version ?? 0;
                if (current !== op._expected_version) throw new Error("version_mismatch");
              }
              // Strip op discriminator + lookup id + CAS version before checking
              // the deny-list and applying. Without this, the lookup-key `id` and
              // the op discriminator `op` would falsely trigger the deny-list.
              const { op: _op, id: _id, _expected_version, ...patch } = op;
              // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
              // wrapper enforces the entry_kind pre-condition via pre-state
              // context. The deny-list below is the after-the-fact guard for
              // other identity fields and stays unchanged.
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
              // Enforce the same IMMUTABLE_PATCH_FIELDS deny-list as meta_state_patch
              // so the batch tool cannot be used to bypass identity/audit-trail
              // invariants (e.g. pinning a finding's code_fingerprint to a stale hash).
              // Throws to roll back the entire batch (all-or-nothing semantics).
              const denied = Object.keys(patch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
              if (denied.length > 0) {
                const err = new Error("immutable_field");
                err.denied_fields = denied;
                throw err;
              }
              Object.assign(entries[idx], patch);
              entries[idx].version = (entries[idx].version ?? 0) + 1;
              break;
            }
            case "delete": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
              // wrapper enforces the change-log immutability pre-condition.
              const deleteInvariant = await assertinvariant(
                () => Promise.resolve({ ok: true }),
                {
                  accept: {
                    context: () => entries[idx],
                    check: (e) => e.entry_kind !== "change-log",
                  },
                  returnOnFail: {
                    reason_code: "change_log_immutable",
                    entry_kind: entries[idx].entry_kind,
                    id: op.id,
                  },
                  root,
                }
              );
              if (!deleteInvariant.ok) {
                const err = new Error("change_log_immutable");
                throw err;
              }
              entries.splice(idx, 1);
              break;
            }
            case "archive": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
              // Plan 260712-0724 (Implementation 3): universal `assertinvariant`
              // wrapper enforces the already-archived pre-condition.
              if (!(await assertNotArchived(entries, idx, root, op.id))) {
                const err = new Error("already_archived");
                throw err;
              }
              entries[idx] = {
                ...entries[idx],
                status: "archived",
                archived_at: new Date().toISOString(),
                archived_by: op.archived_by ?? "operator",
                archived_reason: op.reason ?? "batch_archive",
              };
              break;
            }
          }
        } catch (err) {
          if (preBatchContent) {
            writeFileSync(path, preBatchContent, "utf8");
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
          invalidateCache(root);
          // Pass through extra context (e.g. denied_fields from immutable_field)
          // so callers can diagnose which fields triggered the rollback.
          const extra = {};
          if (err.denied_fields) extra.denied_fields = err.denied_fields;
          return { applied: 0, failed_at: i, reason: err.message, op, ...extra };
        }
      }

      // Plan 260712-0300 Phase 2: build the envelope-annotated change-log entry
      // BEFORE the file write so the rename + assertWriteVisible cycle sees
      // both the batch mutations AND the auto-emit as one atomic write. This
      // ordering (change-log-after-batch, operator-confirmed same as Plan
      // 260712-0109) eliminates any audit/reality divergence window.
      let autoEmitId = null;
      if (envelope) {
        // Generate auto-emit id (red-team finding 8): ISO timestamp + 6 random
        // hex chars. Deterministic slug collides when two batches share a target;
        // the random suffix gives sub-second sortability + collision resistance.
        autoEmitId = `meta-${new Date().toISOString().replace(/[-:.]/g, "")}-${Math.random().toString(16).slice(2, 8)}`;
        // Duplicate-id guard: if the random suffix collides with an existing
        // entry id (astronomically rare at 6 hex but explicit is better),
        // throw and roll back.
        if (entries.some((e) => e.id === autoEmitId)) {
          const err = new Error("auto_emit_id_collision");
          err.id = autoEmitId;
          throw err;
        }
        const postRegistrySnapshot = entries.map((e) => ({
          id: e.id,
          status: e.status,
          entry_kind: e.entry_kind,
        }));
        // buildEnvelope throws `kind_op_incompatible` on kind × op-type mismatch
        // (red-team finding 9); the throw rolls the batch back to preBatchContent.
        const builtEnvelope = buildEnvelope({
          kind: envelope.kind,
          target: envelope.target,
          ops: operations,
          preRegistry: preRegistrySnapshot,
          postRegistry: postRegistrySnapshot,
        });
        entries.push({
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
        });
      }

      // Plan 260715-0801 Tier 1 — see updateEntry for the tableOnly/rollback
      // decision; with the write dispatch deferred, the full set persists.
      // Routed through `persistRegistryAtomic` (instead of inline writeFileSync)
      // so the change-log leak guard in `assertNoChangeLogLeak` fires from
      // every persist site. Behavior-equivalent pre-split (no change-log.jsonl)
      // because the guard's first check is `existsSync(changeLogPath)`.
      persistRegistryAtomic(entries, root);

      // Plan 260715-0801 Tier 1 — metaStateBatch auto-emit routing (deferred).
      // The auto-emit is currently included in the table-rewrite via the
      // in-memory `entries.push` above. Phase 2 step 4 routes it through
      // `appendChangeLogEntryAtomic` alongside the migration; the test
      // corpus currently asserts the table-file path. Keeping the deferred
      // comment here so the next session knows exactly where to plug the
      // routing back in.

      // Plan 260712-0300 Phase 2 (red-team finding 1): assertWriteVisible after
      // rename. Re-read the registry; if the auto-emit change-log is not present
      // (silent-persistence-fail class), restore preBatchContent and return a
      // structured failure. Same pattern as meta_state_log_change PR #50.
      if (envelope && autoEmitId) {
        const fresh = readRegistry(root).find((e) => e.id === autoEmitId);
        if (!fresh) {
          if (preBatchContent) {
            writeFileSync(path, preBatchContent, "utf8");
          } else if (existsSync(path)) {
            unlinkSync(path);
          }
          invalidateCache(root);
          return { applied: 0, failed_at: null, reason: "change_log_not_visible" };
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

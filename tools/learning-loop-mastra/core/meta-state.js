// fallow-ignore-file complexity — registry CRUD with Zod, CAS, TTL
import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync, unlinkSync, statSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { z } from "zod";
import { stripEnvelope } from "./envelope-stripper.js";
import { readRegistryWithCache, invalidateCache } from "./read-registry-cache.js";
import { withRegistryLock } from "./registry-lock.js";
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

const REGISTRY_FILENAME = "meta-state.jsonl";
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
  reopens: z.preprocess(stripEnvelope, z.array(z.string())).optional()
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
  pattern_type: z.enum(["regex", "glob", "resolution-evidence-required", "consult-checklist"]).describe("Pattern language"),
  pattern: z.string().describe("The pattern (regex body, glob path, or session_id)"),
  scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()
    .describe("Optional scope filter: 'none' (default) or 'project_has_learning_loop_mcp'"),
  applies_to_resolution: z.string().optional()
    .describe("For pattern_type=resolution-evidence-required: the target finding id this rule gates"),
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
  proposed_design_for: z.preprocess(stripEnvelope, z.array(z.string()).min(1))
    .describe("Forward: ids of rules/schemas/tools this design will create or modify"),
  addresses: z.preprocess(stripEnvelope, z.array(z.string()).default([]))
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

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

function _readAndParseRegistry(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => {
    const entry = JSON.parse(line);
    if (!entry.entry_kind) {
      entry.entry_kind = "finding"; // Backward-compat coerce
    }
    withDefaults(entry); // Apply affected_system default for legacy entries
    return entry;
  });
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
 * with the current time. Invalidates the read cache.
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
 * Atomically append a single entry to the JSONL registry.
 * Queued per-root to prevent read-modify-write races under concurrent calls
 * within one process, AND locked at the filesystem level (proper-lockfile) to
 * prevent read-modify-write races across processes. Plan 260711-0030 Phase 1.
 */
export function writeEntry(root, entry) {
  return enqueue(root, () =>
    withRegistryLock(root, () => {
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
      const path = getRegistryPath(root);
      const lines = existsSync(path)
        ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "")
        : [];
      lines.push(JSON.stringify(validation.data));
      const tmpPath = path + ".tmp";
      writeFileSync(tmpPath, lines.join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
      invalidateCache(root);
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
    withRegistryLock(root, () => {
      const entries = readRegistry(root);
      let found = false;
      let currentVersion = 0;

      // Check id exists before any mutation
      for (const entry of entries) {
        if (entry.id === id) {
          found = true;
          currentVersion = entry.version ?? 0;
          break;
        }
      }
      if (!found) return null;

      const patchValidation = metaStateEntryPatchSchema.safeParse(patch);
      if (!patchValidation.success) {
        return "validation_failed";
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

      const path = getRegistryPath(root);
      const tmpPath = path + ".tmp";
      writeFileSync(tmpPath, updated.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
      invalidateCache(root);
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
    withRegistryLock(root, () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { archived: false, reason: "not_found", id };
      if (entries[idx].status === "archived") {
        return { archived: false, reason: "already_archived", id };
      }
      entries[idx] = {
        ...entries[idx],
        status: "archived",
        archived_at: new Date().toISOString(),
        archived_by: archivedBy,
        archived_reason: reason,
      };
      const path = getRegistryPath(root);
      const tmpPath = path + ".tmp";
      writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
      invalidateCache(root);
      return { archived: true, id, archived_at: entries[idx].archived_at };
    })
  );
}

/**
 * Atomically delete an entry by id (soft CRUD enforcement).
 */
export function deleteEntry(root, id) {
  return enqueue(root, () =>
    withRegistryLock(root, () => {
      const entries = readRegistry(root);
      const filtered = entries.filter((e) => e.id !== id);
      if (filtered.length === entries.length) return { deleted: false, reason: "not_found", id };
      const path = getRegistryPath(root);
      const tmpPath = path + ".tmp";
      writeFileSync(tmpPath, filtered.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
      invalidateCache(root);
      return { deleted: true, id };
    })
  );
}

const BATCH_OP_TYPES = new Set(["write", "update", "delete", "archive"]);
// Plan 260711-0030 Phase 1: BATCH_SIZE_LIMIT reduced from 500 → 100 so that
// worst-case batch fits inside the registry-lock's `stale: 30000` window on
// slow disks (Finding 12). Larger batches risk lock-stealing by concurrent
// processes that observe a >30s-old lock. Operators can still override via
// META_STATE_BATCH_LIMIT env var.
const BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 100;

/**
 * Atomically apply a batch of meta-state operations.
 * All-or-nothing rollback on any failure. Single cache invalidation.
 */
export function metaStateBatch(root, operations) {
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
              entries.splice(idx, 1);
              break;
            }
            case "archive": {
              const idx = entries.findIndex((e) => e.id === op.id);
              if (idx === -1) throw new Error("not_found");
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

      const tmpPath = path + ".tmp";
      writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      renameSync(tmpPath, path);
      invalidateCache(root);
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

    const path = getRegistryPath(root);
    const lines = existsSync(path)
      ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "")
      : [];
    lines.push(JSON.stringify(validation.data));
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, lines.join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);
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

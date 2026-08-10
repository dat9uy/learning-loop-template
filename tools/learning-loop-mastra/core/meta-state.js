// fallow-ignore-file complexity
// File-wide: 2600-line registry CRUD (Zod schemas, CAS appends, TTL caches) is
// inherently high-complexity; kept as a file-level suppression per the fallow
// workaround-refactor plan (P1 classified, NOT stale).
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
// operation_envelope field on change-log entries
// (Implementation 2 of the assertinvariant resolution). The helper owns the
// kind enum + content-hash construction; the schema imports the enum so there
// is one source of truth.
import {
  OPERATION_ENVELOPE_KINDS,
  CANONICAL_STATUS_KEYS,
  CANONICAL_KIND_KEYS,
  buildEnvelope,
} from "./operation-envelope.js";
// single source of truth for BATCH_SIZE_LIMIT
// (closes the 500-vs-100 default divergence between handler and core).
import { BATCH_SIZE_LIMIT, META_STATE_FINDING_CATEGORIES, META_STATE_FINDING_SEVERITIES } from "./constants.js";
// schema-version-skew detection. isSchemaBranchSupported
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
// universal `assertinvariant` primitive
// applied to every mutation op that owns an invariant the agent depends on
// (writeEntry, updateEntry, archiveEntry, deleteEntry, metaStateBatch).
// Pre-state-only — see core/operation-invariant.js for the architecture.
import { assertinvariant } from "./operation-invariant.js";
import { appendGateLog } from "#lib/gate-logging.js";
// Structural referential-integrity (RI) at the write boundary. The graph
// module owns the cross-ref table (per-kind fields) and the id-existence
// check; the mutation boundaries (writeEntry/updateEntry/metaStateBatch)
// emit a gate-log audit when a structural cross-ref points at a
// never-existent id. RI is WARN-ONLY — it never rejects the write. The hard
// enforcer is the CI gate `meta-state-refs-check.yml` (catches within-PR
// orphans); write-time RI's marginal benefit is immediate operator feedback
// + cross-PR orphan surfacing. Warn-only preserves the features that
// deliberately create ref orphans at write time: the `dangling_refs` derived
// view (a finding that reopens a never-existent id) and the cold-tier
// `orphans` array (a finding whose consolidated_into points at a missing
// change-log). Id-existence only — tombstones count as present (liveness
// out of scope); kind-match NOT checked (a Set<string> carries no kind);
// applies_to_resolution is RI-exempt (z.string(), not an entry-id ref).
import {
  forwardRefs as graphForwardRefs,
  resolveStructuralRI as graphResolveStructuralRI,
  diffChangedRefs as graphDiffChangedRefs,
} from "./entry/relationship-graph.js";

// Emit a WARN-ONLY structural-RI advisory to the gate log. `dangling` is the
// graph's list of {field, id} refs whose target is never-existent. I/O
// failures are swallowed by appendGateLog; a bad `root` throws (surfaced).
function warnStructuralRI(root, entryId, dangling) {
  if (!Array.isArray(dangling) || dangling.length === 0) return;
  appendGateLog(root, {
    timestamp: new Date().toISOString(),
    tool: "structural-ri",
    reason_code: "dangling_structural_ref",
    entry_id: entryId,
    dangling,
    dangling_count: dangling.length,
  });
}
// true-append write helper + canonical
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
// The citation stream is a true-append log of immutable `entry_kind=citation`
// entries. Citations are the asserted-relationship carrier — generic,
// untyped verb in `rationale`, with `source`/`target` declared in
// `core/entry/relationship-graph.js#CROSS_REFS`. Same merge=union guarantees
// as change-log.jsonl: citations are append-only, never mutated in place.
// Writes route via `appendCitationEntryAtomic`; reads union the third file
// in `readRawLines`. The 3-direction `assertNoCitationLeak` guard lives in
// `core/registry-append-atomic.js`.
const CITATIONS_FILENAME = "citations.jsonl";

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

function getChangeLogPath(root) {
  return join(root, CHANGE_LOG_FILENAME);
}

function getCitationsPath(root) {
  return join(root, CITATIONS_FILENAME);
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
 * destination of an in-place read-modify-write. Every persist site was
 * rewritten to true-append via `trueAppendAtomic`, which carries
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
 * A partial state where
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
 * `persistRegistryAtomic` callers (compaction only — see `compact-registry.sh`) inherit
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
 * path. This helper DRYs the three rollback sites
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
  // True-append (no read-all → full rewrite).
  // The previous implementation read the whole file, pushed, and full-rewrote;
  // that's unsafe for parallel-branch merges and is replaced by O_APPEND +
  // fsync via trueAppendAtomic. New entries start at version 0; later patches
  // bump to version N+1 (last-wins-by-max-version per the versioned-append
  // projection).
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
 * The cache invalidation here covers ALL THREE files (`read-registry-cache.js`
 * keys on meta-state.jsonl mtime+size AND change-log.jsonl mtime+size AND
 * citations.jsonl mtime+size); a write to any of the three must bust the
 * cache so the next read sees the new entry. Without invalidation, a stale
 * cached union could omit the new change-log.
 *
 * Also uses `trueAppendAtomic` so the
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

/**
 * True-append a single citation entry to `citations.jsonl`.
 *
 * Mirrors `appendChangeLogEntryAtomic` exactly — same O_APPEND+fsync
 * true-append pattern, same per-root lock requirement, same
 * cache-invalidation effect. The 3-direction `assertNoCitationLeak` guard
 * inside `trueAppendAtomic` ensures a citation entry can ONLY land in
 * `citations.jsonl`, never in meta-state.jsonl or change-log.jsonl.
 *
 * Citations are immutable audit entries (status:"active"); the
 * `entry_kind:"citation"` branch of `writeEntry` and the union schema's
 * pre-state guard ensure the entry validates as a citation before the
 * file write.
 *
 * Cache invalidation covers all three files because the read cache keys
 * on every file's mtime+size; missing citations.jsonl would not crash
 * here (O_APPEND | O_CREAT creates on first append), and the union read
 * in `readRawLines` will pick up the new line on the next call.
 */
export function appendCitationEntryAtomic(root, entry) {
  const path = getCitationsPath(root);
  // trueAppendAtomic fires the 3-direction citation-leak guard before
  // any bytes are written. The path passed here is citations.jsonl, so
  // the citation→citations.jsonl direction is the only legal pair; the
  // other two directions throw.
  trueAppendAtomicRaw(root, path, entry);
  invalidateCache(root);
}

// The `lifecycle-status-stale-mechanism` loop-design collapses the finding
// status enum to `{open, resolved, accepted}` (+ `archived` runtime-applied
// at archive time, outside the enum). `superseded` folded into `resolved`
// + a citation in `citations.jsonl`; `accepted` is the standing-trade-off
// terminal; `meta_state_accept` flips `open` → `accepted`; `accepted` is
// terminal for `isOpen`/`isStaleView`/`deriveStatus`.
// `reported`/`active`/`stale`/`auto-resolved` are removed from the enum — read
// sites use `isOpen`/`isStaleView` instead. `archived` lives outside the enum
// because it is applied by `archiveEntry` after the entry has been removed
// from the canonical set.
export const TERMINAL_STATUSES = new Set(["resolved", "accepted"]);
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
// STALENESS_WINDOW_MS is sourced from core/constants.js
// (the shared canonical owner) so core/stale-view.js and meta-state-sweep-tool.js
// cannot drift. The env-var override `META_STATE_STALENESS_WINDOW_MS` is honored
// by constants.js. Re-exported below for backward compat with callers that
// import STALENESS_WINDOW_MS directly from this module.

// Source-of-truth categories for finding entries live in core/constants.js
// (shared with the SessionStart banner sketch). Re-exported here so
// introspection layers (e.g. core/loop-introspect.js) keep importing from
// this module. `stale-ref` was removed in the Rec 8 collapse: stale findings
// are no longer recorded as a category — the information is surfaced as a
// derived view via `meta_state_relationships`.
export { META_STATE_FINDING_CATEGORIES };

/**
 * Entry-id reference prefixes. A value in a cross-reference array
 * (proposed_design_for, addresses, reopens) must start with one of these.
 * Single source of truth — shared by the schema refiners below and by the
 * cold-tier regression test, so the test enforces the same rule the schema
 * does instead of hand-rolling a copy. Tool names, file paths, and schema
 * export names are NOT entry-id refs; a design that targets those documents
 * them in its description and leaves the cross-ref array empty.
 */
const ENTRY_ID_REF_PREFIXES = ["meta-", "rule-", "loop-design-", "citation-"];

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
  category: z.enum(META_STATE_FINDING_CATEGORIES).describe("Category of the finding"),
  severity: z.enum(META_STATE_FINDING_SEVERITIES).describe("Severity level"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).describe("Affected system"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional()
    .describe("Subtype for loop-anti-pattern findings; see field_glossary"),
  recurrence_key: z.string().optional()
    .describe("Recurring-false-positive dedup key; see field_glossary"),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code location; see field_glossary.evidence_code_ref"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["open", "resolved", "accepted", "archived"]).optional()
    .describe("Finding lifecycle; use field_glossary.status and the dedicated lifecycle tools."),
  // Inert-historical: old version lines still carry these so the schema
  // accepts them on read; the write path no longer stamps them. The
  // superseded-closure fields `consolidated_into` + `superseded_at` +
  // `superseded_by` are inert-historical; the canonical supersede edge is
  // now a citation row in `citations.jsonl`. De-routed from `CROSS_REFS`
  // so they are no longer indexed by the inverse maps.
  consolidated_into: z.string().optional()
    .describe("Inert-historical: canonical change-log id of the prior `superseded` closure; the live edge is a citation row."),
  verification: z.object({}).passthrough().optional()
    .describe("Verification reproduction object; see field_glossary.verification"),
  // Inert-historical: stamped by the prior `meta_state_supersede`; the live
  // closure is `resolved` + a citation. Old version lines still parse.
  superseded_at: z.string().optional()
    .describe("Inert-historical: prior `meta_state_supersede` timestamp; the live closure uses `resolved_at` + a citation."),
  superseded_by: z.string().optional()
    .describe("Inert-historical: prior `meta_state_supersede` operator id; the live closure uses `resolved_by`."),
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
  // Accepted status stamps — set by `meta_state_accept`. Mirrors the
  // `resolved_at`/`resolved_by` shape. `accepted` is a standing-trade-off
  // terminal: the finding is NOT going away, but it stops being actionable
  // (`isOpen` excludes it; `isStaleView` returns false; `deriveStatus`
  // returns no_action). `meta_state_archive` accepts `accepted` → `archived`.
  accepted_at: z.string().nullable().optional()
    .describe("ISO timestamp when the entry was accepted as a standing trade-off. Set by meta_state_accept."),
  accepted_by: z.string().nullable().optional()
    .describe("Operator or rule id that accepted the entry. Set by meta_state_accept."),
  accepted_reason: z.string().nullable().optional()
    .describe("Human-readable trade-off note. Set by meta_state_accept."),
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
  // consolidates is multi-valued
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
  // optional magnitude envelope for batch mutations.
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
 * Citation branch schema.
 *
 * Citations are the asserted-relationship carrier that replaces the bespoke
 * on-record fields `consolidated_into`/`origin`/`supersedes`/
 * `promoted_to_rule`. A citation entry is a kinded record in its own
 * `citations.jsonl` (mirroring how change-logs landed in their own file
 * during the Tier-1 split).
 *
 * Field model — `rationale` is REQUIRED and is the verb (e.g. "origin",
 * "consolidated-into", "supersedes"); it is untyped prose by design: per
 * the owner-confirmed red-team resolution, the named inverse maps that
 * previously branched on the verb collapsed into ONE generic
 * `citations_inverse`. The verb stays prose in `rationale`; no consumer
 * runtime branch reads it as a tag. This is the state-3 L1
 * (`docs/philosophy.md` § "Schema Constraints Are State-3 Artifacts"):
 * no branch on the verb keeps the citation kind prose-honest.
 *
 * `source` and `target` are entry-id refs (the cross-ref table in
 * `core/entry/relationship-graph.js#CROSS_REFS` declares both with
 * `targetKind:"any"` so `resolveStructuralRI` validates both exist). The
 * validation is WARN-ONLY (red-team R3 / R4 inherited from the change-log
 * lineage) — never rejects.
 *
 * `status` is a `z.literal("active")` — citations are append-only audit
 * entries; the projection's last-wins-by-max-version collapse applies to a
 * citation's id, but a citation never transitions to "archived" or
 * "resolved" (those are finding-side lifecycle concepts).
 */
export const metaStateCitationEntrySchema = z.object({
  id: z.string().regex(/^citation-[a-z0-9-]+$/).describe("Stable citation id; see field_glossary.id"),
  entry_kind: z.literal("citation").describe("Discriminator: citation"),
  source: z.string().describe("Source entry id (the row that emits the edge)"),
  target: z.string().describe("Target entry id (the row the source points at)"),
  rationale: z.string().min(1).describe("Required verb prose (e.g. 'origin', 'consolidated-into', 'supersedes') — the verb stays prose; no runtime branch consumes it."),
  recorded_at: z.string().describe("ISO timestamp of when the citation was emitted"),
  recorded_by: z.string().describe("Operator or rule id that emitted the citation"),
  status: z.literal("active").default("active").describe("Status — citation entries are always 'active' (immutable audit log)"),
  version: z.number().default(0).describe("CAS version (not used by citation entries but consistent shape)"),
});

/**
 * Validate the canonical agent-checklist pattern shape. Agent-checklist
 * patterns are JSON blobs `{version: <int>=1>, items: [{id, description}]}`
 * that consumers (tests, runtimes reading `loop_describe` rules) JSON.parse
 * at runtime. A bare z.string() lets malformed JSON in at promotion time and
 * defers the failure to the first consumer parse — reject it at the boundary.
 * Returns an array of human-readable problems ([] = valid).
 */
export function agentChecklistPatternProblems(pattern) {
  if (typeof pattern !== "string") return ["pattern is not a string"];
  let parsed;
  try {
    parsed = JSON.parse(pattern);
  } catch {
    return ["pattern is not valid JSON (agent-checklist patterns are JSON blobs of shape {version, items:[{id, description}]})"];
  }
  const problems = [];
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return ["pattern JSON must be an object of shape {version, items:[{id, description}]}"];
  }
  if (!Number.isInteger(parsed.version) || parsed.version < 1) {
    problems.push("pattern.version must be an integer >= 1");
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    problems.push("pattern.items must be a non-empty array of {id, description}");
  } else {
    parsed.items.forEach((item, i) => {
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        problems.push(`pattern.items[${i}] must be an object {id, description}`);
        return;
      }
      if (typeof item.id !== "string" || item.id.length === 0) {
        problems.push(`pattern.items[${i}].id must be a non-empty string`);
      }
      if (typeof item.description !== "string" || item.description.length === 0) {
        problems.push(`pattern.items[${i}].description must be a non-empty string`);
      }
    });
  }
  return problems;
}

/**
 * Rule branch object schema (unrefined base) — promoted gate/agent rules
 * with their own lifecycle. Kept refinement-free so buildPatchSchemaFor can
 * derive via .omit()/.partial() (zod 4 forbids .omit on refined objects).
 * The exported metaStateRuleEntrySchema adds the cross-field pattern-shape
 * refinement on top of this base.
 */
const metaStateRuleEntryObject = z.object({
  entry_kind: z.literal("rule").default("rule"),
  id: z.string().regex(/^rule-[a-z0-9-]+$/).describe("Stable rule id; see field_glossary.id"),
  origin: z.string().optional()
    .describe("Inert-historical: Finding id that originated this rule. The on-record field is retired; the canonical promotion edge is the origin citation row emitted by meta_state_promote_rule."),
  supersedes: z.string().optional()
    .describe("Prior rule id refined by this rule (inert-historical; the on-record field collapsed into a rule→rule citation row)"),
  enforcement: z.enum(["gate", "agent"]).describe("Where the rule is enforced"),
  pattern_type: z.enum(["regex", "glob", "determinism-checklist", "agent-checklist"]).describe("Pattern language"),
  pattern: z.string().describe("The pattern (regex body, glob path, or session_id)"),
  scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"]).optional()
    .describe("Optional project scope predicate"),
  applies_to_resolution: z.string().optional()
    .describe("Finding id gated by a determinism checklist"),
  supersedes: z.string().optional()
    .describe("Inert-historical: prior rule id refined by this rule. The on-record field collapsed into a rule→rule citation row emitted by meta_state_patch."),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  status: z.enum(["active", "inactive", "archived"]).default("active")
    .describe("Rule lifecycle; inactive rules are not enforced; archived tombstones are appended by deleteEntry"),
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
  // Rule-derived process hint prose. Persisted on agent-checklist rule
  // entries; the meta_state_promote_rule tool REQUIRES this on creation (actionable
  // rejection), and the hint-renderer resolves `text` from `rule.hint_text`
  // at SessionStart render time. Optional on the schema because non-
  // agent-checklist rules (gate-enforced) don't need injection prose;
  // the hint-renderer treats a missing rule hint as a skip-with-warning.
  hint_text: z.string().min(20).optional()
    .describe("Agent-checklist process hint text; required when promoted as agent-checklist"),
  // Agent-checklist rule hint metadata. All three fields are optional on the
  // schema (gate-enforced rules don't need them, and patch updates may
  // add/remove them incrementally); the tool layer requires `hint_suggestion`
  // for agent-checklist promotion AND patch-create so the view in
  // hint-registry.js can read it unconditionally.
  hint_order: z.number().int().optional()
    .describe("Merge key for process-hint order (lower = earlier); absent → append-by-slug"),
  hint_suggestion: z.string().min(20).max(200).regex(/^[^\n\r]+$/).optional()
    .describe("Curated one-line pointer text (single-line, 20-200 chars); required for agent-checklist rules"),
  hint_slug: z.string().regex(/^[a-z0-9-]+$/).optional()
    .describe("Explicit slug override; only needed when desired slug differs from rule id minus 'rule-'"),
  affected_system: z.enum(AFFECTED_SYSTEM_ENUM).optional().describe("Which system this rule affects"),
  // parallel to change-log's applies_to
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
 * Rule branch schema — the canonical rule validator. Adds the cross-field
 * agent-checklist pattern-shape gate over metaStateRuleEntryObject:
 * agent-checklist patterns are JSON blobs consumed via JSON.parse at
 * render/eval time, so a malformed blob is rejected at write time rather
 * than at the first consumer parse. Has .shape available for tool schema
 * reuse (zod 4 superRefine preserves the ZodObject API).
 */
export const metaStateRuleEntrySchema = metaStateRuleEntryObject.superRefine((rule, ctx) => {
  if (rule.pattern_type === "agent-checklist" && typeof rule.pattern === "string") {
    for (const problem of agentChecklistPatternProblems(rule.pattern)) {
      ctx.addIssue({ code: "custom", path: ["pattern"], message: problem });
    }
  }
});

/**
 * Loop-design branch schema — deferred design notes with their own lifecycle.
 * Has .shape available for tool schema reuse.
 */
export const metaStateLoopDesignSchema = z.object({
  entry_kind: z.literal("loop-design").default("loop-design"),
  id: z.string().describe("Design id; see field_glossary.id"),
  title: z.string().min(10).describe("Short human-readable title"),
  status: z.enum(["active", "inactive", "archived"]).default("active")
    .describe("Binary. Flips to inactive when the proposed work ships; archived tombstones are appended by deleteEntry"),
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
 * Cross-cutting union validator — the write gate for `writeEntry` and
 * `metaStateBatch case:"write"`. Does NOT have .shape (by zod design); use
 * the branch schemas for .shape. Includes preprocess to default
 * affected_system to 'meta' for legacy entries.
 *
 * The union includes a write-boundary guard that rejects caller-supplied
 * `status:"archived"` on the write path. The 3 per-kind status enums accept
 * "archived" (so factory reads don't crash on tombstones), but `archived` is
 * append-only via `archiveEntry`/`deleteEntry` (and the restore path in
 * `restoreEntry`) — those ops bypass this union via `trueAppendAtomicRaw`.
 * Reads must NOT route through this union: the guard would reject every
 * archived tombstone row on disk.
 */
export const metaStateEntrySchema = z.preprocess(
  withDefaults,
  z.union([
    metaStateFindingEntrySchema,
    metaStateChangeEntrySchema,
    metaStateCitationEntrySchema,
    metaStateRuleEntrySchema,
    metaStateLoopDesignSchema,
  ]).superRefine((entry, ctx) => {
    if (entry && entry.status === "archived") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "status:\"archived\" is a tombstone status appended only by archiveEntry/deleteEntry; use those tools rather than writeEntry or metaStateBatch case:\"write\".",
      });
    }
  })
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
 *   the deny-list with a before/after comparison guard. (Before/after patch guard.)
 * - `status` (on rule + loop-design) is enforced OFF the patch path by
 *   Fix A (omits `status` from the rule + loop-design patch schemas; the
 *   finding schema does not .default() status so no injection there). The
 *   deny-list entry below extends the guard to the batch path as a stopgap.
 * - `promoted_to_rule` removed from deny-list — the field is no longer written
 *   on findings after the migration to first-class rule entries.
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
  "resolved_at",
  "resolved_by",
  "resolution",
  // Accepted-status stamps are produced only by `meta_state_accept`. Patching
  // them onto an open finding would forge the accept audit trail without
  // flipping `status` (which is itself denied above), leaving a contradictory
  // open finding carrying `accepted_*` stamps. The dedicated lifecycle tool
  // is the only sanctioned path.
  "accepted_at",
  "accepted_by",
  "accepted_reason",
  "entry_kind",  // identity — stopgap until the universal assertinvariant wrapper (Impl 3)
  "status",      // lifecycle identity — stopgap (rule/loop-design deactivation/ship is operator-decided)
  "operation_envelope",  // Auto-emit ONLY (meta_state_batch); replace via patch is a forge vector. Stopgap until universal wrapper (Impl 3).
  // Freshness stamps are produced only by verification (re-verify) or
  // grounding-guarded attestation (touch). Patching would forge freshness
  // without evidence. The grounding backdoor close (per finding meta-260724T1931Z).
  "last_verified_at",
]);

// Emit a WARN-ONLY audit when a direct core caller of updateEntry changes an
// IMMUTABLE_PATCH_FIELDS field. The deny-list is enforced only at the
// arbitrary-patch layer (meta-state-patch-tool + metaStateBatch), so the
// sanctioned lifecycle tools (resolve / touch / re-verify / supersede /
// promote-rule) reach updateEntry directly with immutable fields and would
// otherwise transition them with NO gate-log record. This advisory makes
// those transitions — and any future direct-caller mutation of an immutable
// field — visible in the gate log. It never rejects (updateEntry's return
// contract is unchanged); the versioned append remains the state of record.
// Mirrors warnStructuralRI: I/O failures are swallowed by appendGateLog; a
// bad `root` throws. `entry_kind` is already stripped from `cleanPatch` by
// updateEntry (handled by the assertinvariant wrapper), so it never appears
// here. Only fields that actually differ from the existing entry are
// reported, so the `immutable_field_transition` reason_code is truthful.
function auditImmutableFieldTransition(root, entryId, cleanPatch, existingEntry) {
  const fields = Object.keys(cleanPatch)
    .filter((k) => IMMUTABLE_PATCH_FIELDS.has(k))
    .filter((k) => JSON.stringify(cleanPatch[k]) !== JSON.stringify(existingEntry?.[k]));
  if (fields.length === 0) return;
  appendGateLog(root, {
    timestamp: new Date().toISOString(),
    tool: "updateEntry",
    reason_code: "immutable_field_transition",
    entry_id: entryId,
    fields,
    fields_count: fields.length,
  });
}

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
 * patches (the deny-list deny-via-patch invariant; finding meta-260712T0053Z):
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
    case "rule":       return metaStateRuleEntryObject.omit({ entry_kind: true, status: true }).partial().strict();
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
 * Thrown when writeEntry's entry.entry_kind is not
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
 * Shared three-source read:
 *   - meta-state.jsonl (mutable table)
 *   - change-log.jsonl (true-append log of immutable change-logs)
 *   - citations.jsonl  (true-append log of immutable citations)
 *
 * Returns the parsed entry list with backward-compat coercions applied and
 * NO projection / NO sort — the two callers (`_readAndParseRegistry` and
 * `parseFnAllVersions`) differ ONLY in what they do after this step. Keep
 * it that way: if a coercion is needed, add it here, not in one caller —
 * the projected and all-versions reads MUST NOT diverge on parse semantics.
 *
 * Missing files are treated as empty (so the pre-citation-split state still
 * works as a no-op dual-source read; the citation stream may be absent and
 * the reader handles it the same way). The cache key in
 * `read-registry-cache.js` includes citations.jsonl's mtime+size, so a
 * first-append to that file invalidates the cache and the next read here
 * picks it up.
 */
function readRawLines(root) {
  const metaStatePath = getRegistryPath(root);
  const changeLogPath = getChangeLogPath(root);
  const citationsPath = getCitationsPath(root);
  const metaStateLines = existsSync(metaStatePath)
    ? readFileSync(metaStatePath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const changeLogLines = existsSync(changeLogPath)
    ? readFileSync(changeLogPath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const citationsLines = existsSync(citationsPath)
    ? readFileSync(citationsPath, "utf8").split("\n").filter((line) => line.trim() !== "")
    : [];
  const allLines = [...metaStateLines, ...changeLogLines, ...citationsLines];
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
  // Versioned-append projection (last-wins-by-max-version):
  //   1. Concat both files
  //   2. Group by id
  //   3. Pick max_by(version) per id (tie-break: later created_at wins)
  //   4. Re-sort by created_at ascending for chronological output
  //
  // Pure-JS (Array.prototype.sort is V8-stable). Tier 1 used sort-only
  // projection (identity for singleton-per-id); same output today since
  // every id in the live registry is a singleton. The true-append write path
  // produces multi-line-per-id (versioned append) where this projection
  // becomes load-bearing.
  //
  // Pre-condition: every id has ≥1 non-null integer `version` (backfilled
  // by tools/learning-loop-mastra/tools/handlers/scripts/backfill-versions.mjs
  // before this projection goes live). Without the backfill, `max_by` would
  // mispick on all-null-version groups (returns arbitrary group member).
  const parsed = readRawLines(root);
  // Last-wins-by-max-version dedupe (versioned-append projection).
  // Tie-break on equal version: later created_at wins (matches the tie-break
  // in migrate-change-log-stream.mjs#dedupeById so script → reader is
  // consistent). For null/missing version, treat as 0 — backfill guarantees
  // no group is all-null-version post-backfill.
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
// check-grounding.js); this index is the authoritative baseline. The sidecar
// is additive only — nothing reads the index yet.
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

// Inverted companion to `assertNotArchived` for `restoreEntry`. Returns true
// when the entry IS an archive tombstone (the restore pre-condition); false
// otherwise (already-active, change-log, or not-found are all rejected
// upstream). The single wrapper covers change-logs too: they are
// status:"active" (z.literal on the change-log branch), so
// `assertArchivedTombstone` returns not_archived before any entry_kind check —
// no separate `change_log_immutable` branch is needed.
async function assertArchivedTombstone(entries, idx, root, id) {
  const invariantResult = await assertinvariant(
    () => Promise.resolve({ ok: true }),
    {
      accept: {
        context: () => entries[idx],
        check: (e) => e.status === "archived",
      },
      returnOnFail: {
        reason_code: "not_archived",
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
 * prevent read-modify-write races across processes. The proper-lockfile wrapper.
 */
export function writeEntry(root, entry) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      // Identity pre-conditions + skew gate + validation + warn-only RI run
      // in the shared prologue. The forge-vector guard for caller-supplied
      // envelopes on `meta_state_batch` case "write" lives at metaStateBatch
      // (the only caller that opens the forge surface; meta_state_log_change
      // legitimately writes change-logs with operation_envelope via the
      // auto-emit path).
      const data = await prepareWriteEntry(root, entry, {
        reasonCode: "write_entry_identity_precondition_failed",
      });
      // Write dispatch by entry_kind.
      // Change-logs true-append to change-log.jsonl (merge=union safe);
      // citations true-append to citations.jsonl; everything else lands in
      // meta-state.jsonl. Runs INSIDE the withRegistryLock wrapper so
      // concurrent MCP servers cannot interleave byte-for-byte on the
      // change-log or citation file.
      if (data.entry_kind === "change-log") {
        appendChangeLogEntryAtomic(root, data);
      } else if (data.entry_kind === "citation") {
        appendCitationEntryAtomic(root, data);
      } else {
        appendRegistryEntryAtomic(root, data);
      }
    })
  );
}

/**
 * Shared write-path prologue for append-style mutation ops (writeEntry,
 * writeEntryIfAbsent). Runs INSIDE the caller's registry lock and returns the
 * schema-validated entry on success; throws on any failure.
 *
 * Order matters: universal `assertinvariant` identity pre-conditions first,
 * then the schema-version-skew gate, then zod validation, then the warn-only
 * structural RI advisory (the CI gate `meta-state-refs-check.yml` is the hard
 * enforcer for cross-ref orphans).
 *
 * @param {string} root
 * @param {object} entry
 * @param {object} options
 * @param {boolean} [options.requireRecurrenceKey] — also require a non-empty
 *   `recurrence_key` (the writeEntryIfAbsent dedup-key guard)
 * @param {string} options.reasonCode — invariant failure reason code
 * @returns {Promise<object>} the validated entry
 */
async function prepareWriteEntry(root, entry, { requireRecurrenceKey = false, reasonCode }) {
  const invariantResult = await assertinvariant(
    () => Promise.resolve({ entry }),
    {
      accept: {
        context: () => entry,
        check: (e) =>
          Boolean(e)
          && typeof e.id === "string"
          && typeof e.entry_kind === "string"
          && (!requireRecurrenceKey
            || (typeof e.recurrence_key === "string" && e.recurrence_key.length > 0)),
      },
      returnOnFail: {
        reason_code: reasonCode,
      },
      root,
    }
  );
  if (!invariantResult.ok) {
    throw new Error(`invalid_entry: ${reasonCode}`);
  }

  // Schema-version-skew gate. Reject writes whose
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
  // Write-time structural RI (WARN-ONLY — id-existence). Tombstones count as
  // present (liveness out of scope); kind-match is NOT checked (Set<string>,
  // no kind); `applies_to_resolution` is RI-exempt (z.string(), not an
  // entry-id ref); `forwardRefs` already skips the generic `"*"` wildcard.
  // Historical entries read fine (RI is advisory; the read/projection
  // path runs no RI).
  const existenceSet = new Set(readRegistry(root).map((e) => e.id));
  const writeRi = graphResolveStructuralRI(validation.data, existenceSet);
  warnStructuralRI(root, validation.data.id, writeRi.dangling);
  return validation.data;
}

/**
 * Atomically check for an existing recurring-false-positive key and append
 * the finding only if no non-archived existing entry holds the key.
 *
 * Race-safety: holds `withRegistryLock(root)` for the read + append cycle.
 * This is the single-key dedup path used by the SessionStart recurrence
 * trigger — without the locked re-check, two concurrent SessionStart
 * processes both pass the unlocked pre-filter and both write duplicate
 * findings (verified by the gate-recurrence race test).
 *
 * Same lock discipline as `writeEntry` (enqueue + withRegistryLock + true
 * append + cache invalidation). The unlocked pre-filter in callers remains
 * the fast path; this helper is the correctness boundary.
 *
 * Finding-only helper: the append path is hardcoded to
 * `appendRegistryEntryAtomic` (no change-log/citation dispatch), and the
 * entry MUST carry a non-empty `recurrence_key` — a missing key would match
 * every keyless recurring-false-positive and silently suppress the write.
 *
 * @param {string} root
 * @param {object} entry — the prepared finding (must carry `recurrence_key`)
 * @returns {Promise<{ written: boolean, suppressed_by?: object }>}
 *   - `{ written: true }` on append
 *   - `{ written: false, suppressed_by: <existing-finding> }` on dedup hit
 *   - rejects with `InvalidEntryError` / `SchemaVersionSkewError` on bad input
 *   (delegated to writeEntry's validation path)
 */
export function writeEntryIfAbsent(root, entry) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const data = await prepareWriteEntry(root, entry, {
        requireRecurrenceKey: true,
        reasonCode: "write_entry_if_absent_identity_precondition_failed",
      });
      // Locked re-check: an unlocked pre-filter can race with a concurrent
      // writeEntry that landed between our read and our writeEntry call.
      // Reading the registry INSIDE the lock sees the canonical post-write
      // state (writeEntry's true-append + invalidateCache complete before
      // lock release).
      const key = data.recurrence_key;
      const existing = readRegistry(root).find(
        (e) =>
          e.entry_kind === "finding"
          && e.subtype === "recurring-false-positive"
          && e.recurrence_key === key
          && e.status !== "archived",
      );
      if (existing) {
        return { written: false, suppressed_by: existing };
      }
      appendRegistryEntryAtomic(root, data);
      return { written: true };
    })
  );
}

/**
 * Atomically update an entry by id, applying a patch object.
 * True-append (no full rewrite). The patch
 * is applied to a COPY of the existing entry; if the patched copy is
 * canonically equal to the existing entry (canonical-comparator short-circuit,
 * resolves meta-260715T2311Z-gratuitous-mutations), no line is appended. If a
 * real change is detected, a new highest-version line is appended to
 * `meta-state.jsonl` via `trueAppendAtomic`; the original line is never
 * modified. Inline compaction (terminal entries older than 7 days) is removed
 * — `compact-registry.sh --full` is the canonical compaction
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
      // max-version line per id (versioned-append projection); this is the canonical
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

      // The `delete cleanPatch.entry_kind`
      // defense runs FIRST so the wrapper sees a patch that has already been
      // sanitized.
      const preStripPatch = { ...patch };
      delete preStripPatch.entry_kind;

      // The universal `assertinvariant`
      // pre-state-only wrapper on the post-strip patch.
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

      // Precondition: applyDefaults before canonicalize so legacy
      // entries lacking schema-defaulted fields canonicalize identically to
      // post-default reads.
      const patched = withDefaults({ ...existingEntry, ...cleanPatch });

      // NO-OP SHORT-CIRCUIT. Resolves
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
      // Update-time structural RI (WARN-ONLY — changed-only). Validates ONLY
      // cross-ref fields the patch introduces or repoints; inherited
      // unchanged refs (e.g. a historical `reopens`) are NOT re-validated,
      // so a description edit on a finding with a stale `reopens` is not
      // flagged. Emits a gate-log advisory for any changed ref whose target
      // is never-existent; does NOT reject (CI is the hard enforcer). So
      // `updateEntry` keeps its `true`/`null`/`"version_mismatch"`/… return
      // contract — it no longer returns a `"dangling_structural_ref"` code.
      // `consolidated_into` is on the immutable patch deny-list (only set at
      // writeEntry); `applies_to_resolution` is RI-exempt.
      const changedRefs = graphDiffChangedRefs(
        graphForwardRefs(newEntry),
        graphForwardRefs(existingEntry),
      );
      if (changedRefs.length > 0) {
        const existenceSet = new Set(readRegistry(root).map((e) => e.id));
        const dangling = changedRefs.filter((r) => !existenceSet.has(r.id));
        warnStructuralRI(root, id, dangling);
      }
      // Audit immutable-field transitions applied via direct core calls. The
      // deny-list is enforced only at the arbitrary-patch layer, so sanctioned
      // lifecycle tools and any future direct caller reach this real-change
      // path with immutable fields; record the transition in the gate log so
      // it is never silent. Warn-only — never rejects (mirrors warnStructuralRI).
      auditImmutableFieldTransition(root, id, cleanPatch, existingEntry);
      trueAppendAtomicRaw(root, getRegistryPath(root), newEntry);
      invalidateCache(root);
      return true;
    })
  );
}

/**
 * Atomically archive an entry by id. (True-append archive, no full rewrite.)
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
      // The universal `assertinvariant`
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
 * Atomically mark a finding entry as `accepted` (standing trade-off terminal).
 *
 * Mirrors `archiveEntry`/`restoreEntry` structure (enqueue +
 * withRegistryLock + trueAppendAtomicRaw + invalidateCache). True-appends a
 * new highest-version line with `status: "accepted"` + `accepted_at`/
 * `accepted_by`/`accepted_reason`. The original line is never modified.
 *
 * Why a new core op (not a meta_state_resolve flavor): the lifecycle
 * distinction matters. `resolve` = bug fixed; `accept` = bug stays as a
 * deliberate trade-off. Both are terminal for `isOpen`/`isStaleView`/
 * `deriveStatus`, but only `accepted` is archiveable WITHOUT a re-verify
 * handoff (an accepted finding is the stable record of a trade-off decision;
 * re-verify is a separate operator gesture, not part of this op).
 *
 * Pre-conditions (assertinvariant pre-state-only wrapper):
 *   - entry exists (`not_found`)
 *   - entry_kind === "finding" (`not_a_finding`)
 *   - entry.status is NOT already in TERMINAL_STATUSES (`already_terminal`)
 *   - entry.status is NOT "accepted" (`already_accepted`) — distinguished
 *     from the broader terminal check so the caller can disambiguate the
 *     outcome (re-accepting an already-accepted finding is a no-op success
 *     in `meta_state_accept` and a structured `already_accepted` here).
 *
 * Wrapped with `assertinvariant` (rule `assertinvariant-at-boundary`):
 *   the universal pre-state-only wrapper enforces the lifecycle invariants
 *   (status must be in the open set, entry_kind must be finding) before
 *   the mutation. Like `archiveEntry`, this op owns an agent-relevant
 *   invariant, so it joins `MUTATION_OPS` in
 *   `core/operation-invariant-coverage.test.js`.
 *
 * @param {string} root
 * @param {string} id
 * @param {string} acceptedBy
 * @param {string} [reason] — operator-supplied trade-off note
 * @returns {Promise<
 *   | {accepted: true, id, status:"accepted", accepted_at, accepted_by, version}
 *   | {accepted: false, reason: "not_found", id}
 *   | {accepted: false, reason: "not_a_finding", id, entry_kind}
 *   | {accepted: false, reason: "already_accepted", id, current_status}
 *   | {accepted: false, reason: "already_terminal", id, current_status}
 * >}
 */
export function acceptEntry(root, id, acceptedBy, reason) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { accepted: false, reason: "not_found", id };
      const existingEntry = entries[idx];
      if (existingEntry.entry_kind !== "finding") {
        return {
          accepted: false,
          reason: "not_a_finding",
          id,
          entry_kind: existingEntry.entry_kind,
        };
      }
      // Distinct already_accepted branch — `TERMINAL_STATUSES` is the broader
      // set, but a re-accept of an already-accepted finding is a no-op-success
      // in the tool layer (idempotent for operator convenience) and a structured
      // `already_accepted` here (the tool layer promotes it to
      // accepted:true-with-current-state). Keeping the two branches distinct
      // makes the audit trail readable.
      if (existingEntry.status === "accepted") {
        return {
          accepted: false,
          reason: "already_accepted",
          id,
          current_status: "accepted",
          current_version: existingEntry.version ?? 0,
        };
      }
      // `archived` is a terminal tombstone applied by `archiveEntry`. The
      // module-local `TERMINAL_STATUSES` ({resolved, accepted}) intentionally
      // omits `archived` (it is runtime-applied outside the persisted enum),
      // so the `assertinvariant` wrapper below would NOT catch it — without
      // this guard, `acceptEntry` would flip `archived → accepted`,
      // un-archiving a finding. `restoreEntry` is the dedicated revival path;
      // `accept` must not revive. Mirrors the `already_accepted` early-return
      // shape so the audit trail stays readable.
      if (existingEntry.status === "archived") {
        return {
          accepted: false,
          reason: "already_terminal",
          id,
          current_status: "archived",
          current_version: existingEntry.version ?? 0,
        };
      }
      // The universal `assertinvariant` wrapper enforces the broader
      // terminal pre-condition (status not in TERMINAL_STATUSES). Fires
      // before any mutation.
      const invariantResult = await assertAcceptable({
        entry: existingEntry,
        id,
      }, root);
      if (!invariantResult.ok) {
        return {
          accepted: false,
          reason: invariantResult.reason_code ?? "already_terminal",
          id,
          current_status: existingEntry.status ?? null,
        };
      }
      const acceptedAt = new Date().toISOString();
      const currentVersion = existingEntry.version ?? 0;
      const accepted = {
        ...existingEntry,
        status: "accepted",
        accepted_at: acceptedAt,
        accepted_by: acceptedBy,
        ...(reason !== undefined && reason !== null && { accepted_reason: reason }),
        version: currentVersion + 1,
      };
      trueAppendAtomicRaw(root, getRegistryPath(root), accepted);
      invalidateCache(root);
      return {
        accepted: true,
        id,
        status: "accepted",
        accepted_at: acceptedAt,
        accepted_by: acceptedBy,
        ...(reason !== undefined && reason !== null && { accepted_reason: reason }),
        version: currentVersion + 1,
      };
    })
  );
}

// Module-private helper for `acceptEntry` — the universal `assertinvariant`
// wrapper enforces the "status not in TERMINAL_STATUSES" pre-condition. The
// helper is named `assertAcceptable` to keep it in the
// `assertNotArchived` / `assertNotChangeLog` / `assertArchivedTombstone`
// family (the regex in `core/operation-invariant-coverage.test.js` matches
// `async function assertXxx` helpers). Returns the structured failure result
// that the handler returns on the failure path (rather than a flat boolean),
// so the wrapper audit-row is the same shape the caller surfaces.
async function assertAcceptable({ entry, id }, root) {
  return await assertinvariant(
    () => Promise.resolve({ ok: true }),
    {
      accept: {
        context: () => entry,
        check: (e) => !TERMINAL_STATUSES.has(e.status ?? null),
      },
      returnOnFail: {
        reason_code: "already_terminal",
        id,
        current_status: entry.status ?? null,
      },
      root,
    }
  );
}

/**
 * Restore an archived entry to its pre-archive live status + content. Mirrors `archiveEntry`/`deleteEntry` structure
 * (enqueue + withRegistryLock + trueAppendAtomicRaw + invalidateCache).
 *
 * True-appends a new line that supersedes the archive tombstone (max-by-
 * version wins, so the projection picks the restored line). The archive
 * tombstone line stays on disk (union-safe; never removed) — the version
 * sequence [v0 open, v1 archive tombstone, v2 restored] is the audit trail.
 *
 * Rejection shape (DRY with `archiveEntry`): bucket `{restored:false,
 * reason, id}` with a `reason` discriminator:
 *   - `not_archived` — already-active OR change-log (assertArchivedTombstone
 *     returns not_archived; the single wrapper covers both — change-logs are
 *     always status:"active").
 *     The assertinvariant wrapper writes a structured `not_archived` line
 *     to the gate log for audit; the tool return does NOT surface it.
 *   - `delete_not_restorable` — `tombstone_kind:"delete"`. Delete is a
 *     stronger operator intent than archive; unconditional reject, no
 *     opt-out flag (an erroneous archive is recoverable; an erroneous
 *     delete is a deliberate operator decision).
 *   - `not_found` — id missing from the projected registry.
 *   - `no_pre_tombstone_version` — defensive: tombstone exists but no
 *     prior LIVE line found below it (registry corruption / edge case).
 *
 * The pre-tombstone recovery filter MUST exclude prior tombstones
 * (`e.status !== "archived"`). Without it, an `archive → batch-delete →
 * restore` cycle would pick the prior archive tombstone (status:"archived"),
 * clear its markers, and produce a "restored" line that is still archived →
 * a frankenstein tombstone. The filter is load-bearing and is the only fix;
 * no upstream hardening needed (delete is rejected unconditionally
 * downstream by `delete_not_restorable`).
 *
 * No persisted `restored_*` audit fields — the restored line IS the
 * pre-archive state at a new version; the version sequence is the audit
 * trail, the restore *action* is gate-logged via the return's `restored_at`
 * (the caller spreads it into `appendGateLog`).
 *
 * Wrapped with `assertinvariant` (rule `assertinvariant-at-boundary`) for
 * the single `not_archived` pre-condition — gate-log audit covers the
 * already-active and change-log rejection cases via the same wrapper.
 *
 * @param {string} root
 * @param {string} id
 * @param {string} [reason] — operator-supplied restore reason (optional, audit-only)
 * @returns {Promise<
 *   | {restored: true, id, restored_status, restored_at, version}
 *   | {restored: false, reason: "not_archived", id}
 *   | {restored: false, reason: "delete_not_restorable", id, tombstone_kind: "delete"}
 *   | {restored: false, reason: "not_found", id}
 *   | {restored: false, reason: "no_pre_tombstone_version", id}
 * >}
 */
export function restoreEntry(root, id, reason) {
  return enqueue(root, () =>
    withRegistryLock(root, async () => {
      const entries = readRegistry(root);
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) return { restored: false, reason: "not_found", id };
      // assertinvariant wrapper (gate-log audit); returns boolean.
      // Covers change-logs too: they are status:"active", so this returns
      // not_archived before any entry_kind check — no separate
      // change_log_immutable branch.
      if (!(await assertArchivedTombstone(entries, idx, root, id))) {
        return { restored: false, reason: "not_archived", id };
      }
      const current = entries[idx];
      // Delete is a stronger operator intent than archive; not restorable
      // (unconditional, no opt-out flag).
      if (current.tombstone_kind === "delete") {
        return {
          restored: false,
          reason: "delete_not_restorable",
          id,
          tombstone_kind: "delete",
        };
      }
      // Recover pre-tombstone LIVE line: every version for this id below
      // the tombstone, EXCLUDING prior tombstones (status:"archived").
      // Without the status!=="archived" guard, archive→batch-delete→restore
      // would pick the prior archive tombstone and clear its markers →
      // a "restored" line that is still archived (frankenstein tombstone).
      const allVersions = readRegistryAllVersions(root);
      const tombstoneVersion = current.version ?? 0;
      const preTombstoneCandidates = allVersions.filter(
        (e) =>
          e.id === id &&
          (e.version ?? 0) < tombstoneVersion &&
          e.status !== "archived"
      );
      let preTombstone = null;
      for (const candidate of preTombstoneCandidates) {
        if (
          preTombstone === null ||
          (candidate.version ?? 0) > (preTombstone.version ?? 0)
        ) {
          preTombstone = candidate;
        }
      }
      if (!preTombstone) {
        return { restored: false, reason: "no_pre_tombstone_version", id };
      }
      const restoredAt = new Date().toISOString();
      // The restored line IS the pre-archive state at a new version —
      // no restore-specific audit fields. archived_*/tombstone_kind
      // deletes are defensive (preTombstone, a live line, won't carry
      // them).
      const restoredEntry = {
        ...preTombstone,
        status: preTombstone.status, // pre-archive status, NOT "open"
        version: tombstoneVersion + 1,
      };
      delete restoredEntry.archived_at;
      delete restoredEntry.archived_by;
      delete restoredEntry.archived_reason;
      delete restoredEntry.tombstone_kind;
      trueAppendAtomicRaw(root, getRegistryPath(root), restoredEntry);
      invalidateCache(root);
      return {
        restored: true,
        id,
        restored_status: preTombstone.status,
        restored_at: restoredAt,
        reason: reason ?? null,
        version: tombstoneVersion + 1,
      };
    })
  );
}

/**
 * Atomically delete an entry by id (soft CRUD enforcement).
 *
 * Hard-delete is GONE (union-safety forbids
 * line removal — `merge=union` keeps every line from both sides; removing a
 * line on one side and not the other is a conflict, not a delete). The
 * delete operation now appends a tombstone with `tombstone_kind: "delete"`
 * (the discriminator that distinguishes "user requested delete" from
 * "operator archived"). The projection's last-wins-by-max-version picks the
 * tombstone; the list-tool layer hides it.
 *
 * Backward-compat: legacy callers expecting `entries.splice(idx, 1)`
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
      // The universal `assertinvariant`
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
      // True-append (no full rewrite).
      // The shipped line becomes the new max-version per the versioned-append
      // projection.
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
// BATCH_SIZE_LIMIT reduced from 500 → 100 so that
// worst-case batch fits inside the registry-lock's `stale: 30000` window on
// slow disks (Finding 12). Larger batches risk lock-stealing by concurrent
// processes that observe a >30s-old lock. Operators can still override via
// META_STATE_BATCH_LIMIT env var.
// The local definition was removed in favor of importing
// from core/constants.js (single source of truth; 500-vs-100 default divergence fixed).

/**
 * Atomically apply a batch of meta-state operations.
 * All-or-nothing rollback on any failure. Single cache invalidation.
 *
 * True-append per op. Each mutation op
 * (`update`/`archive`/`delete`) appends a new highest-version line to
 * `meta-state.jsonl` instead of mutating-in-place + full-rewrite. The
 * no-op short-circuit (canonical comparator) drops updates that produce
 * no field change. `case "delete"` now routes through `deleteEntry` —
 * the splice is replaced by an `archived` tombstone append with
 * `tombstone_kind: "delete"`. Change-log writes still true-append to
 * `change-log.jsonl`.
 *
 * The all-or-nothing rollback discipline is preserved: ops are validated
 * one-by-one, building `pendingMetaStateAppends` and `pendingChangeLogAppends`;
 * if any op throws we restore `preBatchContent` byte-for-byte and return
 * failure. Applies happen AFTER all validations succeed.
 *
 * Optional `envelope` argument. When present, after a
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
      // In-batch existence accumulator for write-time structural RI. Seeded
      // from the projected registry and grown with every write-op's id (both
      // change-logs and meta-state entries) so an intra-batch "write X then
      // reference X" does not false-warn — change-log ids are queued for
      // later append, not reflected into `entries[]`, so RI must consult this
      // set instead.
      const inBatchIds = new Set(entries.map((e) => e.id));
      // The write path collects one new versioned line per
      // mutation op into pendingMetaStateAppends (no in-place mutation, no
      // full rewrite). Applies happen
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
      // Snapshot the registry BEFORE the batch so
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
              // The universal `assertinvariant`
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
              if (!validation.success) {
                const detail = validation.error.issues
                  .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                  .join("; ");
                throw new Error(`validation_failed: ${detail}`);
              }
              // Per-op structural RI (WARN-ONLY — id-existence) against the
              // in-batch existence accumulator, which includes ids written by
              // earlier ops in this batch (so a write-then-reference within
              // one batch does not false-warn). Same exemptions as writeEntry
              // (applies_to_resolution, "*", tombstones count as present).
              inBatchIds.add(validation.data.id);
              const writeRi = graphResolveStructuralRI(validation.data, inBatchIds);
              warnStructuralRI(root, validation.data.id, writeRi.dangling);
              // Dispatch change-log writes
              // to change-log.jsonl (true-append). Queue them here; append
              // happens AFTER the table persist so a mid-batch failure
              // doesn't leave orphan change-logs behind.
              if (validation.data.entry_kind === "change-log") {
                pendingChangeLogAppends.push(validation.data);
              } else {
                // New entries start at version 0; the projection
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
              // Compute patched entry on a copy; canonical-comparator
              // short-circuit drops no-op updates; otherwise queue the new
              // highest-version line for true-append AND reflect into entries[]
              // so subsequent ops in the same batch see the new state.
              const existingEntry = entries[idx];
              const cleanPatch = { ...patch };
              delete cleanPatch.__proto__;
              delete cleanPatch.constructor;
              delete cleanPatch.entry_kind;
              const patched = withDefaults({ ...existingEntry, ...cleanPatch });
              // Update-time structural RI (WARN-ONLY — changed-only), mirroring
              // the updateEntry boundary. Validates ONLY cross-ref fields the
              // patch introduces or repoints, against the in-batch existence
              // accumulator (in-batch reflection ensures intra-batch
              // write→reference works). Emits an advisory; does NOT reject.
              if (!entriesEqual(patched, existingEntry)) {
                const changedRefs = graphDiffChangedRefs(
                  graphForwardRefs(patched),
                  graphForwardRefs(existingEntry),
                );
                if (changedRefs.length > 0) {
                  const dangling = changedRefs.filter((r) => !inBatchIds.has(r.id));
                  warnStructuralRI(root, patched.id, dangling);
                }
              }
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
              // case "delete" routes through deleteEntry —
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

      // Build the envelope-annotated change-log entry
      // AFTER all ops validate (so a mid-batch throw doesn't leak an auto-emit).
      let autoEmitId = null;
      let autoEmitEntry = null;
      if (envelope) {
        // Compute postRegistrySnapshot from in-memory entries (mutated
        // in-place for the in-memory view). Under true-append the
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
          reason: "Auto-emitted by meta_state_batch envelope pass-through (loop-design-operation-envelope-on-change-log).",
          operation_envelope: builtEnvelope,
          status: "active",
          created_at: new Date().toISOString(),
          version: 0,
        };
      }

      // APPLY the queued appends. If any throw (e.g. fsync failure
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

      // True-append change-log writes (op:"write") AFTER the table
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

      // Auto-emit routes through
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

      // Run assertWriteVisible after
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
 * Status filtering treats the canonical open set
 * (`open`) and the legacy open-equivalent set (`active`/`reported`/`stale`)
 * as a single bucket so consumers see a consistent open set pre-migration.
 * `status:"open"` returns entries where `isOpen(e)` is true; `status:"stale"`,
 * `status:"active"`, and `status:"reported"` still return legacy entries
 * pre-migration (backward compat until the status migration lands).
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
  // the status migration rewrites them. Pre-migration consumers see the consistent open set.
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

    // DEFENSIVE NOTE: this append
    // bypasses writeEntry (uses appendRegistryEntryAtomic directly, with
    // `enqueue` for per-process serialization only — NOT withRegistryLock,
    // so it's NOT cross-process safe). It is test-only (no production
    // callers). Write-time structural RI is intentionally NOT wired here —
    // over-investing in a test-only path with a weaker lock would mask the
    // appending semantics. If a production handler ever calls this, route
    // through writeEntry instead so write-time RI catches dangling refs.
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

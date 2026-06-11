import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { readRegistryWithCache, invalidateCache } from "./read-registry-cache.js";

const REGISTRY_FILENAME = "meta-state.jsonl";
export const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved", "superseded"]);
const COMPACTION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STALENESS_WINDOW_MS = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || 7 * 24 * 60 * 60 * 1000;

// Source-of-truth categories for finding entries. Export so introspection
// layers (e.g. core/loop-introspect.js) can derive from the same source.
export const META_STATE_FINDING_CATEGORIES = [
  "gate-logic-bug", "record-repair-gap", "schema-drift",
  "stale-ref", "mcp-tool-missing", "budget-check",
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
    "stale-ref", "mcp-tool-missing", "budget-check",
    "loop-anti-pattern",
  ]).describe("Category of the finding"),
  severity: z.enum(["warning", "escalate"]).describe("Severity level"),
  affected_system: z.enum([
    "gate-logic", "record-validation", "index-extractor",
    "mcp-tools", "workflow-registry", "vnstock_vendor",
  ]).describe("Which system is affected by this finding"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  subtype: z.string().optional()
    .describe("Subtype for loop-anti-pattern findings (e.g., escape-hatch-abuse, new-artifact-type, schema-bloat)"),
  evidence_journal: z.string().optional().describe("Path to related journal file"),
  evidence_code_ref: z.string().optional().describe("Code reference, e.g. path/to/file.js:line"),
  evidence_test: z.string().optional().describe("Test file reference"),
  status: z.enum(["reported", "active", "resolved", "expired", "superseded", "auto-resolved", "stale"]).optional()
    .describe("Status — 'reported' (24h TTL), 'active' (operator-acked), 'stale' (past TTL or past staleness window; re-verifiable via meta_state_re_verify), 'resolved' (closed), 'expired' (TTL elapsed), 'superseded' (consolidated into a change-log), 'auto-resolved' (closed by mechanism). Use meta_state_ack or meta_state_promote_rule for status transitions."),
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
  mechanism_check: z.boolean().optional()
    .describe("Opt-in flag (SP2): include this finding in grounding checks. Defaults to true when evidence_code_ref is set; false otherwise. The meta_state_report tool applies this default automatically; the field is omitted from the entry if the caller provides neither mechanism_check nor evidence_code_ref. Pass mechanism_check: false to explicitly opt out (the response includes a warning). When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; updated by meta_state_refresh_fingerprint on explicit refresh."),
  expires_at: z.string().nullable().optional()
    .describe("ISO timestamp when a reported entry expires (24h TTL). Set by writeEntry; cleared by meta_state_ack."),
  acked_at: z.string().nullable().optional()
    .describe("ISO timestamp when operator acked the entry (status → active). Set by meta_state_ack."),
  resolved_at: z.string().nullable().optional()
    .describe("ISO timestamp when the entry was resolved. Set by meta_state_resolve."),
  resolved_by: z.string().nullable().optional()
    .describe("Operator or rule id that resolved the entry. Set by meta_state_resolve."),
  resolution: z.string().nullable().optional()
    .describe("Human-readable resolution note. Set by meta_state_resolve."),
  promoted_to_rule: z.string().nullable().optional()
    .describe("Rule id this finding was promoted to. Set by meta_state_promote_rule. Inverse of the rule's origin field."),
  auto_resolve: z.boolean().nullable().optional()
    .describe("If true, the entry is eligible for auto-resolution when TTL expires. Default false."),
  reopens: z.array(z.string()).optional()
    .describe("Finding ids whose `expired` or `stale` lifecycle this entry re-surfaces. Use when a new finding re-flags an issue that was auto-resolved by TTL (expired) or whose verification drifted (stale). Lint orphan ids first with `meta_state_relationship_validate({description})`. Cascade-resolve expired parents via `meta_state_resolve({id: parent, cascade_from: [this_id]})`; stale parents via the same cascade, since `meta_state_resolve` consults the same gate for both statuses. See `tools/learning-loop-mcp/__tests__/meta-state-relationship-validate-tool.test.js` L5 for stale orphan coverage."),
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
  pattern_type: z.enum(["regex", "glob", "resolution-evidence-required"]).describe("Pattern language"),
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
    .describe("SHA-256 of evidence_code_ref; populated by SP2 check_grounding"),
  refined_at: z.string().optional().describe("ISO timestamp of last refinement"),
  refined_by: z.string().optional().describe("Operator id of last refinement"),
  refinement_reason: z.string().optional().describe("Why the rule was last refined"),
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
  proposed_design_for: z.array(z.string()).min(1)
    .describe("Forward: ids of rules/schemas/tools this design will create or modify"),
  addresses: z.array(z.string()).default([])
    .describe("Backward: ids of findings this design responds to (the motivation; the why-this-exists)"),
  description: z.string().min(20).describe("Human-readable summary (min 20 chars)"),
  affected_system: z.enum([
    "gate-logic", "record-validation", "index-extractor",
    "mcp-tools", "workflow-registry", "vnstock_vendor",
  ]).describe("Which system this design affects"),
  severity_hint: z.enum(["low", "medium", "high"]).optional()
    .describe("Operator's read on the urgency of shipping this design"),
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
 */
export const metaStateEntrySchema = z.union([
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateRuleEntrySchema,
  metaStateLoopDesignSchema,
]);

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

/**
 * Atomically append a single entry to the JSONL registry.
 * Queued per-root to prevent read-modify-write races under concurrent calls.
 */
export function writeEntry(root, entry) {
  return enqueue(root, () => {
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
  });
}

/**
 * Atomically update an entry by id, applying a patch object.
 * Also compacts terminal entries older than 7 days.
 * Supports optional compare-and-swap via _expected_version in patch.
 * Returns true if entry found and updated, null if not found,
 * or "version_mismatch" if CAS check fails.
 */
export function updateEntry(root, id, patch) {
  return enqueue(root, () => {
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
    // like "auto-resolved" or "expired" don't apply). The explicit
    // entry_kind guard below enforces this. If a future change-log subtype
    // evolves to have a terminal status, this invariant must be re-verified.
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
  });
}

/**
 * Atomically archive an entry by id. Sets status=archived and adds
 * archived_at, archived_by, archived_reason fields.
 */
export function archiveEntry(root, id, reason, archivedBy) {
  return enqueue(root, () => {
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
  });
}

/**
 * Atomically delete an entry by id (soft CRUD enforcement).
 */
export function deleteEntry(root, id) {
  return enqueue(root, () => {
    const entries = readRegistry(root);
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return { deleted: false, reason: "not_found", id };
    const path = getRegistryPath(root);
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, filtered.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);
    return { deleted: true, id };
  });
}

const BATCH_OP_TYPES = new Set(["write", "update", "delete", "archive"]);
const BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500;

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
  return enqueue(root, async () => {
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
            const { _expected_version, ...patch } = op;
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
        return { applied: 0, failed_at: i, reason: err.message, op };
      }
    }

    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);
    return { applied: operations.length, failed_at: null };
  });
}

/**
 * Check if a reported entry has expired (24h TTL without ack).
 * Returns "stale" if past expires_at and status is reported,
 * null otherwise.
 */
export function checkExpiry(entry) {
  if (entry.status === "stale") return null;
  if (entry.status !== "reported") return null;
  if (!entry.expires_at) return null;
  if (Date.now() > new Date(entry.expires_at).getTime()) {
    return "stale";
  }
  return null;
}

export { STALENESS_WINDOW_MS };

/**
 * Filter entries by optional criteria (category, status, affected_system, session_id).
 * All provided filters must match (AND logic).
 */
export function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    if (filters.entry_kind && entry.entry_kind !== filters.entry_kind) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.session_id && entry.session_id !== filters.session_id) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.affected_system && entry.affected_system !== filters.affected_system) return false;
    return true;
  });
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
      && (e.status === "active" || e.status === "reported")
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

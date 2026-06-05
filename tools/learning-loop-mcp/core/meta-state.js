import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const REGISTRY_FILENAME = "meta-state.jsonl";
const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved", "superseded"]);
const COMPACTION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
  entry_kind: z.literal("finding").default("finding"),
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
  status: z.enum(["reported", "superseded"]).optional()
    .describe("Status — 'reported' or 'superseded' allowed via this tool. Use meta_state_ack or meta_state_promote_rule for other statuses. 'superseded' is a terminal status indicating the entry is no longer the canonical source; the canonical source is the change-log referenced by consolidated_into."),
  consolidated_into: z.string().optional()
    .describe("For status='superseded' entries: the id of the change-log entry that is the canonical source. Inverse of the change-log's 'consolidates' field."),
  session_id: z.string().optional()
    .describe("Idempotency key for hook-emitted findings. When set, the entry is unique per session. The MCP connection hook (Phase 4) uses this to avoid emitting the same finding twice in one session."),
  mechanism_check: z.boolean().optional()
    .describe("Opt-in flag (SP2): include this finding in grounding checks. Default false. When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref."),
  code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()
    .describe("SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; updated by meta_state_refresh_fingerprint on explicit refresh."),
});

/**
 * Change-log branch schema — used by meta_state_log_change.
 * Has .shape available for tool schema reuse.
 */
export const metaStateChangeEntrySchema = z.object({
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
  evidence: z.object({
    code_ref: z.string().optional(),
    journal: z.string().optional(),
  }).optional().describe("Path to related journal/plans/reports file"),
  status: z.literal("active").default("active").describe("Status — change-log entries are always 'active' (immutable audit log)"),
  created_at: z.string().describe("ISO timestamp"),
  version: z.number().default(0).describe("CAS version (not used by change-log entries but consistent shape)"),
});

/**
 * Cross-cutting union validator — for readRegistry validation, loop_describe, etc.
 * Does NOT have .shape (by zod design); use the branch schemas for .shape.
 */
export const metaStateEntrySchema = z.union([
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
]);

/** Per-root write queue to prevent read-modify-write races. */
const writeQueues = new Map();

function enqueue(root, fn) {
  const key = root;
  const prev = writeQueues.get(key) || Promise.resolve();
  const next = prev.then(fn).catch(() => {}); // swallow errors to keep chain alive
  writeQueues.set(key, next);
  return next;
}

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

/**
 * Read the JSONL registry and return an array of parsed entries.
 * Returns empty array if the file does not exist.
 */
export function readRegistry(root) {
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
 * Atomically append a single entry to the JSONL registry.
 * Queued per-root to prevent read-modify-write races under concurrent calls.
 */
export function writeEntry(root, entry) {
  return enqueue(root, () => {
    const path = getRegistryPath(root);
    const lines = existsSync(path)
      ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "")
      : [];
    lines.push(JSON.stringify(entry));
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, lines.join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
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
    return true;
  });
}

/**
 * Check if a reported entry has expired (24h TTL without ack).
 * Returns "expired" if past expires_at and status is reported,
 * null otherwise.
 */
export function checkExpiry(entry) {
  if (entry.status !== "reported") return null;
  if (!entry.expires_at) return null;
  if (Date.now() > new Date(entry.expires_at).getTime()) {
    return "expired";
  }
  return null;
}

/**
 * Filter entries by optional criteria (category, status, affected_system).
 * All provided filters must match (AND logic).
 */
export function filterEntries(entries, filters) {
  return entries.filter((entry) => {
    if (filters.entry_kind && entry.entry_kind !== filters.entry_kind) return false;
    if (filters.category && entry.category !== filters.category) return false;
    if (filters.status && entry.status !== filters.status) return false;
    if (filters.affected_system && entry.affected_system !== filters.affected_system) return false;
    return true;
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

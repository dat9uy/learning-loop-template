import { readFileSync, writeFileSync, existsSync, statSync, renameSync, appendFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { z } from "zod";

const REGISTRY_FILENAME = "meta-state.jsonl";
const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);
const COMPACTION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Shared zod schema for meta_state_report input validation.
 * Lives in meta-state.js (the registry source of truth) per RT Finding 11.
 */
export const metaStateEntrySchema = z.object({
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
  auto_resolve_file: z.string().optional().describe("File path to watch for auto-resolve"),
  auto_resolve_line_range: z.array(z.number()).optional().describe("Line range [start, end] for auto-resolve"),
  status: z.enum(["reported"]).optional()
    .describe("Status — only 'reported' allowed via this tool. Use meta_state_ack or meta_state_promote_rule for other statuses."),
});

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
  return lines.map((line) => JSON.parse(line));
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
    const updated = entries.filter((entry) => {
      const age = now - new Date(entry.created_at).getTime();
      if (TERMINAL_STATUSES.has(entry.status) && age > COMPACTION_AGE_MS) {
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
 * Check if an entry should auto-resolve based on file mtime.
 * Returns "auto-resolved" if the watched file was modified after entry creation,
 * null otherwise.
 */
export function checkAutoResolve(entry, root) {
  if (!entry.auto_resolve || !entry.auto_resolve.file_modified) return null;
  let filePath = entry.auto_resolve.file_modified;
  if (!isAbsolute(filePath)) {
    filePath = join(root, filePath);
  }
  if (!existsSync(filePath)) return null;
  const mtime = statSync(filePath).mtime.getTime();
  const created = new Date(entry.created_at).getTime();
  if (mtime > created) {
    return "auto-resolved";
  }
  return null;
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

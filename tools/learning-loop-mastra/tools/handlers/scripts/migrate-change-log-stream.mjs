#!/usr/bin/env node
// Plan 260715-0801 Tier 1 Phase 2 step 4: one-time migration script.
//
// Splits the meta-state registry by mutability/lifecycle:
//   - entry_kind=change-log → change-log.jsonl (true-append, merge=union)
//   - entry_kind=finding|rule|loop-design → meta-state.jsonl (mutable table)
//
// Concurrent-safety: wraps the read+partition+rewrite window in
// `withRegistryLock(root, ...)` (Red Team F8b — the canonical cross-process
// write gate; background hooks/MCP auto-emit serialize on the same lockfile).
//
// Idempotency: detects the post-migration state (change-log.jsonl exists AND
// meta-state.jsonl has zero change-log entries AND zero intra-file duplicate
// ids) and exits 0 without rewriting. Re-running on a migrated tree is a no-op.
//
// Pre-flight: dedupes by id FIRST (Red Team F3 — live file had 313 lines / 309
// unique ids at planning time; Phase 01a already collapsed the 4 historical
// dup-id groups, but the script is defensive and re-dedupes regardless).
//
// Pre-flight: normalizes `consolidates` from a legacy single-string (CSV)
// value to a one-element array (Validation Session 1 Q2 + Phase 2 schema
// change to z.array(z.string())). New writes already use arrays.
//
// Order within each file: preserves the live file order so the
// created_at-ascending sort in `_readAndParseRegistry` remains stable.
//
// Usage:
//   node migrate-change-log-stream.mjs [--root=<path>] [--dry-run]
//
// Exit codes:
//   0 — success (migration ran, or tree was already in post-migration state)
//   1 — pre-migration invariant violated (counts mismatch)
//   2 — I/O error / lock acquisition failed

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { withRegistryLock } from "../../../core/registry-lock.js";
import { invalidateCache } from "../../../core/read-registry-cache.js";

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const dryRun = args.includes("--dry-run");
const root = rootArg ? rootArg.slice("--root=".length) : process.cwd();

const META_STATE_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";
const LOCK_FILENAME = ".meta-state.lock";

const metaPath = join(root, META_STATE_FILENAME);
const changeLogPath = join(root, CHANGE_LOG_FILENAME);
const lockPath = join(root, LOCK_FILENAME);

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line));
  }
  return out;
}

function writeJsonlAtomic(filePath, entries) {
  const tmp = filePath + ".tmp";
  const body = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(tmp, body, "utf8");
  renameSync(tmp, filePath);
}

// Plan 260715-0801 Validation Q2: schema is z.array(z.string()). Normalize
// the legacy single-string form to a one-element array. Tolerates already-
// normalized arrays (no-op) and missing/undefined values.
function normalizeConsolidates(entry) {
  if (entry.entry_kind !== "change-log") return entry;
  const cl = entry.consolidates;
  if (cl === undefined || cl === null) return entry;
  if (Array.isArray(cl)) return entry;
  if (typeof cl === "string") {
    const ids = cl.split(",").map((s) => s.trim()).filter(Boolean);
    return { ...entry, consolidates: ids };
  }
  // Unknown form — drop silently (defensive; the schema would have rejected
  // it on write, so this branch is unreachable on validated entries).
  const { consolidates: _drop, ...rest } = entry;
  return rest;
}

// Red Team F3: dedupe by id FIRST, keeping max_by(.version) with
// created_at-desc as the tie-break (later wins). Phase 01a already collapsed
// the 4 historical dup-id groups at planning time, but this script is
// defensive and re-dedupes regardless.
function dedupeById(entries) {
  const byId = new Map();
  for (const entry of entries) {
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
  return [...byId.values()];
}

async function run() {
  if (!existsSync(metaPath)) {
    console.error(`migrate-change-log-stream: meta-state.jsonl not found at ${metaPath}`);
    process.exit(2);
  }

  // Idempotency: detect the post-migration state and exit 0.
  if (existsSync(changeLogPath)) {
    const meta = readJsonl(metaPath);
    const hasChangeLogInMeta = meta.some((e) => e.entry_kind === "change-log");
    const metaIds = new Set(meta.map((e) => e.id));
    const dupIdsInMeta = meta.length !== metaIds.size;
    const cl = readJsonl(changeLogPath);
    const clIds = new Set(cl.map((e) => e.id));
    const dupIdsInCl = cl.length !== clIds.size;
    if (!hasChangeLogInMeta && !dupIdsInMeta && !dupIdsInCl) {
      console.log(
        `migrate-change-log-stream: tree is already in post-migration state ` +
          `(meta-state=${meta.length} lines / ${metaIds.size} unique ids, ` +
          `change-log=${cl.length} lines / ${clIds.size} unique ids). ` +
          `No-op.`
      );
      return;
    }
    console.error(
      `migrate-change-log-stream: change-log.jsonl exists but tree is NOT in ` +
        `post-migration state (meta change-logs=${hasChangeLogInMeta}, ` +
        `meta dup-ids=${dupIdsInMeta}, change-log dup-ids=${dupIdsInCl}). ` +
        `Refusing to run; inspect manually.`
    );
    process.exit(1);
  }

  // Acquire the cross-process write lock so concurrent MCP servers /
  // background hooks serialize on this rewrite window.
  try {
    await withRegistryLock(root, async () => {
      const raw = readJsonl(metaPath);
      const deduped = dedupeById(raw);
      const dupCount = raw.length - deduped.length;

      const normalized = deduped.map(normalizeConsolidates);
      const changeLogs = normalized.filter((e) => e.entry_kind === "change-log");
      const nonChangeLogs = normalized.filter((e) => e.entry_kind !== "change-log");
      // Sanity: every entry must have an entry_kind. If not, we have an
      // entry that is neither change-log nor a recognized table kind.
      const unknownKind = normalized.filter(
        (e) => !["change-log", "finding", "rule", "loop-design"].includes(e.entry_kind)
      );

      console.log(`migrate-change-log-stream: read ${raw.length} lines (${deduped.length} unique ids, ${dupCount} dupes collapsed)`);
      console.log(`migrate-change-log-stream: partition — change-logs: ${changeLogs.length}, table: ${nonChangeLogs.length}, unknown-kind: ${unknownKind.length}`);
      if (unknownKind.length > 0) {
        console.error(`migrate-change-log-stream: ${unknownKind.length} entries have an unrecognized entry_kind (sample ids: ${unknownKind.slice(0, 3).map((e) => e.id).join(", ")})`);
        process.exit(1);
      }

      // Counts must match: the union post-migration must equal the deduped
      // pre-migration line count (excluding the dupes collapsed).
      if (changeLogs.length + nonChangeLogs.length !== deduped.length) {
        console.error("migrate-change-log-stream: partition counts don't sum to input");
        process.exit(1);
      }

      // Zero intra-file duplicate ids in the change-log set (acceptance).
      const clIds = new Set(changeLogs.map((e) => e.id));
      if (clIds.size !== changeLogs.length) {
        console.error("migrate-change-log-stream: change-log set has duplicate ids");
        process.exit(1);
      }
      const tableIds = new Set(nonChangeLogs.map((e) => e.id));
      if (tableIds.size !== nonChangeLogs.length) {
        console.error("migrate-change-log-stream: table set has duplicate ids");
        process.exit(1);
      }

      if (dryRun) {
        console.log("[dry-run] would write change-log.jsonl with " + changeLogs.length + " entries");
        console.log("[dry-run] would rewrite meta-state.jsonl with " + nonChangeLogs.length + " entries");
        console.log("[dry-run] sample change-log entry: " + (changeLogs[0] ? JSON.stringify(changeLogs[0]).slice(0, 200) + "..." : "<none>"));
        console.log("[dry-run] sample table entry: " + (nonChangeLogs[0] ? JSON.stringify(nonChangeLogs[0]).slice(0, 200) + "..." : "<none>"));
        return;
      }

      // Write change-log.jsonl (preserve order).
      writeJsonlAtomic(changeLogPath, changeLogs);
      // Rewrite meta-state.jsonl without change-logs (preserve order).
      writeJsonlAtomic(metaPath, nonChangeLogs);

      // Bust the read cache so subsequent reads see the new files.
      invalidateCache(root);

      console.log(`migrate-change-log-stream: WROTE change-log.jsonl (${changeLogs.length} entries) and meta-state.jsonl (${nonChangeLogs.length} entries)`);
    });
  } catch (err) {
    console.error(`migrate-change-log-stream: ${err.message}`);
    process.exit(2);
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err.stack || err.message);
    process.exit(2);
  }
);
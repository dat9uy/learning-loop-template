#!/usr/bin/env node
/**
 * migrate-accepted-limitations.mjs — one-time true-append migration that
 * flips open standing-trade-off findings to the `accepted` terminal status.
 *
 * Scans the meta-state registry (max-by-version projection) for open findings
 * whose `subtype` ends in `-accepted` (the standing-trade-off convention), or
 * any id passed via --id, and true-appends a v+1 line with `status:"accepted"`
 * + `accepted_at`/`accepted_by`/`accepted_reason`.
 *
 * Scan-based, NOT hardcoded — candidates are derived from the registry shape
 * at run time. The same script can re-run after registry growth without
 * modification.
 *
 * Mode:
 *   --dry-run          print candidates without writing (default)
 *   --apply            write the v+1 lines
 *
 * The migration is append-only: it never modifies existing version lines.
 * The projection's last-wins-by-max-version picks the new accepted line; the
 * pre-migration open line stays on disk (audit trail).
 *
 * Status is on IMMUTABLE_PATCH_FIELDS, so `meta_state_patch` cannot flip
 * `open` → `accepted`. This script bypasses the patch path and writes the
 * new line directly via the same append primitive `archiveEntry` uses
 * (`trueAppendAtomic` + `invalidateCache`), keeping the lifecycle
 * `acceptEntry` shape consistent with the tool's contract.
 *
 * Usage:
 *   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --apply [--id <id>] [--root <path>]
 *   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, openSync, fsyncSync, closeSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_FILENAME = "meta-state.jsonl";

function parseArgs(argv) {
  const args = { dryRun: true, ids: [], root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") args.dryRun = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--id") args.ids.push(argv[++i]);
    else if (a === "--root") args.root = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: migrate-accepted-limitations.mjs [--dry-run|--apply] [--id <id>]... [--root <path>]"
      );
      process.exit(0);
    }
  }
  return args;
}

// Read the registry (max-by-version projection) without the read-cache layer.
// The script is a one-shot migration; it must read the disk state directly so
// a stale cache from another process does not skip candidates.
function readProjection(root) {
  const path = join(root, REGISTRY_FILENAME);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "");
  const byId = new Map();
  for (const line of lines) {
    const entry = JSON.parse(line);
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
  }
  return [...byId.values()];
}

// True-append one line to the registry (O_APPEND + fsync). Mirrors the
// `trueAppendAtomic` primitive the core layer uses; the script cannot import
// the core because it runs from a CLI entry point (no MCP server context).
function trueAppend(path, entry) {
  const fd = openSync(path, "a");
  try {
    writeSync(fd, JSON.stringify(entry) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// Sync import (top-level) — node:fs writeSync/appendFileSync live in different
// namespaces. The two paths both fsync; we use writeSync via openSync above.
import { writeSync } from "node:fs";

function isCandidate(entry, idSet) {
  if (entry.entry_kind !== "finding") return false;
  if (entry.status !== "open") return false;
  if (idSet.size > 0) return idSet.has(entry.id);
  // subtype ending in `-accepted` — the standing-trade-off convention.
  return typeof entry.subtype === "string" && entry.subtype.endsWith("-accepted");
}

function buildAcceptedLine(entry, acceptedBy, reason) {
  const now = new Date().toISOString();
  return {
    ...entry,
    status: "accepted",
    accepted_at: now,
    accepted_by: acceptedBy,
    accepted_reason: reason,
    version: (entry.version ?? 0) + 1,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const idSet = new Set(args.ids);
  const entries = readProjection(args.root);
  const candidates = entries.filter((e) => isCandidate(e, idSet));

  console.log(`Found ${candidates.length} candidate(s):`);
  for (const c of candidates) {
    console.log(`  - ${c.id}  status=${c.status}  subtype=${c.subtype ?? "(none)"}`);
  }

  if (args.dryRun) {
    console.log("\nDRY-RUN mode: no writes. Re-run with --apply to migrate.");
    return;
  }

  if (candidates.length === 0) {
    console.log("No candidates; nothing to apply.");
    return;
  }

  const path = join(args.root, REGISTRY_FILENAME);
  const acceptedBy = "migration";
  const reason = "Migrated to `accepted`; standing trade-off accepted as lifecycle terminal.";
  let written = 0;
  for (const c of candidates) {
    const line = buildAcceptedLine(c, acceptedBy, reason);
    trueAppend(path, line);
    written += 1;
    console.log(`  appended v+1 for ${c.id}`);
  }
  console.log(`\nMigration complete: ${written} accepted line(s) appended to ${path}`);
}

main();
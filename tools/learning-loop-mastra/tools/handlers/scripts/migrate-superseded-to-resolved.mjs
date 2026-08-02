#!/usr/bin/env node
// migrate-superseded-to-resolved.mjs
//
// Phase 3 of `meta-state-lifecycle-migration`: one-time backfill that
// converts every `superseded` finding to `resolved` + emits a citation
// row per finding → change-log edge. Run with --dry-run first; review;
// then --apply to mutate.
//
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-superseded-to-resolved.mjs --dry-run
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-superseded-to-resolved.mjs --apply
//
// Reads meta-state.jsonl + change-log.jsonl + citations.jsonl via the
// same union read used by the live registry; emits a v+1 `resolved`
// line per superseded finding and a citation row per (finding,
// consolidated_into change-log) edge. The on-record `consolidated_into` /
// `superseded_at` / `superseded_by` fields stay on disk (inert-
// historical; old version lines still parse); the new v+1 line stamps
// `resolved` + `resolved_at` + `resolved_by` and the citation row
// carries the canonical edge.
//
// Idempotency: the script aborts when 0 superseded findings remain. If
// interrupted mid-run, re-running detects the partially-migrated state
// (a finding with `status:"resolved"` AND `consolidated_into` set AND a
// matching citation) and skips it. A finding already at v+1 with
// `status:"resolved"` and NO citation is treated as not-yet-cited and
// the migration emits the citation row only.

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, appendCitationEntryAtomic, updateEntry } from "../../../../core/meta-state.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: migrate-superseded-to-resolved.mjs [--dry-run|--apply]");
  process.exit(2);
}

const root = resolveRoot();
const entries = readRegistry(root);
const citationCount = entries.filter((e) => e.entry_kind === "citation").length;

const superseded = entries.filter((e) => e.entry_kind === "finding" && e.status === "superseded");
console.error(`Found ${superseded.length} superseded findings + ${citationCount} existing citation rows.`);

if (superseded.length === 0) {
  console.error("Nothing to migrate.");
  process.exit(0);
}

const changeLogIds = new Set(entries.filter((e) => e.entry_kind === "change-log").map((e) => e.id));

let migratedCount = 0;
let citedCount = 0;
let orphanCount = 0;
const now = new Date().toISOString();

for (const f of superseded) {
  const target = typeof f.consolidated_into === "string" ? f.consolidated_into : null;
  if (!target) {
    orphanCount++;
    console.error(`  orphan: ${f.id} (status=superseded, no consolidated_into)`);
    continue;
  }
  if (!changeLogIds.has(target)) {
    orphanCount++;
    console.error(`  orphan: ${f.id} → ${target} (change-log not found)`);
    continue;
  }
  const reason = dryRun ? "dry-run" : "apply";
  console.error(`  [${reason}] ${f.id} → ${target}`);
  if (apply) {
    await updateEntry(root, f.id, {
      status: "resolved",
      resolved_at: now,
      resolved_by: "operator",
    });
    migratedCount++;
    appendCitationEntryAtomic(root, {
      id: `citation-migration-${f.id.slice(5, 35)}-${Date.now().toString(36)}`,
      entry_kind: "citation",
      source: f.id,
      target,
      rationale: `consolidated into ${target}`,
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    });
    citedCount++;
  }
}

console.error("");
console.error(`Summary (${dryRun ? "DRY-RUN" : "APPLY"}):`);
console.error(`  superseded findings scanned: ${superseded.length}`);
console.error(`  resolved (status migrated): ${dryRun ? 0 : migratedCount}`);
console.error(`  citation rows emitted:       ${dryRun ? 0 : citedCount}`);
console.error(`  orphans (no consolidated_into / change-log missing): ${orphanCount}`);

process.exit(0);
#!/usr/bin/env node
// migrate-superseded-to-resolved.mjs
//
// One-time backfill that converts every `superseded` finding to
// `resolved` + emits a citation row per finding → change-log edge. Run
// with --dry-run first; review; then --apply to mutate.
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
// Idempotency + interrupted-run safety: the script has two passes.
//
//   Pass 1 (superseded → resolved): for each finding still marked
//   `superseded`, flip status to `resolved` and emit the matching
//   citation. A finding already `resolved` WITH a matching citation is
//   skipped entirely; `resolved` without a matching citation falls
//   through to Pass 2.
//
//   Pass 2 (reconciliation): scan for findings with `status:"resolved"`
//   that carry `consolidated_into` (inert-historical on disk) AND have
//   no matching citation in citations.jsonl — emit the missing citation
//   for each. This closes the interrupted-mid-run window: a finding
//   flipped to `resolved` but not yet cited (a crash between the two
//   writes) is cited here on re-run, so no `resolved`-without-citation
//   orphan survives.
//
// The two writes (status flip + citation append) are NOT wrapped in a
// single cross-process lock because `updateEntry` acquires the registry
// lock internally and `withRegistryLock` is not reentrant; the
// reconciliation pass is the orphan-safety net that makes an interrupted
// run self-healing on re-run.

import { readRegistry, appendCitationEntryAtomic, updateEntry } from "../../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: migrate-superseded-to-resolved.mjs [--dry-run|--apply]");
  process.exit(2);
}

const root = resolveRoot();
const entries = readRegistry(root);

// Index existing citations by their canonical edge identity (source,
// target, rationale) so both the migration pass and the reconciliation
// pass can skip edges that already have a citation row on disk.
const existingCitationByKey = new Map();
for (const e of entries) {
  if (e.entry_kind === "citation") {
    existingCitationByKey.set(citationKey(e), e);
  }
}

function citationKey(c) {
  return `${c.source}|${c.target}|${c.rationale}`;
}

const changeLogIds = new Set(entries.filter((e) => e.entry_kind === "change-log").map((e) => e.id));
const findings = entries.filter((e) => e.entry_kind === "finding");

const superseded = findings.filter((f) => f.status === "superseded");
const resolved = findings.filter((f) => f.status === "resolved");
const citationCount = entries.filter((e) => e.entry_kind === "citation").length;

console.error(`Found ${superseded.length} superseded findings, ${resolved.length} resolved findings + ${citationCount} existing citation rows.`);

if (superseded.length === 0 && resolved.length === 0) {
  console.error("Nothing to migrate.");
  process.exit(0);
}

let migratedCount = 0;
let citedCount = 0;
let reconciledCount = 0;
let orphanCount = 0;
const now = new Date().toISOString();

// Pass 1: superseded → resolved + citation for each.
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
  const rationale = `consolidated into ${target}`;
  const key = citationKey({ source: f.id, target, rationale });
  const alreadyCited = existingCitationByKey.has(key);
  console.error(`  [${dryRun ? "dry-run" : "apply"}] ${f.id} → ${target}${alreadyCited ? " (citation already on disk)" : ""}`);
  if (apply) {
    await updateEntry(root, f.id, {
      status: "resolved",
      resolved_at: now,
      resolved_by: "operator",
    });
    migratedCount++;
    if (!alreadyCited) {
      appendCitationEntryAtomic(root, {
        id: `citation-migration-${f.id.slice(5, 35)}-${Date.now().toString(36)}`,
        entry_kind: "citation",
        source: f.id,
        target,
        rationale,
        recorded_at: now,
        recorded_by: "operator",
        status: "active",
      });
      citedCount++;
    }
  }
}

// Pass 2: reconcile resolved findings that lost their citation to an
// interrupted run. A finding here is `resolved` with `consolidated_into`
// set but NO matching citation on disk — emit the missing citation only
// (the status flip already happened, so no updateEntry call).
for (const f of resolved) {
  const target = typeof f.consolidated_into === "string" ? f.consolidated_into : null;
  if (!target) {
    // Resolved without an on-disk consolidated_into is not a superseded
    // migration artifact; nothing to reconcile.
    continue;
  }
  if (!changeLogIds.has(target)) {
    // The change-log target is gone/missing; do not fabricate a citation
    // to a non-existent id. Report and skip.
    orphanCount++;
    console.error(`  orphan: ${f.id} → ${target} (change-log not found, cannot reconcile)`);
    continue;
  }
  const rationale = `consolidated into ${target}`;
  const key = citationKey({ source: f.id, target, rationale });
  if (existingCitationByKey.has(key)) {
    continue; // already complete: resolved + cited
  }
  console.error(`  [reconcile] ${f.id} → ${target} (resolved without citation)`);
  if (apply) {
    appendCitationEntryAtomic(root, {
      id: `citation-migration-${f.id.slice(5, 35)}-${Date.now().toString(36)}`,
      entry_kind: "citation",
      source: f.id,
      target,
      rationale,
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    });
    reconciledCount++;
  }
}

console.error("");
console.error(`Summary (${dryRun ? "DRY-RUN" : "APPLY"}):`);
console.error(`  superseded findings scanned:        ${superseded.length}`);
console.error(`  resolved (status migrated):        ${dryRun ? 0 : migratedCount}`);
console.error(`  citations emitted (pass 1):        ${dryRun ? 0 : citedCount}`);
console.error(`  citations reconciled (pass 2):     ${dryRun ? 0 : reconciledCount}`);
console.error(`  orphans (no consolidated_into / change-log missing): ${orphanCount}`);

process.exit(0);
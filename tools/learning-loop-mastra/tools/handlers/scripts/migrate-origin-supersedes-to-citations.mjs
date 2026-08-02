#!/usr/bin/env node
// migrate-origin-supersedes-to-citations.mjs
//
// One-time backfill that emits citation rows for the on-disk `origin` /
// `supersedes` / `promoted_to_rule` edges that pre-date the citation
// migration. Run with --dry-run first; review; then --apply to mutate.
//
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-origin-supersedes-to-citations.mjs --dry-run
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-origin-supersedes-to-citations.mjs --apply
//
// Scans meta-state.jsonl + change-log.jsonl + citations.jsonl via the
// union read. Emits a citation row per rule.origin (source:rule,
// target:finding, rationale:"origin"), per change-log/rule.supersedes
// (source:new, target:prior, rationale:"supersedes"), and per finding
// with on-record `promoted_to_rule` (legacy dual-field). The on-record
// fields stay on disk (inert-historical; old version lines still parse);
// the new citations carry the going-forward edge.
//
// Idempotency: a citation is emitted only when no citation with the same
// (source, target, rationale) triple already exists on disk OR has
// already been emitted in the current run. This makes --apply safe to
// re-run and also de-duplicates the case where a rule with `origin`
// whose source finding also carries `promoted_to_rule` would otherwise
// produce two identical (source=rule, target=finding, rationale="origin")
// citations in a single run.

import { readRegistry, appendCitationEntryAtomic } from "../../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");

if (!dryRun && !apply) {
  console.error("Usage: migrate-origin-supersedes-to-citations.mjs [--dry-run|--apply]");
  process.exit(2);
}

const root = resolveRoot();
const entries = readRegistry(root);
const now = new Date().toISOString();

// Build the existing-citation key set from the union read so re-runs do
// not accumulate duplicate citation rows. The dedup key is the canonical
// edge identity: (source, target, rationale). A citation row is emitted
// only when this triple is novel both on disk and within the current run.
const existingCitationKeys = new Set();
for (const e of entries) {
  if (e.entry_kind === "citation") {
    existingCitationKeys.add(citationKey(e));
  }
}
const emittedThisRun = new Set();

function citationKey(c) {
  return `${c.source}|${c.target}|${c.rationale}`;
}

function shouldEmit(citation) {
  const key = citationKey(citation);
  if (existingCitationKeys.has(key) || emittedThisRun.has(key)) {
    return false;
  }
  emittedThisRun.add(key);
  return true;
}

let originCount = 0;
let supersedesCount = 0;
let promotedToRuleCount = 0;
let skippedCount = 0;

function emit(citation, label, id) {
  if (!shouldEmit(citation)) {
    skippedCount++;
    console.error(`  [skip:dup] ${label} ${id} → ${citation.target}`);
    return false;
  }
  if (apply) {
    appendCitationEntryAtomic(root, citation);
  }
  return true;
}

for (const e of entries) {
  if (e.entry_kind === "rule" && typeof e.origin === "string" && e.origin.length > 0) {
    const citation = {
      id: `citation-origin-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
      entry_kind: "citation",
      source: e.id,
      target: e.origin,
      rationale: "origin",
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    };
    console.error(`  [origin] ${e.id} → ${e.origin}`);
    if (emit(citation, "[origin]", e.id) && apply) {
      originCount++;
    }
  }
  if ((e.entry_kind === "change-log" || e.entry_kind === "rule") && typeof e.supersedes === "string" && e.supersedes.length > 0) {
    const citation = {
      id: `citation-supersedes-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
      entry_kind: "citation",
      source: e.id,
      target: e.supersedes,
      rationale: "supersedes",
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    };
    console.error(`  [supersedes] ${e.id} → ${e.supersedes}`);
    if (emit(citation, "[supersedes]", e.id) && apply) {
      supersedesCount++;
    }
  }
  if (e.entry_kind === "finding" && typeof e.promoted_to_rule === "string" && e.promoted_to_rule.length > 0) {
    // promoted_to_rule was the dual-field mirror of rule.origin; emit
    // a citation row with source=rule, target=finding for symmetry. The
    // dedup guard means a rule whose `origin` already produced the same
    // (source=rule, target=finding, rationale="origin") edge is skipped
    // here rather than emitting a duplicate.
    const citation = {
      id: `citation-promoted-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
      entry_kind: "citation",
      source: e.promoted_to_rule,
      target: e.id,
      rationale: "origin",
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    };
    console.error(`  [promoted_to_rule] ${e.id} → ${e.promoted_to_rule}`);
    if (emit(citation, "[promoted_to_rule]", e.id) && apply) {
      promotedToRuleCount++;
    }
  }
}

console.error("");
console.error(`Summary (${dryRun ? "DRY-RUN" : "APPLY"}):`);
console.error(`  origin citations emitted:        ${dryRun ? 0 : originCount}`);
console.error(`  supersedes citations emitted:    ${dryRun ? 0 : supersedesCount}`);
console.error(`  promoted_to_rule citations:      ${dryRun ? 0 : promotedToRuleCount}`);
console.error(`  skipped (duplicate edge):        ${skippedCount}`);

process.exit(0);
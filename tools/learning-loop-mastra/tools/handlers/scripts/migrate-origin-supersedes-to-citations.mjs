#!/usr/bin/env node
// migrate-origin-supersedes-to-citations.mjs
//
// Phase 4 of `meta-state-lifecycle-migration`: one-time backfill that
// emits citation rows for the on-disk `origin` / `supersedes` /
// `promoted_to_rule` edges that pre-date the citation migration. Run
// with --dry-run first; review; then --apply to mutate.
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

import { readRegistry, appendCitationEntryAtomic } from "../../../../core/meta-state.js";
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

let originCount = 0;
let supersedesCount = 0;
let promotedToRuleCount = 0;
let skippedCount = 0;

for (const e of entries) {
  if (e.entry_kind === "rule" && typeof e.origin === "string" && e.origin.length > 0) {
    console.error(`  [origin] ${e.id} → ${e.origin}`);
    if (apply) {
      appendCitationEntryAtomic(root, {
        id: `citation-origin-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
        entry_kind: "citation",
        source: e.id,
        target: e.origin,
        rationale: "origin",
        recorded_at: now,
        recorded_by: "operator",
        status: "active",
      });
      originCount++;
    }
  }
  if ((e.entry_kind === "change-log" || e.entry_kind === "rule") && typeof e.supersedes === "string" && e.supersedes.length > 0) {
    console.error(`  [supersedes] ${e.id} → ${e.supersedes}`);
    if (apply) {
      appendCitationEntryAtomic(root, {
        id: `citation-supersedes-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
        entry_kind: "citation",
        source: e.id,
        target: e.supersedes,
        rationale: "supersedes",
        recorded_at: now,
        recorded_by: "operator",
        status: "active",
      });
      supersedesCount++;
    }
  }
  if (e.entry_kind === "finding" && typeof e.promoted_to_rule === "string" && e.promoted_to_rule.length > 0) {
    console.error(`  [promoted_to_rule] ${e.id} → ${e.promoted_to_rule}`);
    if (apply) {
      // promoted_to_rule was the dual-field mirror of rule.origin; emit
      // a citation row with source=rule, target=finding for symmetry.
      appendCitationEntryAtomic(root, {
        id: `citation-promoted-migration-${e.id.slice(5, 35)}-${Date.now().toString(36)}`,
        entry_kind: "citation",
        source: e.promoted_to_rule,
        target: e.id,
        rationale: "origin",
        recorded_at: now,
        recorded_by: "operator",
        status: "active",
      });
      promotedToRuleCount++;
    }
  }
}

console.error("");
console.error(`Summary (${dryRun ? "DRY-RUN" : "APPLY"}):`);
console.error(`  origin citations emitted:        ${dryRun ? 0 : originCount}`);
console.error(`  supersedes citations emitted:    ${dryRun ? 0 : supersedesCount}`);
console.error(`  promoted_to_rule citations:      ${dryRun ? 0 : promotedToRuleCount}`);
console.error(`  skipped:                        ${skippedCount}`);

process.exit(0);
#!/usr/bin/env node
// migrate-accepted-limitations.mjs — one-time migration that flips open
// standing-trade-off findings to the `accepted` terminal status.
//
// Scans the meta-state registry (max-by-version projection) for open
// findings whose `subtype` ends in `-accepted` (the standing-trade-off
// convention), or any id passed via --id, and flips each to `accepted`
// via the core `acceptEntry` op.
//
// Scan-based, NOT hardcoded — candidates are derived from the registry
// shape at run time. The same script can re-run after registry growth
// without modification.
//
// Mode:
//   --dry-run          print candidates without writing (default)
//   --apply            write the v+1 lines
//
// The migration is append-only: it never modifies existing version lines.
// The projection's last-wins-by-max-version picks the new accepted line;
// the pre-migration open line stays on disk (audit trail).
//
// Writes route through the core `acceptEntry` op (enqueue +
// withRegistryLock + trueAppendAtomicRaw + invalidateCache + lifecycle
// invariant guards), the same primitive `meta_state_accept` uses. This
// keeps the migration consistent with the tool's contract and picks up
// future guard additions automatically. `acceptEntry` is idempotent on
// re-run: a finding already `accepted` returns `already_accepted` and
// writes nothing, so --apply is safe to repeat.
//
// Usage:
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --apply [--id <id>] [--root <path>]
//   node tools/learning-loop-mastra/tools/handlers/scripts/migrate-accepted-limitations.mjs --dry-run

import { readRegistry, acceptEntry } from "../../../core/meta-state.js";
import { resolve as resolvePath } from "node:path";
import { resolveRoot } from "#lib/resolve-root.js";

function parseArgs(argv) {
  const args = { dryRun: true, ids: [], root: null };
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

function isCandidate(entry, idSet) {
  if (entry.entry_kind !== "finding") return false;
  if (entry.status !== "open") return false;
  if (idSet.size > 0) return idSet.has(entry.id);
  // subtype ending in `-accepted` — the standing-trade-off convention.
  return typeof entry.subtype === "string" && entry.subtype.endsWith("-accepted");
}

async function main() {
  const args = parseArgs(process.argv);
  const idSet = new Set(args.ids);
  // resolveRoot honors GATE_ROOT and the project-root containment check;
  // --root overrides it for test fixtures. Reads use the union read
  // (meta-state.jsonl + change-log.jsonl + citations.jsonl) so candidates
  // are derived from the same shape the live registry sees.
  const root = args.root ? resolvePath(args.root) : resolveRoot();
  const entries = readRegistry(root);
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

  const acceptedBy = "migration";
  const reason = "Migrated to `accepted`; standing trade-off accepted as lifecycle terminal.";
  let written = 0;
  let alreadyAccepted = 0;
  for (const c of candidates) {
    const result = await acceptEntry(root, c.id, acceptedBy, reason);
    if (result.accepted) {
      written += 1;
      console.log(`  accepted ${c.id} (v${result.version})`);
    } else if (result.reason === "already_accepted") {
      alreadyAccepted += 1;
      console.log(`  skip ${c.id} (already accepted, v${result.current_version ?? "?"})`);
    } else {
      console.error(`  failed ${c.id}: ${result.reason}`);
    }
  }
  console.log(`\nMigration complete: ${written} accepted, ${alreadyAccepted} already accepted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
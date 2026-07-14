#!/usr/bin/env node
/**
 * Seed the path-keyed fingerprint sidecar (file-index.jsonl) for every distinct
 * cited path among ALL mechanism_check:true findings (incl. resolved/superseded).
 *
 * One upsertFileIndexEntry per distinct canonical key whose file exists. Files
 * that don't exist (orphans, descriptive refs, cross-repo refs) are skipped —
 * they are not seedable, and the cold-tier test already skip-classes them.
 *
 * Idempotent: re-running re-hashes every path and overwrites the same keys.
 * Completeness: prints the distinct-path count vs. the seeded count so a partial
 * failure is visible. Exit code 0 only when the seeded count equals the count of
 * distinct cited paths whose files exist.
 */
import { readRegistry, upsertFileIndexEntry, readFileIndex, canonicalIndexKey } from "../../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { stripEvidenceAnchor } from "../../../core/gate-logic.js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";

function computeFileHash(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    const bytes = readFileSync(absPath);
    return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : resolveRoot();

// SKIP_PRESEED escape hatch: pre-commit drift-absorption is the default, but
// operators who want the pre-commit drift signal back can opt out per run.
if (process.env.SKIP_PRESEED === "1") {
  console.log("[seed-file-index] SKIP_PRESEED=1 — skipping pretest seed.");
  process.exit(0);
}

const entries = readRegistry(root);

// Distinct canonical keys among ALL mechanism_check:true findings (incl. terminal).
const distinctKeys = new Set();
for (const e of entries) {
  if (e.entry_kind === "finding" && e.mechanism_check === true && typeof e.evidence_code_ref === "string") {
    distinctKeys.add(canonicalIndexKey(e.evidence_code_ref));
  }
}

let seeded = 0;
let skippedMissing = 0;
const missing = [];
for (const key of distinctKeys) {
  const absPath = isAbsolute(key) ? key : join(root, key);
  const hash = computeFileHash(absPath);
  if (!hash) {
    skippedMissing++;
    missing.push(key);
    continue;
  }
  const ok = await upsertFileIndexEntry(root, key, hash);
  if (ok) seeded++;
}

const finalIndex = readFileIndex(root);
console.log(`Distinct mechanism_check:true cited paths: ${distinctKeys.size}`);
console.log(`Seeded (file exists): ${seeded}`);
console.log(`Skipped (file missing): ${skippedMissing}`);
console.log(`file-index.jsonl entries after seed: ${finalIndex.size}`);
if (missing.length) {
  console.log("\nMissing (not seeded):");
  for (const m of missing) console.log(`  ${m}`);
}
// Completeness: every existing cited path must have an index entry.
const existingKeys = [...distinctKeys].filter((k) => {
  const absPath = isAbsolute(k) ? k : join(root, k);
  return existsSync(absPath);
});
if (finalIndex.size < existingKeys.length) {
  console.error(`\nINCOMPLETE: index has ${finalIndex.size} entries but ${existingKeys.length} cited paths exist`);
  process.exit(1);
}
console.log("\nDone.");

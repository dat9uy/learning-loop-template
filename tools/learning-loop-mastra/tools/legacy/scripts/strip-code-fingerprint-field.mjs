#!/usr/bin/env node
/**
 * Strip `code_fingerprint` VALUES from every finding in meta-state.jsonl
 * (incl. resolved/superseded — an intentional, logged exception to audit-
 * immutability per plan 260702-1933 Phase 6). The schema field stays (@deprecated,
 * optional); the index (file-index.jsonl) is the sole authoritative baseline.
 *
 * Idempotent: a second run finds no values to strip (already absent).
 * Dry-run by default: prints the count of values that WOULD be stripped. Pass
 * --apply to commit. Writes atomically (tmp+rename) under the per-root queue.
 *
 * Precondition: file-index.jsonl must be seeded for every mechanism_check:true
 * cited path whose file exists (run seed-file-index.mjs first) so post-strip
 * findings ground via the index. This script verifies the seed covers every
 * finding with a code_fingerprint before stripping.
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { readFileIndex, canonicalIndexKey, getFileIndexPath } from "../../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const REGISTRY_FILENAME = "meta-state.jsonl";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : resolveRoot();
const registryPath = join(root, REGISTRY_FILENAME);

if (!existsSync(registryPath)) {
  console.log("No meta-state.jsonl; nothing to strip.");
  process.exit(0);
}

const raw = readFileSync(registryPath, "utf8");
const lines = raw.split("\n").filter((l) => l.trim() !== "");

// Precondition: the index must cover every finding with a code_fingerprint
// whose cited file exists, so post-strip findings still ground via the index.
const fileIndex = readFileIndex(root);
let stripCount = 0;
let alreadyAbsent = 0;
let missingCoverage = [];

const outLines = lines.map((line) => {
  let e;
  try { e = JSON.parse(line); } catch { return line; } // leave malformed lines untouched
  if (e.entry_kind !== "finding") return line;
  if (e.code_fingerprint === undefined || e.code_fingerprint === null) {
    alreadyAbsent++;
    return line;
  }
  // Coverage check: only mechanism_check:true findings are grounded, so only
  // those need an index baseline post-strip. A non-mechanism_check finding's
  // code_fingerprint is dead data (grounding skips it) — safe to strip without
  // index coverage.
  if (e.mechanism_check === true && typeof e.evidence_code_ref === "string") {
    const key = canonicalIndexKey(e.evidence_code_ref);
    const absPath = join(root, key);
    if (existsSync(absPath) && !fileIndex.has(key)) {
      missingCoverage.push({ id: e.id, key });
    }
  }
  stripCount++;
  if (!apply) return line; // dry-run: don't mutate
  const { code_fingerprint, ...rest } = e;
  return JSON.stringify(rest);
});

if (missingCoverage.length > 0) {
  console.error("PRECONDITION FAILED: file-index.jsonl does not cover these cited paths:");
  for (const m of missingCoverage) console.error(`  ${m.id} -> ${m.key}`);
  console.error("Run seed-file-index.mjs first so post-strip findings ground via the index.");
  process.exit(1);
}

if (!apply) {
  console.log(`DRY RUN: would strip code_fingerprint from ${stripCount} finding(s); ${alreadyAbsent} already absent.`);
  process.exit(0);
}

// Apply: atomic write (tmp+rename).
const tmpPath = registryPath + ".tmp";
writeFileSync(tmpPath, outLines.join("\n") + "\n", "utf8");
renameSync(tmpPath, registryPath);
console.log(`Applied: stripped code_fingerprint from ${stripCount} finding(s); ${alreadyAbsent} already absent.`);
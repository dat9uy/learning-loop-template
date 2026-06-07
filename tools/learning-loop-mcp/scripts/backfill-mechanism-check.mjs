#!/usr/bin/env node
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";

/**
 * Backfill mechanism_check: true on resolved findings with evidence_code_ref.
 *
 * Phase 5 of plan 260606-meta-state-scan-readiness-refactor.
 * Directly computes SHA-256 fingerprints without requiring mechanism_check=true.
 * Idempotent: a second run produces no changes.
 */

function computeFileHash(absPath) {
  if (!existsSync(absPath)) return null;
  try {
    const bytes = readFileSync(absPath);
    const digest = createHash("sha256").update(bytes).digest("hex");
    return `sha256:${digest}`;
  } catch {
    return null;
  }
}

const root = resolveRoot();
const entries = readRegistry(root);

const resolvedFindings = entries.filter(
  (e) => e.entry_kind === "finding" && e.status === "resolved"
);

let backfilled = 0;
let skippedNoEvidence = 0;
let alreadyChecked = 0;
const backfillLog = [];

for (const entry of resolvedFindings) {
  if (entry.mechanism_check === true) {
    alreadyChecked++;
    continue;
  }

  const rawCodeRef = entry.evidence_code_ref ?? entry.evidence?.code_ref;
  const codeRef = typeof rawCodeRef === "string" ? rawCodeRef : null;

  if (!codeRef) {
    skippedNoEvidence++;
    continue;
  }

  const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef);
  const fingerprint = computeFileHash(absPath);

  if (fingerprint) {
    await updateEntry(root, entry.id, {
      mechanism_check: true,
      code_fingerprint: fingerprint,
    });
    backfilled++;
    backfillLog.push({
      id: entry.id,
      fingerprint,
      status: "grounded",
    });
  } else {
    skippedNoEvidence++;
    backfillLog.push({
      id: entry.id,
      fingerprint: null,
      status: "skipped_no_file",
    });
  }
}

console.log(`Resolved findings: ${resolvedFindings.length}`);
console.log(`Already mechanism_check=true: ${alreadyChecked}`);
console.log(`Skipped (no evidence or no file): ${skippedNoEvidence}`);
console.log(`Backfilled: ${backfilled}`);

if (backfilled > 0) {
  console.log(`\nBackfill log (${backfillLog.length} entries):`);
  for (const log of backfillLog) {
    console.log(`  ${log.id}: ${log.fingerprint ?? "skipped"} (${log.status})`);
  }
}

console.log("Done.");

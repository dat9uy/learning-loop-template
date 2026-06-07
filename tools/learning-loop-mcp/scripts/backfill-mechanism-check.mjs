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

  const codeRef = typeof entry.evidence_code_ref === "string" ? entry.evidence_code_ref : null;

  if (!codeRef) {
    skippedNoEvidence++;
    continue;
  }

  // Strip #fragment suffix (e.g., "path/to/file.js#functionName") so the path
  // resolves to a real file. evidence_code_ref and evidence.code_ref often
  // include a function/method anchor; only the file part is a valid filesystem
  // path. Without this, 2 of the 16 resolved findings would be incorrectly
  // skipped (gate-logic.js#splitSegments, loop-surface-inject.cjs#spawnAndCall).
  const codeRefPath = codeRef.split("#")[0];
  if (!codeRefPath) {
    skippedNoEvidence++;
    continue;
  }

  const absPath = isAbsolute(codeRefPath) ? codeRefPath : join(root, codeRefPath);
  const fingerprint = computeFileHash(absPath);

  if (fingerprint) {
    const expectedVersion = entry.version ?? 0;
    const r = await updateEntry(root, entry.id, {
      mechanism_check: true,
      code_fingerprint: fingerprint,
      _expected_version: expectedVersion,
    });
    if (r === "version_mismatch") {
      console.warn(
        `CAS: version mismatch for ${entry.id} (expected ${expectedVersion}); skipping`
      );
      continue;
    }
    if (r !== true) {
      console.warn(
        `CAS: entry ${entry.id} update failed (r=${r}); skipping`
      );
      continue;
    }
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

#!/usr/bin/env node
import { readRegistry, updateEntry } from "../../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { stripEvidenceAnchor } from "../../../core/gate-logic.js";
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

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const root = rootArg ? rootArg.slice("--root=".length) : resolveRoot();
const entries = readRegistry(root);

const resolvedFindings = entries.filter(
  (e) => e.entry_kind === "finding" && e.status === "resolved"
);

let backfilled = 0;
let skippedNoEvidence = 0;
let alreadyChecked = 0;
const backfillLog = [];

for (const entry of resolvedFindings) {
  const codeRef = typeof entry.evidence_code_ref === "string" ? entry.evidence_code_ref : null;

  if (entry.mechanism_check === true && entry.code_fingerprint) {
    alreadyChecked++;
    continue;
  }

  // Skip if there is no evidence code ref to fingerprint
  if (!codeRef) {
    skippedNoEvidence++;
    continue;
  }

  // Strip `:line`, `:start-end`, and `#fragment` suffixes via the shared
  // helper (single source of truth in core/gate-logic.js#stripEvidenceAnchor).
  // evidence_code_ref often includes a function/method anchor OR a line number;
  // only the file part is a valid filesystem path. Without the strip,
  // resolved findings with line ranges (e.g. ":12-34") or compound suffixes
  // (":12-34#methodName") would be incorrectly skipped. See finding
  // meta-260607T1517Z-consult-gate-rule-no-orphaned-evidence-origin-meta-260607t00
  // for the gate-bug class this closes.
  const codeRefPath = stripEvidenceAnchor(codeRef);
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

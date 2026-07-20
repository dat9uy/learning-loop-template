#!/usr/bin/env node
// scripts/migrate-runtime-state-fingerprints.mjs
//
// One-time operator step: re-fingerprint every row in runtime-state.jsonl
// from the v1 5-field formula to the v2 8-field row-integrity hash that
// `computeFingerprint` (core/runtime-state.js) now produces.
//
// Why this exists:
//   The v1 formula (`id|source_ref|value|delta|timestamp`) omitted
//   `affected_system`, `kind`, and `metadata`. Two prod rows differing
//   only in metadata therefore shared a fingerprint — see finding
//   meta-260719T2144Z. v2 covers those fields (metadata canonicalized via
//   recursive sorted keys; arrays preserve order).
//
// Operational contract (decision 1 — locked 2026-07-19):
//   - Rewrites runtime-state.jsonl in place (one tracked-file commit).
//   - Idempotent: if every row already verifies under v2 (verifyRow ===
//     true), the script is a no-op. Re-runs and CI smoke checks are safe.
//   - Crash-safe: writes to <sidecar>.tmp then renameSync over the
//     original. The file is never half-written.
//   - Run-when-quiescent: a concurrent `runtime_state_record` append
//     during the read-then-rename window would be lost (the rename
//     clobbers the original). The operator gates this one-time run.
//
// Usage:
//   node scripts/migrate-runtime-state-fingerprints.mjs        # rewrites
//                                                              # GATE_ROOT/runtime-state.jsonl
//   GATE_ROOT=/tmp/foo node scripts/migrate-runtime-state-fingerprints.mjs
//
// Exit codes:
//   0  — success (every row now v2-fingerprinted, or already migrated)
//   1  — migration failed (IO error); sidecar unchanged
//
// The script is kept in the repo for reproducibility — re-running on an
// already-migrated file is a no-op (idempotency test pins this).

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { computeFingerprint, verifyRow } = require("../tools/learning-loop-mastra/core/runtime-state.js");

const ROOT = process.env.GATE_ROOT || process.cwd();
const SIDECAR = join(ROOT, "runtime-state.jsonl");

if (!existsSync(SIDECAR)) {
  // No sidecar to migrate — fresh project / never used runtime-state.
  console.log("no runtime-state.jsonl at", SIDECAR, "— nothing to migrate");
  process.exit(0);
}

const raw = readFileSync(SIDECAR, "utf8");
const lines = raw.split("\n").filter((l) => l.trim() !== "");

// First pass — are all rows already v2? If yes, no-op.
const allV2 = lines.every((line) => {
  try {
    const row = JSON.parse(line);
    return typeof row.fingerprint === "string" && verifyRow(row);
  } catch {
    return false; // malformed — must be re-emitted below
  }
});

if (allV2) {
  console.log("already migrated (v2); no-op");
  process.exit(0);
}

// Second pass — re-fingerprint every row, preserving all other fields verbatim.
const out = lines.map((line) => {
  const row = JSON.parse(line);
  // Skip rows whose stored fingerprint is null/non-string — those never
  // verified under any formula. Re-fingerprinting them is harmless (the
  // new fingerprint is v2-correct for the row's current fields).
  row.fingerprint = computeFingerprint(row);
  return JSON.stringify(row);
}).join("\n") + "\n";

const tmp = SIDECAR + ".tmp";
writeFileSync(tmp, out, "utf8");
renameSync(tmp, SIDECAR);

// Verify after write — defensive: every row must verify under v2.
const post = readFileSync(SIDECAR, "utf8").split("\n").filter(Boolean);
const failures = [];
for (const line of post) {
  try {
    const row = JSON.parse(line);
    if (!verifyRow(row)) failures.push(row.id || "<no-id>");
  } catch (err) {
    failures.push(`<unparseable>: ${err.message}`);
  }
}

if (failures.length > 0) {
  console.error(`migration produced ${failures.length} non-verifying rows:`, failures);
  process.exit(1);
}

console.log(`migrated ${post.length} row(s) to v2`);

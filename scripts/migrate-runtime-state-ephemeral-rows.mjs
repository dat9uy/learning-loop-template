#!/usr/bin/env node
// scripts/migrate-runtime-state-ephemeral-rows.mjs
//
// One-time operator step: partition `gate-verb:*` `budget-state` rows out of
// the committed substrate (`runtime-state.jsonl`) into the gitignored
// session-local substrate (`.loop/runtime-state-local.jsonl`).
//
// Why this exists:
//   The L1 durability axis distinguishes durable rows (ledger logs + the
//   budget-tracking lifecycle) from ephemeral TTL'd allowance rows
//   (`gate-verb:*`). The wiring predating that distinction committed the two
//   `gate-verb:*` allowance rows to `runtime-state.jsonl` as if they were
//   durable history. This script relocates them to the correct substrate,
//   back-filling `durability:"ephemeral"` and preserving all other fields
//   verbatim (non-destructive — history is preserved in the right substrate).
//
// Operational contract:
//   - Predicate is KIND-GATED: partitions only
//     `affected_system.startsWith("gate-verb:") && kind === "budget-state"`.
//     A durable `ledger-event` under `gate-verb:*` (if any pre-existed) stays
//     committed — the predicate is defensive for rows written before the
//     symmetric namespace guard shipped.
//   - Lock-protected: the read→partition→rewrite window runs under
//     `withRegistryLock(root, …)`, serializing against concurrent
//     `runtime_state_record` / `runtime_state_stop` appends (no clobber).
//   - Atomic: the committed-file rewrite goes through `<file>.tmp + renameSync`
//     — the file is never half-written.
//   - Backup: a `runtime-state.jsonl.bak-<ts>` copy is written before the
//     rewrite for audit/rollback.
//   - Idempotent: a re-run with no matching rows in the committed file is a
//     no-op (no rewrite, no backup).
//
// Gate framing honesty: the migration's internal Node writes bypass the
// bash-gate (which matches shell redirections only). The `runtime-state-edit`
// marker governs the direct-shell/Write-tool path; this script's safety
// rests on the registry lock + atomic rename + backup + `meta_state_log_change`,
// not on gate enforcement.
//
// Requires Node >= 22.12 (createRequire of the ESM core modules).
//
// Usage:
//   node scripts/migrate-runtime-state-ephemeral-rows.mjs          # GATE_ROOT's file
//   GATE_ROOT=/tmp/foo node scripts/migrate-runtime-state-ephemeral-rows.mjs
//
// Exit codes:
//   0  — success (rows migrated, or nothing to migrate)
//   1  — migration failed (IO error); committed file unchanged (atomic)

import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { RUNTIME_STATE_FILENAME, RUNTIME_STATE_LOCAL_FILENAME, computeFingerprint } =
  require("../tools/learning-loop-mastra/core/runtime-state.js");
const { withRegistryLock } = require("../tools/learning-loop-mastra/core/registry-lock.js");

const ROOT = process.env.GATE_ROOT || process.cwd();
const COMMITTED = join(ROOT, RUNTIME_STATE_FILENAME);
const LOCAL = join(ROOT, RUNTIME_STATE_LOCAL_FILENAME);

if (!existsSync(COMMITTED)) {
  console.log("no runtime-state.jsonl at", COMMITTED, "— nothing to migrate");
  process.exit(0);
}

// Partition predicate — kind-gated so a durable ledger-event under
// `gate-verb:*` (pre-guard) stays committed.
function isEphemeralAllowance(row) {
  return (
    row &&
    typeof row.affected_system === "string" &&
    row.affected_system.startsWith("gate-verb:") &&
    row.kind === "budget-state"
  );
}

await withRegistryLock(ROOT, () => {
  const raw = readFileSync(COMMITTED, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  const rows = lines.map((l) => JSON.parse(l));

  const ephemeral = rows.filter(isEphemeralAllowance);
  const durable = rows.filter((r) => !isEphemeralAllowance(r));

  if (ephemeral.length === 0) {
    console.log("no gate-verb:* budget-state rows in the committed file; no-op");
    return;
  }

  // Backup for audit/rollback (same precedent as migrate-runtime-state-fingerprints.mjs).
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${COMMITTED}.bak-${ts}`;
  copyFileSync(COMMITTED, backupPath);
  console.log(`backup written: ${backupPath}`);

  // Rewrite the committed file atomically WITHOUT the ephemeral rows.
  const durableOut = durable.map((r) => JSON.stringify(r)).join("\n");
  const tmp = COMMITTED + ".tmp";
  writeFileSync(tmp, durableOut.length > 0 ? durableOut + "\n" : "", "utf8");
  renameSync(tmp, COMMITTED);

  // Append the ephemeral rows to the local substrate with `durability`
  // back-filled (all other fields verbatim). The fingerprint is recomputed
  // for uniformity with freshly-written rows; it does not hash `durability`
  // (a fixed field subset, like `version`), so the recompute is an identity
  // for migrated rows. Versions are bumped past any existing same-id rows
  // already in the local substrate — appending with the original version
  // would create same-id/same-version duplicates when the record tool wrote
  // to the local file before the migration ran.
  mkdirSync(dirname(LOCAL), { recursive: true });
  const existingLocal = existsSync(LOCAL)
    ? readFileSync(LOCAL, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l))
    : [];
  const nextVersionById = new Map();
  for (const row of existingLocal) {
    if (typeof row?.id !== "string" || row.id === "") continue;
    const v = Number.isFinite(parseInt(row.version, 10)) ? parseInt(row.version, 10) : 0;
    nextVersionById.set(row.id, Math.max(nextVersionById.get(row.id) ?? -1, v) + 1);
  }
  const localLines = ephemeral.map((row) => {
    const next = nextVersionById.get(row.id) ?? 0;
    nextVersionById.set(row.id, next + 1);
    const migrated = { ...row, durability: "ephemeral", version: next, fingerprint: null };
    migrated.fingerprint = computeFingerprint(migrated);
    return JSON.stringify(migrated);
  });
  appendFileSync(LOCAL, localLines.join("\n") + "\n", "utf8");

  console.log(`migrated ${ephemeral.length} gate-verb:* budget-state row(s) to .loop/runtime-state-local.jsonl`);
});

process.exit(0);

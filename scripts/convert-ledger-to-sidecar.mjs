#!/usr/bin/env node
/**
 * Convert ledger events from observation yaml to runtime-state.jsonl sidecar.
 * Phase 2 of plan 260612-1700-meta-surface-re-debate.
 *
 * Usage:
 *   node scripts/convert-ledger-to-sidecar.mjs [--root <path>] [--source-ref <ref>]
 *
 * Defaults:
 *   root = process.cwd()
 *   source_ref = "local:meta-state:rule-vnstock-device-slot-budget"
 */

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "yaml";

const SIDECAR_FILENAME = "runtime-state.jsonl";
const YAML_PATH = "records/observations/observation-vnstock-device-slot-ledger.yaml";
const ARCHIVE_DIR = "records/_unbound/observation";

// Legacy v1 fingerprint formula — retained for historical reproducibility
// of observation-yaml → runtime-state.jsonl conversions. The current
// runtime-state rows use the v2 8-field row-integrity hash exported from
// core/runtime-state.js (finding meta-260719T2144Z). Do NOT change this
// formula: rewriting the historical ledger rows' fingerprints would break
// observation-yaml repro runs that compare against the v1 output.
function computeFingerprint(row) {
  const data = `${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}`;
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

function normalizeSlotConsumed(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === "unknown" || value === undefined || value === null) return 0;
  return 0;
}

function computeDelta(slotConsumed, operatorCleared) {
  const value = normalizeSlotConsumed(slotConsumed);
  if (value === 1 && operatorCleared !== true) {
    return 1; // slot consumed and NOT cleared = +1 delta
  }
  return 0; // unknown, false, or cleared = 0 delta
}

export async function convertLedgerToSidecar({ root = process.cwd(), sourceRef = "local:meta-state:rule-vnstock-device-slot-budget", expectedCount = 18 } = {}) {
  const yamlFilePath = join(root, YAML_PATH);
  const sidecarPath = join(root, SIDECAR_FILENAME);
  const archivePath = join(root, ARCHIVE_DIR, "observation-vnstock-device-slot-ledger.yaml");

  // Check if already converted (idempotency)
  if (existsSync(sidecarPath)) {
    const existing = readFileSync(sidecarPath, "utf8").trim().split("\n").filter(l => l.trim());
    const ledgerEvents = existing.filter(l => {
      try {
        return JSON.parse(l).kind === "ledger-event";
      } catch { return false; }
    });
    if (ledgerEvents.length > 0) {
      return { count: ledgerEvents.length, skipped: true, message: "Sidecar already exists with ledger events" };
    }
  }

  if (!existsSync(yamlFilePath)) {
    // Already archived? Check archive
    if (existsSync(archivePath)) {
      return { count: 0, skipped: true, message: "Yaml already archived; no conversion needed" };
    }
    throw new Error(`Ledger yaml not found at ${yamlFilePath} and not archived at ${archivePath}`);
  }

  const yamlContent = readFileSync(yamlFilePath, "utf8");
  const yamlData = parse(yamlContent);

  if (!yamlData.ledger || !Array.isArray(yamlData.ledger)) {
    throw new Error("Invalid yaml: missing ledger array");
  }

  const rows = [];
  let deltaSum = 0;

  for (const entry of yamlData.ledger) {
    const value = normalizeSlotConsumed(entry.slot_consumed);
    const delta = computeDelta(entry.slot_consumed, entry.operator_cleared_after);
    deltaSum += delta;

    const row = {
      kind: "ledger-event",
      affected_system: "vnstock",
      id: `vnstock-device-slot-${entry.timestamp}`,
      value,
      delta,
      source_ref: sourceRef,
      fingerprint: null, // computed below
      timestamp: entry.timestamp,
      status: "active",
      metadata: {
        experiment: entry.experiment || null,
        action: entry.action || null,
        slot_consumed: entry.slot_consumed ?? null,
        operator_cleared_after: entry.operator_cleared_after ?? null,
        notes: entry.notes || null,
      },
    };

    row.fingerprint = computeFingerprint(row);
    rows.push(row);
  }

  // Verification: count must match expected
  if (rows.length !== expectedCount) {
    throw new Error(`Ledger conversion failed: expected ${expectedCount} events, got ${rows.length}`);
  }

  // Write sidecar
  const sidecarContent = rows.map(r => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(sidecarPath, sidecarContent, "utf8");

  // Archive yaml
  mkdirSync(dirname(archivePath), { recursive: true });
  renameSync(yamlFilePath, archivePath);

  return {
    count: rows.length,
    deltaSum,
    skipped: false,
    sidecarPath,
    archivePath,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let sourceRef = "local:meta-state:rule-vnstock-device-slot-budget";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = args[i + 1];
      i++;
    }
    if (args[i] === "--source-ref" && args[i + 1]) {
      sourceRef = args[i + 1];
      i++;
    }
  }

  convertLedgerToSidecar({ root, sourceRef })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}

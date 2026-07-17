// Tier 2 Phase C: registry-stats helper.
//
// Shared by:
//   - `loop_describe` warm tier (no shell subprocess from MCP server —
//     importing the helper directly)
//   - `tools/scripts/compact-registry.sh` --check (same shape, two impls)
//
// The 4-key shape is consumed by the compaction signal + CI advisory:
//
//   raw_lines            = sum of non-blank lines across meta-state.jsonl +
//                          change-log.jsonl (post-Tier-1-split union)
//   deduped_ids          = last-wins-by-max-version projection count
//                          (matches registry-table.sh semantics)
//   dead_version_lines   = raw_lines - deduped_ids
//                          (superseded non-winning versions — candidates
//                          for compaction)
//   compaction_eligible  = raw_lines >= COMPACTION_THRESHOLD
//                          (default 1000; overridable via env var)
//
// Plus a separate `findDuplicateVersionPerId(entries)` helper for the
// same-id-concurrent-mutation CI advisory (one warning per id) — Phase C
// Q2 (Validation Session 1). Implemented as a standalone function so the
// script can call it on a parsed array without coupling to the file
// reader.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_THRESHOLD = 1000;
const META_STATE_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

/**
 * Compute the registry stats over the meta-state.jsonl + change-log.jsonl
 * union at `root`. Tolerates an absent change-log.jsonl (post-Tier-1-split
 * trees may omit it). Skips blank lines.
 *
 * @param {string} root - project root
 * @returns {{ raw_lines: number, deduped_ids: number, dead_version_lines: number, compaction_eligible: boolean }}
 */
export function computeRegistryStats(root) {
  const files = collectRegistryFiles(root);
  const { entries, rawLines } = parseEntriesFromFiles(files);
  return deriveStats(entries, rawLines);
}

// Discover which registry files exist at `root`. Tolerates an absent
// change-log.jsonl (post-Tier-1-split trees may omit it).
function collectRegistryFiles(root) {
  const metaStatePath = join(root, META_STATE_FILENAME);
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);
  const files = [];
  if (existsSync(metaStatePath)) files.push(metaStatePath);
  if (existsSync(changeLogPath)) files.push(changeLogPath);
  return files;
}

// Read each registry file, split into non-blank lines, and parse each line
// as JSON. Returns the parsed entries alongside a raw-line count (the count
// of non-blank lines, regardless of parse success — mirrors registry-table.sh).
// Malformed lines are skipped silently; compact-registry.sh --check surfaces
// this through under-counted `deduped_ids` but never crashes the reader.
function parseEntriesFromFiles(files) {
  const entries = [];
  let rawLines = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      rawLines += 1;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed line; see comment above.
      }
    }
  }
  return { entries, rawLines };
}

// Project `entries` onto the 4-key stats shape. deduped_ids is the
// last-wins-by-max-version projection, mirroring registry-table.sh's
//   group_by(.id) | map(max_by(.version)) | length
// compaction_eligible honors the COMPACTION_THRESHOLD env override
// (default 1000) for tier-2 compaction signal triggers.
function deriveStats(entries, rawLines) {
  const byId = new Map();
  for (const e of entries) {
    if (typeof e.id !== "string" || e.id.length === 0) continue;
    const version = typeof e.version === "number" ? e.version : 0;
    const prev = byId.get(e.id);
    if (prev === undefined || version > prev) byId.set(e.id, version);
  }
  const dedupedIds = byId.size;
  const threshold = Number(process.env.COMPACTION_THRESHOLD) || DEFAULT_THRESHOLD;
  return {
    raw_lines: rawLines,
    deduped_ids: dedupedIds,
    dead_version_lines: rawLines - dedupedIds,
    compaction_eligible: rawLines >= threshold,
  };
}

/**
 * Find ids that appear on more than one line in `entries`. Returns one
 * record per affected id with the line count. Used by the Q2
 * same-id-concurrent-mutation CI advisory (Phase C, Validation Session 1
 * Q2: pre-merge WARNING only).
 *
 * Defensive: tolerates missing/null id, missing version field.
 *
 * @param {Array<{id?: string, version?: number}>} entries
 * @returns {Array<{id: string, count: number}>}
 */
// fallow-ignore-next-line unused-export -- public API consumed by core/__tests__/registry-stats.test.js for the ci-registry-deltas advisory
export function findDuplicateVersionPerId(entries) {
  const counts = new Map();
  for (const e of entries) {
    if (typeof e?.id !== "string" || e.id.length === 0) continue;
    counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
  }
  const out = [];
  for (const [id, count] of counts) {
    if (count > 1) out.push({ id, count });
  }
  // Sort by id for deterministic output (CI advisory + tests).
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
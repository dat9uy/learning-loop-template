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
  const files = [];
  const metaStatePath = join(root, META_STATE_FILENAME);
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);
  if (existsSync(metaStatePath)) files.push(metaStatePath);
  if (existsSync(changeLogPath)) files.push(changeLogPath);

  // raw_lines: sum of non-blank lines across files.
  let rawLines = 0;
  const entries = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const line of text.split("\n")) {
      if (line.length === 0) continue;
      rawLines += 1;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines; mirrors registry-table.sh's invalid-JSON
        // bail behavior at the read level. compact-registry.sh --check
        // will surface this through `dead_version_lines` (under-counted
        // deduped) but never crash.
      }
    }
  }

  // deduped_ids: last-wins-by-max-version projection count. Mirrors
  // registry-table.sh's jq expression:
  //   group_by(.id) | map(max_by(.version)) | length
  const byId = new Map();
  for (const e of entries) {
    if (typeof e.id !== "string" || e.id.length === 0) continue;
    const version = typeof e.version === "number" ? e.version : 0;
    const prev = byId.get(e.id);
    if (prev === undefined || version > prev) byId.set(e.id, version);
  }
  const dedupedIds = byId.size;
  const deadVersionLines = rawLines - dedupedIds;
  const threshold = Number(process.env.COMPACTION_THRESHOLD) || DEFAULT_THRESHOLD;
  const compactionEligible = rawLines >= threshold;

  return {
    raw_lines: rawLines,
    deduped_ids: dedupedIds,
    dead_version_lines: deadVersionLines,
    compaction_eligible: compactionEligible,
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
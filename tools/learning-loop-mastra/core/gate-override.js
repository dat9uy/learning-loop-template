import { statSync, appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readModifyWriteOnAllSurfaces, SURFACES } from "./surfaces.js";

const OVERRIDE_FILE = ".gate-override";
const CACHE_TTL_MS = 1000;

/** @type {Map<string, { result: object|null, at: number, path: string, mtime: number, size: number }>} */
const overrideCache = new Map();

function isExpired(marker) {
  if (!marker.created_at || typeof marker.ttl_seconds !== "number") return true;
  const created = new Date(marker.created_at).getTime();
  if (isNaN(created)) return true;
  return Date.now() - created > marker.ttl_seconds * 1000;
}

function validateMarker(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (!Array.isArray(parsed.rule_ids)) return null;
  if (parsed.rule_ids.some((id) => typeof id !== "string")) return null;
  if (isExpired(parsed)) return null;
  return parsed;
}

/**
 * Read the active gate-override marker from the first surface that has a
 * VALID (non-expired) one. Iterates SURFACES in order (.claude, .factory, .mastracode)
 * and returns the first valid marker; an expired or malformed marker on
 * one surface does not block a valid marker on another.
 * Returns null if no valid marker exists.
 * Cached for up to 1 second and invalidated on marker mtime/size changes.
 *
 * @param {string} root
 * @returns {object|null}
 */
// fallow-ignore-next-line complexity
export function readGateOverride(root) {
  const cached = overrideCache.get(root);
  if (cached) {
    const fresh = Date.now() - cached.at < CACHE_TTL_MS;
    if (fresh && cached.path) {
      try {
        const { mtime, size } = statSync(cached.path);
        const unchanged = mtime.getTime() === cached.mtime && size === cached.size;
        if (unchanged) return cached.result;
      } catch {
        // File may have been removed; fall through to re-read.
      }
    }
  }

  // Iterate SURFACES and call validateMarker per surface. This preserves
  // the "first VALID wins" contract: an expired or malformed marker on one
  // surface falls through to a valid marker on another.
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", OVERRIDE_FILE);
    let parsed = null;
    try {
      if (!existsSync(path)) continue;
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // Per-surface best effort: malformed or missing marker is ignored.
      continue;
    }
    const valid = validateMarker(parsed);
    if (!valid) continue;
    try {
      const { mtime, size } = statSync(path);
      overrideCache.set(root, { result: valid, at: Date.now(), path, mtime: mtime.getTime(), size });
      return valid;
    } catch {
      // Fall through to cache null.
    }
  }

  overrideCache.set(root, { result: null, at: Date.now(), path: null, mtime: 0, size: 0 });
  return null;
}

/**
 * Append an audit entry for the override to runtime-state.jsonl.
 *
 * @param {string} root
 * @param {object} param
 */
function appendOverrideAudit(root, { rule_id, ttl_seconds, operator_note }) {
  try {
    const sidecarPath = join(root, "runtime-state.jsonl");
    const row = {
      affected_system: "gate-logic",
      kind: "ledger-event",
      id: `gate-override-${rule_id}-${Date.now()}`,
      source_ref: `local:meta-state:${rule_id}`,
      timestamp: new Date().toISOString(),
      value: null,
      delta: null,
      status: "active",
      metadata: { rule_id, ttl_seconds, operator_note },
    };
    appendFileSync(sidecarPath, JSON.stringify(row) + "\n", "utf8");
  } catch {
    // Audit failure must not block the override.
  }
}

/**
 * Write an override marker to all surfaces, merging the rule_id into the
 * existing per-surface rule_ids set. Refreshes ttl_seconds and operator_note
 * to the latest call's values. Appends an audit entry to runtime-state.jsonl.
 *
 * @param {string} root
 * @param {object} param
 * @param {string} param.rule_id
 * @param {number} param.ttl_seconds
 * @param {string} param.operator_note
 */
export function writeGateOverride(root, { rule_id, ttl_seconds, operator_note }) {
  const created_at = new Date().toISOString();

  readModifyWriteOnAllSurfaces(
    root,
    OVERRIDE_FILE,
    // fallow-ignore-next-line complexity
    (current) => {
      const ruleIds = [];
      if (current && Array.isArray(current.rule_ids)) {
        for (const id of current.rule_ids) {
          if (!ruleIds.includes(id)) ruleIds.push(id);
        }
      }
      if (!ruleIds.includes(rule_id)) ruleIds.push(rule_id);
      return {
        rule_ids: ruleIds,
        ttl_seconds,
        operator_note,
        created_at,
      };
    },
    { removeOnNull: false },
  );

  // Invalidate cache so the next read sees the new marker immediately.
  overrideCache.delete(root);
  appendOverrideAudit(root, { rule_id, ttl_seconds, operator_note });
}

// core/runtime-state.js — shared runtime-sidecar (runtime-state.jsonl) helpers.
//
// Extracted from runtime-state-record-tool.js in plan 260704-0301-stale-findings-
// dispatch-handle Phase 2 (DRY). The original tool defined `computeFingerprint`
// inline + wrote via appendFileSync — both extracted here so the new
// meta_state_dispatch_finding tool (also writing ledger events) can reuse
// the same append + fingerprint path without duplicating the crypto.
//
// IMPORTANT (P2 F6 — orthogonal-gate design): this helper does NOT enforce
// preflight. The preflight check (`hasPreflightMarker(root)`) stays at the
// public-tool boundary of `runtime_state_record`. The dispatch tool
// (meta_state_dispatch_finding) bypasses preflight by design and gates on
// `LOOP_SESSION_MODE === "live"` instead. Keep the helper gating-free so
// callers can apply the appropriate gate upstream.

import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

/**
 * Read all rows from runtime-state.jsonl. Empty/missing file -> []. Malformed
 * lines are skipped (parsed to null then filtered). Shared by
 * `runtime_state_record` (read-your-own-writes checks), the dispatch tool
 * (idempotency scan), and the SessionStart hook (INC-10 orphan detection).
 * DRY: previously each caller reimplemented the JSONL read.
 */
export function readRuntimeStateRows(root) {
  const path = join(root, RUNTIME_STATE_FILENAME);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Canonical sidecar filename. Kept here (not imported from the tool file)
 * to avoid circular-import risk between record-tool and dispatch-tool —
 * both depend on this module, neither should depend on the other.
 * Module-private: no external importer; the public surface is
 * `readRuntimeStateRows` / `appendLedgerEvent`.
 */
const RUNTIME_STATE_FILENAME = "runtime-state.jsonl";

/**
 * Canonicalize a JSON value for stable hashing: object keys are sorted
 * recursively (so insertion order does not change the hash); arrays keep
 * their order (so ["a","b"] and ["b","a"] differ — a metadata list is a
 * list, not a set). Used by `computeFingerprint` so that two writers
 * stringifying in different key orders produce the same fingerprint.
 */
function canonicalize(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const k of Object.keys(value).sort()) out[k] = canonicalize(value[k]);
  return out;
}

/**
 * Compute the SHA-256 fingerprint of a runtime-state row.
 * v2 — true row-integrity hash covering
 *   affected_system | kind | id | source_ref | value | delta | timestamp | metadata
 * with metadata canonicalized via `canonicalize` (recursive sorted keys;
 * arrays preserve order). v2 supersedes the v1 5-field formula (id|
 * source_ref|value|delta|timestamp) which omitted metadata and collided
 * in prod on rows 9/10 (shared sha256:93725b69…) and 8/11 (shared
 * sha256:79249677…) — see finding meta-260719T2144Z.
 *
 * v2-only (no `fingerprint_version` field): the migration script in
 * `scripts/migrate-runtime-state-fingerprints.mjs` re-fingerprints every
 * stored row in place; `verifyRow` returns false for any v1 row that
 * survived the migration.
 */
export function computeFingerprint(row) {
  const meta = JSON.stringify(canonicalize(row.metadata ?? {}));
  const data = `${row.affected_system}|${row.kind}|${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}|${meta}`;
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/**
 * Verify that a row's stored `fingerprint` matches the v2 fingerprint
 * recomputed from its own fields. Returns false for null/undefined/
 * non-string fingerprint and for any row whose fields have been mutated
 * post-write. v2-only — call `scripts/migrate-runtime-state-fingerprints.mjs`
 * to bring a v1 sidecar onto v2.
 *
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function verifyRow(row) {
  if (!row || typeof row.fingerprint !== "string") return false;
  return computeFingerprint(row) === row.fingerprint;
}

/**
 * Append a single row to runtime-state.jsonl and return the row with the
 * computed fingerprint filled in. Pure append — does NOT check preflight,
 * does NOT validate the row against any schema (the caller has already done
 * so via the tool's Zod input schema).
 *
 * @param {string} root — project root containing runtime-state.jsonl
 * @param {object} row — fully-built row (with status, fingerprint=null, etc.)
 * @returns {object} — the row with `fingerprint` set
 */
export function appendLedgerEvent(root, row) {
  const withFingerprint = {
    ...row,
    fingerprint: computeFingerprint(row),
  };
  const sidecarPath = join(root, RUNTIME_STATE_FILENAME);
  appendFileSync(sidecarPath, JSON.stringify(withFingerprint) + "\n", "utf8");
  return withFingerprint;
}

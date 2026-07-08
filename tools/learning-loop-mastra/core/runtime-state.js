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
 * Compute the SHA-256 fingerprint of a runtime-state row.
 * Format matches the in-file `fingerprint` field convention used since the
 * earliest runtime-state rows; mirrors the fingerprint regex used by the
 * index sidecar (file-index.jsonl) — different data shape, same prefix.
 * Module-private: only `appendLedgerEvent` calls this; kept non-exported so
 * the public surface stays minimal.
 */
// fallow-ignore-next-line code-duplication
function computeRuntimeStateFingerprint(row) {
  const data = `${row.id}|${row.source_ref}|${row.value}|${row.delta}|${row.timestamp}`;
  return "sha256:" + createHash("sha256").update(data).digest("hex");
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
    fingerprint: computeRuntimeStateFingerprint(row),
  };
  const sidecarPath = join(root, RUNTIME_STATE_FILENAME);
  appendFileSync(sidecarPath, JSON.stringify(withFingerprint) + "\n", "utf8");
  return withFingerprint;
}

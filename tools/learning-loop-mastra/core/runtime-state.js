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
import { writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { withRegistryLock } from "./registry-lock.js";

/**
 * Read all rows from runtime-state.jsonl. Empty/missing file -> []. Malformed
 * lines are skipped (parsed to null then filtered). Shared by
 * `runtime_state_record` (read-your-own-writes checks), the dispatch tool
 * (idempotency scan), and the SessionStart hook (INC-10 orphan detection).
 * DRY: previously each caller reimplemented the JSONL read.
 *
 * Returns the RAW sidecar (every row) — historical and read-by-everyone
 * invariant. For `max_by(version)`-collapsed reads, use
 * `readRuntimeStateRowsLatest`.
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
 * Read runtime-state.jsonl and collapse to the latest row per `id`
 * (`max_by(version)`, ties broken by newest `timestamp` then last-in-file
 * order, mirroring meta-state's `created_at ?? ""` precedent at
 * core/meta-state.js:768-769). Missing/unparseable `version` defaults to 0
 * (legacy rows predate the field). Missing/unparseable timestamps sort as
 * "" (oldest) so a re-record with a real timestamp wins over a legacy
 * unversioned row lacking one.
 *
 * Order: first-seen by id in file order (matches the inbound gate's
 * mental model — it walks observations + sidecar rows in chronological
 * order, but consumers can re-sort).
 */
export function readRuntimeStateRowsLatest(root) {
  const rows = readRuntimeStateRows(root);
  const byId = new Map();
  rows.forEach((row, idx) => {
    const id = row?.id;
    if (typeof id !== "string" || id === "") return;
    const v = Number.isFinite(parseInt(row.version, 10)) ? parseInt(row.version, 10) : 0;
    const prior = byId.get(id);
    if (prior === undefined) {
      byId.set(id, { row, version: v, fileIdx: idx });
      return;
    }
    if (v > prior.version) {
      byId.set(id, { row, version: v, fileIdx: idx });
      return;
    }
    if (v === prior.version) {
      const priorT = String(prior.row.timestamp ?? "");
      const nextT = String(row.timestamp ?? "");
      if (nextT > priorT || (nextT === priorT && idx >= prior.fileIdx)) {
        byId.set(id, { row, version: v, fileIdx: idx });
      }
    }
  });
  return [...byId.values()].map((entry) => entry.row);
}

/**
 * Append-or-detect-existing dispatch ledger event under the cross-process
 * lock so concurrent commits of the SAME `ledgerId` serialize correctly.
 *
 * Behavior: reads existing rows inside the lock, checks for an
 * already-committed row with matching `id` + `kind === "ledger-event"`. If
 * found, returns `{appended: false, existing}` so the caller can short-
 * circuit the idempotent path (no double-write, no version bump). If not
 * found, computes the version, sets fingerprint, appends, and returns
 * `{appended: true, row}`. The result is from a single atomic critical
 * section — concurrent commit attempts are serialized by the lock.
 *
 * Caller MUST validate the row's other fields (source_ref, kind, etc.)
 * BEFORE calling — this helper only does the idempotency check.
 */
export async function appendOrFindDispatchLedgerEvent(root, row, ledgerId) {
  return await withRegistryLock(root, async () => {
    const rows = readRuntimeStateRows(root);
    const existing = rows.find(
      (r) => r && r.id === ledgerId && r.kind === "ledger-event",
    );
    if (existing) {
      return { appended: false, existing };
    }
    const maxV = rows.reduce((acc, r) => {
      if (r?.id !== row.id) return acc;
      const v = Number.isFinite(parseInt(r?.version, 10)) ? parseInt(r.version, 10) : 0;
      return v > acc ? v : acc;
    }, -1);
    const withVersion = { ...row, version: maxV + 1 };
    const withFingerprint = { ...withVersion, fingerprint: computeFingerprint(withVersion) };
    const sidecarPath = join(root, RUNTIME_STATE_FILENAME);
    appendFileSync(sidecarPath, JSON.stringify(withFingerprint) + "\n", "utf8");
    return { appended: true, row: withFingerprint };
  });
}

/**
 * Module-private helper for pruneSurfaceRows. Atomic temp+rename rewrite
 * of the sidecar with a pid-suffixed temp path so concurrent writers
 * can't collide on the temp name.
 */
function atomicRewriteSidecar(root, rows) {
  const path = join(root, RUNTIME_STATE_FILENAME);
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(tempPath, body, "utf8");
  try {
    renameSync(tempPath, path);
  } catch (err) {
    try { unlinkSync(tempPath); } catch { /* best-effort cleanup */ }
    throw err;
  }
}

/**
 * Rewrite the sidecar minus every row whose `affected_system` matches
 * `surface`. Atomic temp+rename; history is NOT preserved for the
 * pruned rows (this is the point — the operator is deleting noise).
 * Runs under the same cross-process lock as `appendLedgerEvent` so the
 * prune cannot interleave with a concurrent append. Returns
 * `{pruned, remaining}` so the caller can surface blast radius.
 */
export async function pruneSurfaceRows(root, surface) {
  return await withRegistryLock(root, async () => {
    const all = readRuntimeStateRows(root);
    const keep = all.filter((r) => r?.affected_system !== surface);
    atomicRewriteSidecar(root, keep);
    return { pruned: all.length - keep.length, remaining: keep.length };
  });
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
 * Runtime-state `affected_system` enum — the single source of truth for
 * the surfaces tracked by this sidecar. Imported by `runtime_state_record`,
 * `runtime_state_read`, and `runtime_state_pause`/`resume`. Distinct from
 * `core/meta-state.js`'s `AFFECTED_SYSTEM_ENUM`, which is a different
 * superset (includes `vnstock_vendor`, `meta`, `gate-logic`, …) — using
 * that superset here would let `pause("vnstock_vendor")` succeed while no
 * writer ever emits that surface.
 */
export const AFFECTED_SYSTEM_ENUM_RUNTIME = Object.freeze([
  "vnstock",
  "fastapi",
  "tanstack",
  "product",
  "api",
  "web",
  "meta-state-tools",
  "runtime-state",
]);

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
 * computed fingerprint filled in. The scan-then-append (existing rows →
 * assign `version = max+1` → recompute fingerprint → atomic append) is
 * wrapped in the cross-process file lock from core/registry-lock.js so
 * concurrent writers — across CLI one-shots, multiple runtimes sharing
 * GATE_ROOT, or `runtime_state_record` colliding with
 * `meta_state_dispatch_finding` — never both read `max=N` and both write
 * `version=N+1` (defeating `max_by(version)` dedup). Pure append —
 * does NOT check preflight, does NOT validate the row against any
 * schema (the caller has already done so via the tool's Zod input
 * schema). `version` is a dedup bookkeeping field and is NOT hashed by
 * v2 fingerprint (re-records already differ by `timestamp`).
 *
 * Cost: O(n) scan of the sidecar per append — acceptable at operator
 * scale (registry reports ~27 findings). An in-memory max-version cache
 * is YAGNI (and dead code on the CLI one-shot path).
 *
 * @param {string} root — project root containing runtime-state.jsonl
 * @param {object} row — fully-built row (with status, fingerprint=null, etc.)
 * @returns {Promise<object>} — the row with `version` + `fingerprint` set
 */
export async function appendLedgerEvent(root, row) {
  return await withRegistryLock(root, async () => {
    const existing = readRuntimeStateRows(root);
    const maxExisting = existing.reduce((acc, r) => {
      if (r?.id !== row.id) return acc;
      const v = Number.isFinite(parseInt(r?.version, 10)) ? parseInt(r.version, 10) : 0;
      return v > acc ? v : acc;
    }, -1);
    const withVersion = { ...row, version: maxExisting + 1 };
    const withFingerprint = { ...withVersion, fingerprint: computeFingerprint(withVersion) };
    const sidecarPath = join(root, RUNTIME_STATE_FILENAME);
    appendFileSync(sidecarPath, JSON.stringify(withFingerprint) + "\n", "utf8");
    return withFingerprint;
  });
}

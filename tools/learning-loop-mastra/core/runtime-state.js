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
import { withRegistryLock } from "./registry-lock.js";

/**
 * Read all rows from runtime-state.jsonl with a malformed-line count.
 * Empty/missing file -> { rows: [], malformed: 0 }. Unparseable lines are
 * dropped from `rows` but counted in `malformed` so callers that own an
 * invariant (e.g. `readBudgetTrackingState`) can fail-closed instead of
 * silently skipping a line that might have been a lifecycle record.
 */
export function readRuntimeStateRowsDetailed(root) {
  const path = join(root, RUNTIME_STATE_FILENAME);
  if (!existsSync(path)) return { rows: [], malformed: 0 };
  const raw = readFileSync(path, "utf8");
  const rows = [];
  let malformed = 0;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = JSON.parse(line);
      // A JSON `null` literal parses fine but is not a row — skip it
      // silently (longstanding skip-not-wipe semantics), do not count it
      // as malformed.
      if (parsed === null) continue;
      rows.push(parsed);
    } catch {
      malformed++;
    }
  }
  return { rows, malformed };
}

/**
 * Read all rows from runtime-state.jsonl. Empty/missing file -> []. Malformed
 * lines are skipped (counted by `readRuntimeStateRowsDetailed` for callers
 * that need to know). Shared by
 * `runtime_state_record` (read-your-own-writes checks), the dispatch tool
 * (idempotency scan), and the SessionStart hook (INC-10 orphan detection).
 * DRY: previously each caller reimplemented the JSONL read.
 *
 * Returns the RAW sidecar (every row) — historical and read-by-everyone
 * invariant. For `max_by(version)`-collapsed reads, use
 * `readRuntimeStateRowsLatest`.
 */
export function readRuntimeStateRows(root) {
  return readRuntimeStateRowsDetailed(root).rows;
}

/**
 * Collapse rows to the latest per `id` (`max_by(version)`, ties broken by
 * newest `timestamp` then last-in-file order, mirroring meta-state's
 * `created_at ?? ""` precedent at core/meta-state.js:768-769).
 * Missing/unparseable `version` defaults to 0 (legacy rows predate the
 * field). Missing/unparseable timestamps sort as "" (oldest) so a re-record
 * with a real timestamp wins over a legacy unversioned row lacking one.
 *
 * Module-private; returns `{row, version, fileIdx}` entries so callers that
 * need cross-id recency (e.g. `readBudgetTrackingState`) can sort by
 * fileIdx. `fileIdx` is the index within the passed array.
 */
function collapseLatestById(rows) {
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
  return [...byId.values()];
}

/**
 * Read runtime-state.jsonl and collapse to the latest row per `id`
 * (`max_by(version)` — see `collapseLatestById`).
 *
 * Order: first-seen by id in file order (matches the inbound gate's
 * mental model — it walks observations + sidecar rows in chronological
 * order, but consumers can re-sort).
 */
export function readRuntimeStateRowsLatest(root) {
  return collapseLatestById(readRuntimeStateRows(root)).map((entry) => entry.row);
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
  assertKindConditionalStatus(row);
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
 * Kind-conditional status rule: the JSON schema is intentionally NOT a
 * `z.object().refine()` — a refine on this shape silently no-ops
 * `delivery-classify.mjs:schemaValidateRow` and throws in consumer test
 * files. The rule lives here so the invariant is enforced at the actual
 * mutation boundary:
 *   - kind === "ledger-event"  → status MUST be "active" (immutable audit).
 *   - kind === "budget-state"  → status MUST be a lifecycle value
 *     ("initial" | "active" | "paused" | "stopped"); ledger-event audit
 *     rows are out of the gate's stale-scan scope by kind.
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
  assertKindConditionalStatus(row);
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

/**
 * Kind-conditional status guard. Throws on a violation; consumed by
 * `appendLedgerEvent` (always-on) and surfaced as a tool-level error by
 * the runtime-state handlers.
 */
export function assertKindConditionalStatus(row) {
  const kind = row?.kind;
  const status = row?.status;
  if (kind === "ledger-event") {
    if (status !== "active") {
      throw new Error(
        `runtime_state_kind_status_mismatch: ledger-event rows must have status "active", got ${JSON.stringify(status)}`,
      );
    }
    return;
  }
  if (kind === "budget-state") {
    const LIFECYCLE = new Set(["initial", "active", "paused", "stopped"]);
    if (!LIFECYCLE.has(status)) {
      throw new Error(
        `runtime_state_kind_status_mismatch: budget-state rows must have a lifecycle status (initial|active|paused|stopped), got ${JSON.stringify(status)}`,
      );
    }
    return;
  }
  throw new Error(`runtime_state_kind_unknown: kind must be "ledger-event" or "budget-state", got ${JSON.stringify(kind)}`);
}

/**
 * Canonical budget-tracking id per `affected_system`: one canonical id per
 * surface, and the canonical id is the surface name itself (the runtime-state
 * `affected_system` enum). Restart lives at the TOOL level: `stop` is
 * terminal per-id, so a fresh `runtime_state_record` with a different id
 * after `stop` starts a new entity.
 *
 * `readBudgetTrackingState` filters `kind === "budget-state"` BEFORE the
 * `max_by(version)` dedup so a ledger-event sharing an id can't shadow a
 * budget-state row. It THROWS on any unparseable line in the sidecar and
 * on any budget-state row with an invalid status: a stopped surface must
 * not silently un-stop because the parser skipped a malformed line. The
 * read-gate callers (`core/inbound-state.js`, `core/evaluate-inbound-gate.js`)
 * try/catch around the helper to degrade to "not paused" on the gate (the
 * gate must fail-open to a corrupt read); writer callers
 * (`runtime_state_record`, `meta_state_dispatch_finding`) must NOT swallow
 * the throw — writers fail-closed at the mutation boundary.
 *
 * @param {string} root — project root containing runtime-state.jsonl
 * @param {string} surface — runtime-state `affected_system` value
 * @returns {string | null} — latest lifecycle status, or null if no
 *   budget-state rows exist for the surface (a fresh surface). THROWS
 *   on a malformed sidecar line or a corrupt budget-state row (fail-closed
 *   for writers).
 */
export function readBudgetTrackingState(root, surface) {
  const { rows, malformed } = readRuntimeStateRowsDetailed(root);
  if (malformed > 0) {
    throw new Error(
      `runtime_state_budget_tracking_corrupt: ${malformed} unparseable line(s) in runtime-state.jsonl — refusing to resolve budget-tracking state for surface "${surface}" (a dropped line could be a lifecycle record)`,
    );
  }
  const budgetRows = rows.filter((r) => r && r.kind === "budget-state" && r.affected_system === surface);
  if (budgetRows.length === 0) return null;
  // Validate the kind-conditional status on each row BEFORE dedup so a
  // corrupt budget-state row surfaces as an error, not a silent skip.
  for (const row of budgetRows) {
    if (row.status !== "initial" && row.status !== "active" && row.status !== "paused" && row.status !== "stopped") {
      throw new Error(
        `runtime_state_budget_tracking_corrupt: budget-state row for surface "${surface}" has invalid status ${JSON.stringify(row.status)}`,
      );
    }
  }
  const latest = collapseLatestById(budgetRows).sort((a, b) => b.fileIdx - a.fileIdx)[0];
  return latest ? latest.row.status : null;
}

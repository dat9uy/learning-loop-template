// core/runtime-state.js — shared runtime-sidecar (runtime-state.jsonl) helpers.
//
// Extracted from runtime-state-record-tool.js to DRY the append + fingerprint
// path. The original tool defined `computeFingerprint` inline + wrote via
// appendFileSync — both extracted here so the new meta_state_dispatch_finding
// tool (also writing ledger events) can reuse the same append + fingerprint
// path without duplicating the crypto.
//
// IMPORTANT (P2 F6 — orthogonal-gate design): this helper does NOT enforce
// preflight. The preflight check (`hasPreflightMarker(root)`) stays at the
// public-tool boundary of `runtime_state_record`. The dispatch tool
// (meta_state_dispatch_finding) bypasses preflight by design and is ungated.
// Keep the helper gating-free so callers can apply the appropriate gate upstream.

import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { withRegistryLock } from "./registry-lock.js";

/**
 * Read all rows from a single runtime-state substrate file with a
 * malformed-line count. Empty/missing file -> { rows: [], malformed: 0 }.
 * Unparseable lines are dropped from `rows` but counted in `malformed` so
 * callers that own an invariant (e.g. `readBudgetTrackingState`) can
 * fail-closed instead of silently skipping a line that might have been a
 * lifecycle record.
 *
 * Destination-scoped primitive: the write path's version scan reads ONE
 * substrate via this helper, never the merged union — so per-substrate
 * versioning is real, not contradicted by a union-wide scan.
 *
 * @param {string} root — project root containing the substrate
 * @param {string} filename — the substrate file name (committed or local)
 * @returns {{ rows: object[], malformed: number }}
 */
export function readRuntimeStateRowsForFile(root, filename) {
  const path = join(root, filename);
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
 * Read all rows from the merged runtime-state view (committed substrate +
 * gitignored session-local substrate) with per-substrate malformed counts.
 * The committed file is read first, then the local file is concatenated
 * (missing local -> []), so a fresh clone with no local substrate sees only
 * the durable rows — correct by the L1 durability contract (a fresh clone
 * loses only session-scoped TTL'd allowances).
 *
 * `perFile: { committed, local }` gives callers the per-substrate malformed
 * split so `readBudgetTrackingState` can fail-closed on a corrupt COMMITTED
 * line while tolerating a corrupt disposable local line.
 */
export function readRuntimeStateRowsDetailed(root) {
  const committed = readRuntimeStateRowsForFile(root, RUNTIME_STATE_FILENAME);
  const local = readRuntimeStateRowsForFile(root, RUNTIME_STATE_LOCAL_FILENAME);
  return {
    rows: [...committed.rows, ...local.rows],
    malformed: committed.malformed + local.malformed,
    perFile: { committed, local },
  };
}

/**
 * Read all rows from the merged runtime-state view (committed + local).
 * Empty/missing both -> []. Malformed lines are skipped (counted by
 * `readRuntimeStateRowsDetailed` for callers that need to know). Shared by
 * `runtime_state_record` (read-your-own-writes checks), the dispatch tool
 * (idempotency scan), and the SessionStart hook (INC-10 orphan detection).
 * DRY: previously each caller reimplemented the JSONL read.
 *
 * Returns the RAW view (every row) — historical and read-by-everyone
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
 * Kind-before-collapse helper: filter to `kind === "budget-state"`
 * (read-compat: rows with no `kind` predate the discriminator and are
 * treated as budget-state — every row was scannable tracking state before
 * the kinds split), then dedup to `max_by(version)` per id, then return the
 * rows.
 *
 * The kind filter MUST happen BEFORE the dedup. `appendLedgerEvent`
 * versions rows kind-agnostically by `id` (see runtime-state.js:269-275 —
 * no kind check), and a canonical-id `ledger-event` is permitted when the
 * surface is active (runtime-state-record-tool.js:122-126;
 * runtime-contract.md:70). A naive collapse-all-then-filter-kind would let
 * a higher-version ledger-event sharing the canonical id shadow the
 * budget-state row, which the post-collapse kind filter then drops —
 * the budget-state observation vanishes. Kind-before-collapse prevents
 * that cross-kind id-collision. Shared by
 * `readBudgetTrackingState` (lifecycle reader, runtime-state.js:343-354)
 * and `readRuntimeObservations` (constraint-gate reader, file-readers.js)
 * to avoid forking the kind-before-collapse pattern.
 *
 * Module-private; returns an array of deduped budget-state rows in
 * first-seen-by-id order.
 */
export function collapseLatestBudgetStateById(rows) {
  const budgetRows = rows.filter(
    (r) => r && (r.kind ?? "budget-state") === "budget-state"
  );
  // Split: rows with a string id get the max_by(version) dedup; rows without
  // an id (legacy / hand-crafted) pass through unchanged. Legacy rows are
  // NOT collapsed by `collapseLatestById` (which drops no-id rows) and stay
  // per-row (conservative) — preserving per-row emission for legacy data
  // shapes. The kind filter is the only load-bearing step for the
  // cross-kind collision guard (a canonical-id ledger-event sharing an id
  // with a budget-state is filtered out BEFORE the dedup, so it cannot
  // shadow).
  const withId = [];
  const withoutId = [];
  for (const row of budgetRows) {
    if (typeof row.id === "string" && row.id !== "") withId.push(row);
    else withoutId.push(row);
  }
  return [
    ...collapseLatestById(withId).map((entry) => entry.row),
    ...withoutId,
  ];
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
  // Durable-only append path: a dispatch ledger row is a `ledger-event`
  // (immutable audit) and must land in the committed substrate. It
  // deliberately bypasses the durability routing of `appendLedgerEvent`; if
  // an ephemeral dispatch row is ever needed, route it through
  // `appendLedgerEvent` with `durability:"ephemeral"` rather than forking
  // this path.
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
 * Canonical committed sidecar filename — the durable substrate (ledger logs +
 * the budget-tracking lifecycle). Exported so `gate-override.js` and any
 * other durable-append path import the const instead of hardcoding the
 * string. The local substrate is `RUNTIME_STATE_LOCAL_FILENAME`
 * (gitignored, session-scoped).
 */
export const RUNTIME_STATE_FILENAME = "runtime-state.jsonl";

/**
 * Session-local ephemeral substrate — TTL'd allowance rows (`gate-verb:*`)
 * that belong to the session that minted them (L1 durability axis). Lives
 * under `.loop/` and is gitignored, so a fresh clone loses only these
 * session-scoped allowances. The write path resolves the destination from
 * `row.durability ?? "durable"`.
 */
export const RUNTIME_STATE_LOCAL_FILENAME = ".loop/runtime-state-local.jsonl";

/**
 * Runtime-state `affected_system` enum — the single source of truth for
 * the surfaces tracked by this sidecar. Imported by `runtime_state_record`,
 * `runtime_state_read`, and `runtime_state_pause`/`resume`. Distinct from
 * `core/meta-state.js`'s `AFFECTED_SYSTEM_ENUM`, which is a different
 * superset (includes `vnstock_vendor`, `meta`, `gate-logic`, …) — using
 * that superset here would let `pause("vnstock_vendor")` succeed while no
 * writer ever emits that surface.
 *
 * The `gate-verb:<verb>` entries are derived from `patterns.json["gate-verbs"]`
 * — the same source `file-readers.js` builds its
 * `affected_system → constraint` identity mapping from — so the write-side
 * enum and the read-side mapping cannot drift. The read happens here (not
 * via a shared helper in `file-readers.js`) because `file-readers.js`
 * imports from this module; a helper there would be circular.
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
  ...(JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "patterns.json"),
      "utf8",
    ),
  )["gate-verbs"] || []).map((entry) => {
    const verb = typeof entry === "string" ? entry : entry.verb;
    return `gate-verb:${verb}`;
  }),
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
 * @param {string} root — project root containing the substrate
 * @param {object} row — fully-built row (with status, fingerprint=null, etc.)
 * @returns {Promise<object>} — the row with `version` + `fingerprint` set
 */
export async function appendLedgerEvent(root, row) {
  assertKindConditionalStatus(row);
  const filename = resolveDestinationFilename(row);
  return await withRegistryLock(root, async () => {
    // Destination-scoped version scan: reads ONLY the destination substrate
    // so per-substrate versioning is real — a durable row's version is never
    // perturbed by ephemeral rows in the local file (and vice versa). The
    // merged read is read-side only.
    const { rows: existing } = readRuntimeStateRowsForFile(root, filename);
    const maxExisting = existing.reduce((acc, r) => {
      if (r?.id !== row.id) return acc;
      const v = Number.isFinite(parseInt(r?.version, 10)) ? parseInt(r.version, 10) : 0;
      return v > acc ? v : acc;
    }, -1);
    const withVersion = { ...row, version: maxExisting + 1 };
    const withFingerprint = { ...withVersion, fingerprint: computeFingerprint(withVersion) };
    const sidecarPath = join(root, filename);
    // The local substrate's parent dir (`.loop/`) may not exist in a fresh
    // clone — create it on first ephemeral append. The committed substrate
    // lives at the root so this is a no-op for durable rows.
    mkdirSync(dirname(sidecarPath), { recursive: true });
    appendFileSync(sidecarPath, JSON.stringify(withFingerprint) + "\n", "utf8");
    return withFingerprint;
  });
}

/**
 * Resolve the destination substrate filename from a row's `durability`
 * axis. Absent `durability` defaults to durable (back-compat for every
 * existing caller that omits it and writes a non-`gate-verb` row). The
 * symmetric namespace guard at the record-tool boundary guarantees a
 * `gate-verb:*` row always carries `durability: "ephemeral"` and a
 * non-`gate-verb` row always durable, so this resolution never contradicts
 * the contract.
 */
export function resolveDestinationFilename(row) {
  return (row?.durability ?? "durable") === "ephemeral"
    ? RUNTIME_STATE_LOCAL_FILENAME
    : RUNTIME_STATE_FILENAME;
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
 * @param {string} root — project root containing the substrate
 * @param {string} surface — runtime-state `affected_system` value
 * @returns {string | null} — latest lifecycle status, or null if no
 *   budget-state rows exist for the surface (a fresh surface). THROWS
 *   on a malformed COMMITTED-sidecar line or a corrupt budget-state row
 *   (fail-closed for writers). A malformed line in the gitignored local
 *   substrate does NOT poison durable lifecycle reads — the local file
 *   holds disposable session allowances, not lifecycle records.
 */
export function readBudgetTrackingState(root, surface) {
  const { rows, perFile } = readRuntimeStateRowsDetailed(root);
  if (perFile.committed.malformed > 0) {
    throw new Error(
      `runtime_state_budget_tracking_corrupt: ${perFile.committed.malformed} unparseable line(s) in runtime-state.jsonl — refusing to resolve budget-tracking state for surface "${surface}" (a dropped line could be a lifecycle record)`,
    );
  }
  // Dedup with kind-before-collapse via the shared helper. Scoping the
  // budget-state + surface filter to this reader (vs letting the helper
  // collapse across all surfaces) keeps the validation loop targeted at THIS
  // surface's rows — a corrupt row on another surface does not blow up a
  // query for `surface`.
  const surfaceRows = rows.filter((r) => r && r.kind === "budget-state" && r.affected_system === surface);
  if (surfaceRows.length === 0) return null;
  // Validate the kind-conditional status on each row BEFORE dedup so a
  // corrupt budget-state row surfaces as an error, not a silent skip.
  for (const row of surfaceRows) {
    if (row.status !== "initial" && row.status !== "active" && row.status !== "paused" && row.status !== "stopped") {
      throw new Error(
        `runtime_state_budget_tracking_corrupt: budget-state row for surface "${surface}" has invalid status ${JSON.stringify(row.status)}`,
      );
    }
  }
  // Not switched to the shared collapseLatestBudgetStateById helper (a DRY
  // goal): this lifecycle reader needs the {row, version, fileIdx} entries
  // to sort by fileIdx for the cross-id recency tiebreak, and collapseLatestById
  // here drops no-id legacy rows (the helper would pass them through — a
  // lifecycle-read behavior change). collapseLatestById is idempotent on
  // already-filtered rows; the helper's kind-filter is a no-op here.
  const latest = collapseLatestById(surfaceRows).sort((a, b) => b.fileIdx - a.fileIdx)[0];
  return latest ? latest.row.status : null;
}

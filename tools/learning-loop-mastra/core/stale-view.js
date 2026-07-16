/**
 * Derived evidence-freshness view — replaces persisted `status: "stale"`.
 *
 * Plan 260707-0812 (lifecycle-status-stale-mechanism) Phase 1: ships the
 * predicate pair that phase 2's read-site rewrites use, de-risking the enum
 * collapse by establishing the new threshold before any schema change.
 *
 * Why a derived view: `stale` is a property of evidence (age + hash drift),
 * not a lifecycle state. Persisting it as a status forks the lifecycle on a
 * ceremony that adds no information. Computing it on read collapses the
 * `stale-ref`-style drift follow-up by construction.
 *
 * Transition tolerance: `isOpen` accepts legacy `active`/`reported`/`stale`
 * as open-equivalent. The 22-finding migration (phase 4, on main) flips the
 * persisted values; this tolerance makes the code/migration order
 * non-breaking.
 *
 * `STALENESS_WINDOW_MS` and `isOpen` come from `core/constants.js` (the shared
 * primitive-layer source). This module re-exports `isOpen` so callers of the
 * predicate-pair API (`isOpen`/`isStaleView`/`derivedStaleSet`) don't need a
 * separate import; `isOpen`'s canonical home is `core/constants.js` so
 * low-layer primitives (e.g. `file-readers.js`) can use it without importing
 * a verification-tier module.
 *
 * Plan 260716-0624 (stale-view hash-drift fix): hash-aware `hasDrifted` matching
 * SP2 semantics at `core/check-grounding.js:201-208`. Drift = current bytes
 * (from caller-injected `codeHashes`) differ from the stored baseline (index
 * entry, falling back to per-record `code_fingerprint`). Both sides are
 * regex-validated via `TERMINAL_HASH_REGEX`. The helper `computeCurrentHashes`
 * builds the current-bytes map from disk; the predicate itself stays pure
 * (no fs reads). Backward compat: callers that don't inject `codeHashes` get
 * age-only behavior — same as today's `derive-status.js:141` call site.
 */

import { canonicalIndexKey, readFileIndex } from "./meta-state.js";
import { STALENESS_WINDOW_MS, isOpen } from "./constants.js";
import { computeFileHash, TERMINAL_HASH_REGEX } from "./check-grounding.js";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";
import { appendGateLog } from "../tools/lib/gate-logging.js";

export { isOpen };

/**
 * Reference time for staleness: prefer the most recent verification stamp
 * (so a freshly-verified finding is NOT stale-view regardless of created_at),
 * fall back to created_at. Mirrors the same preference order as the prior
 * `checkStaleness` (which used `acked_at || created_at`) — phase 3's re_verify
 * drops `acked_at` and uses `last_verified_at` instead, so this function uses
 * the post-phase-3 fields.
 */
function referenceTimeMs(entry) {
  const ref = entry.last_verified_at || entry.created_at;
  if (!ref) return null;
  const t = new Date(ref).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Hash drift: true iff both a current hash AND a stored baseline exist and
 * differ. Replicates SP2's regex-validated fallback chain
 * (`check-grounding.js:201-208`):
 *
 *   storedHash = indexBaseline (TERMINAL_HASH_REGEX-validated)
 *               ?? entry.code_fingerprint (TERMINAL_HASH_REGEX-validated)
 *               ?? null
 *
 * Caller injects:
 *   - `fileIndex`: Map<canonicalKey, hash> from `readFileIndex(root)`
 *   - `codeHashes`: Map<canonicalKey, currentHash> from `computeCurrentHashes(entries, root)`
 *
 * Pure: no fs reads. Missing `codeHashes` (or empty) → false (backward compat
 * with callers that don't inject drift signals today).
 *
 * Path-safety: the caller is responsible for the `codeHashes` map's integrity
 * (built via `computeCurrentHashes`, which routes through `resolveSafePath` to
 * reject traversal/symlink/hardlink escapes). The predicate itself does not
 * read the filesystem.
 */
function hasDrifted(entry, fileIndex, codeHashes) {
  const ref = entry.evidence_code_ref;
  if (typeof ref !== "string") return false;
  if (!fileIndex && !codeHashes) return false;
  const canonical = canonicalIndexKey(ref);

  const currentHash = codeHashes instanceof Map && codeHashes.has(canonical)
    ? codeHashes.get(canonical)
    : null;

  const rawIndex = fileIndex instanceof Map && fileIndex.has(canonical)
    ? fileIndex.get(canonical)
    : null;
  const indexBaseline = typeof rawIndex === "string" && TERMINAL_HASH_REGEX.test(rawIndex)
    ? rawIndex
    : null;

  const storedHash = indexBaseline
    ?? (typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint
        : null);

  if (currentHash === null || storedHash === null) return false;
  return currentHash !== storedHash;
}

/**
 * `isStaleView(finding, opts)` — true when the finding is open AND its
 * evidence is past the staleness window OR has drifted.
 *
 * `opts.now` defaults to `Date.now()`; callers should pass an explicit `now`
 * for deterministic tests (no Date.now in scripts per the workflow rule).
 * `opts.fileIndex` is an optional `Map<canonicalKey, hash>` from
 * `readFileIndex(root)`.
 * `opts.codeHashes` is an optional `Map<canonicalKey, currentHash>` from
 * `computeCurrentHashes(entries, root)`.
 *
 * Backward compat: when `opts.codeHashes` is omitted, drift is treated as
 * "no drift" and only the age check fires. Callers that want the drift
 * signal must inject both maps.
 */
export function isStaleView(entry, opts = {}) {
  if (!isOpen(entry)) return false;
  const refMs = referenceTimeMs(entry);
  if (refMs === null) return false; // no timestamp → not stale by age
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const ageMs = now - refMs;
  const ageStale = ageMs > STALENESS_WINDOW_MS;
  const driftStale = hasDrifted(entry, opts.fileIndex, opts.codeHashes);
  return ageStale || driftStale;
}

/**
 * `derivedStaleSet(entries, opts)` — pure selector returning the stale-view
 * subset. Used by `cold-tier-regression.test.js` for the cap assertion and
 * (phase 3) by `meta_state_sweep` for its read-only report.
 *
 * Defensive: skips null/undefined entries rather than throwing — the registry
 * reader is the source of truth and filters them, but a consumer that hands us
 * an already-filtered array should not have to re-filter.
 */
export function derivedStaleSet(entries, opts = {}) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const e of entries) {
    if (!e) continue;
    if (isStaleView(e, opts)) out.push(e);
  }
  return out;
}

/**
 * `computeCurrentHashes(entries, root)` — impure helper that builds a
 * `Map<canonicalKey, currentHash>` for a set of entries by hashing each
 * unique `evidence_code_ref`'s underlying file. Returns
 * `{ ok: Map<canonicalKey, currentHash>, skipped: Array<{canonical, reason}> }`.
 *
 * Path safety: routes through `resolveSafePath(root, canonical)` to reject
 * traversal, symlink, and hardlink escapes. Files that escape the root are
 * captured in `skipped` with `reason: "containment_violation:..."` — never
 * hashed, never appear in `ok`.
 *
 * Error handling (RT: M20):
 *   - File missing: `skipped.push({canonical, reason: "missing"})` — no log
 *     breadcrumb (high-frequency; callers should not gate-log these).
 *   - Permission / I/O error (EACCES, EMFILE, EISDIR): `skipped.push` with
 *     `reason: "fs_error:<code>"` — callers should gate-log these.
 *   - Containment violation: `skipped.push` with `reason: "containment_violation:<reason>"`.
 *
 * Purity boundary: this helper is impure (reads fs). It is invoked by tool
 * handlers (MCP server layer), NOT by the pure `isStaleView` predicate.
 * The predicate accepts the caller-injected map to stay deterministic.
 *
 * Performance: dedupes by canonical key (one `readFileSync` per unique path).
 * With ~80 distinct paths and ~268 findings, ~80 reads per call.
 */

/**
 * Classify an fs error into a stable `reason` string. Pure / branchless at the
 * boundary so `computeCurrentHashes` stays a thin loop. The order matters:
 * the `outside_root + resolvedPath:null` branch is the ENOENT-inside-root case
 * that `resolveSafePath` propagates — treat as `missing`, not as a containment
 * violation. Anything else with a `PathContainmentError` is a real escape.
 */
function classifyHashError(err) {
  if (
    err instanceof PathContainmentError &&
    err.reason === "outside_root" &&
    err.resolvedPath === null
  ) {
    return "missing"; // ENOENT inside root — high-frequency, no log breadcrumb
  }
  if (err instanceof PathContainmentError) {
    return `containment_violation:${err.reason}`;
  }
  if (err?.code === "ENOENT") return "missing";
  if (err instanceof Error && err.name === "FileNotFoundError") return "missing";
  return `fs_error:${err?.code ?? "unknown"}`;
}

export function computeCurrentHashes(entries, root) {
  const ok = new Map();
  const skipped = [];
  if (!Array.isArray(entries)) return { ok, skipped };
  const seen = new Set();
  for (const e of entries) {
    const ref = e?.evidence_code_ref;
    if (typeof ref !== "string" || ref.length === 0) continue;
    const canonical = canonicalIndexKey(ref);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    try {
      const absPath = resolveSafePath(root, canonical);
      ok.set(canonical, computeFileHash(absPath));
    } catch (err) {
      skipped.push({ canonical, reason: classifyHashError(err) });
      // No entry → no drift signal. Predicate treats missing currentHash as no-drift.
    }
  }
  return { ok, skipped };
}

/**
 * Build the drift signals bundle (`fileIndex` + `codeHashes`) that the
 * `isStaleView` predicate consumes, AND emit gate-log breadcrumbs for
 * non-`missing` skipped paths. Centralizes the 11-line pattern that was
 * previously inlined in 4 handlers.
 *
 * Plan 260716-0624 Phase 02 (RT: M20): one source of truth for the
 * `(readFileIndex + computeCurrentHashes + skipped-logging)` trio so the
 * gate attribution (`tool`) and the timestamp stay consistent.
 *
 * @param {Array} entries — registry entries to inspect
 * @param {string} root — repo root (resolved via the caller's surface)
 * @param {object} opts
 * @param {string} opts.toolName — tool/caller name for gate-log attribution
 * @returns {{ fileIndex: object, codeHashes: Map<string, string> }}
 */
export function buildDriftSignals(entries, root, { toolName } = {}) {
  const fileIndex = readFileIndex(root);
  const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);
  const timestamp = new Date().toISOString();
  for (const s of skipped) {
    if (s.reason === "missing") continue;
    appendGateLog(root, {
      timestamp,
      tool: toolName ?? "unknown",
      action: "compute_current_hash_skipped",
      canonical: s.canonical,
      reason: s.reason,
    });
  }
  return { fileIndex, codeHashes };
}

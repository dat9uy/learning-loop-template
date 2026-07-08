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
 */

import { canonicalIndexKey } from "./meta-state.js";
import { STALENESS_WINDOW_MS, isOpen } from "./constants.js";

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
 * Hash drift: present iff the finding has an `evidence_code_ref` whose
 * canonical key is in the file-index. A present index entry means the cited
 * file has been refreshed since the finding was last grounded — drift by
 * construction. We don't compare hashes here (the predicate is pure and
 * should not read the filesystem); the comparison happens in
 * `meta_state_check_grounding` (SP2). The predicate only needs to surface
 * "index entry exists for this path" as a stale signal.
 */
function hasDrifted(entry, fileIndex) {
  if (!fileIndex || fileIndex.size === 0) return false;
  const ref = entry.evidence_code_ref;
  if (!ref) return false;
  return fileIndex.has(canonicalIndexKey(ref));
}

/**
 * `isStaleView(finding, opts)` — true when the finding is open AND its
 * evidence is past the staleness window OR has drifted.
 *
 * `opts.now` defaults to `Date.now()`; callers should pass an explicit `now`
 * for deterministic tests (no Date.now in scripts per the workflow rule).
 * `opts.fileIndex` is an optional `Map<canonicalKey, hash>` from
 * `readFileIndex(root)`. When omitted, drift is treated as "no drift" and
 * only the age check fires.
 */
export function isStaleView(entry, opts = {}) {
  if (!isOpen(entry)) return false;
  const refMs = referenceTimeMs(entry);
  if (refMs === null) return false; // no timestamp → not stale by age
  const now = typeof opts.now === "number" ? opts.now : Date.now();
  const ageMs = now - refMs;
  const ageStale = ageMs > STALENESS_WINDOW_MS;
  const driftStale = hasDrifted(entry, opts.fileIndex);
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
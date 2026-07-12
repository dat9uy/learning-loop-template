/**
 * Shared core constants — single source of truth for module-level values that
 * cross module boundaries and risk circular imports.
 *
 * Plan 260707-0812 Phase 1: `STALENESS_WINDOW_MS` is extracted here from
 * `core/meta-state.js` so the new `core/stale-view.js` and the
 * (read-only-after-Phase-3) `meta-state-sweep-tool.js` cannot drift apart.
 * The env-var name `META_STATE_STALENESS_WINDOW_MS` is preserved for
 * backward compatibility with existing operator overrides.
 */

/** Default staleness window: 7 days. Overridable via the `META_STATE_STALENESS_WINDOW_MS` env var. */
export const STALENESS_WINDOW_MS = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || 7 * 24 * 60 * 60 * 1000;

/**
 * Plan 260712-0300 Phase 2: single source of truth for `BATCH_SIZE_LIMIT`.
 * Previously the handler default was 500 and the core default was 100; calls
 * with 101–500 ops got a misleading `applied:0` from one layer with no
 * explanation. Centralized here so both layers read the same value.
 *
 * Overridable via `META_STATE_BATCH_LIMIT` env var for stress tests.
 */
export const BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500;

/**
 * The terminal statuses `isOpen` excludes: `resolved`/`superseded` plus
 * `archived` (applied at runtime, outside the persisted enum). Mirrors the
 * terminal set in `core/meta-state.js` with `archived` added. Local to this
 * module: only `isOpen` consumes it, and other modules keep their own
 * role-specific terminal sets (e.g. dispatch excludes `archived` differently).
 */
const TERMINAL_STATUSES = new Set(["resolved", "superseded", "archived"]);

/**
 * `isOpen(entry)` — true when the entry is not in a terminal status.
 *
 * Tolerates legacy `active`/`reported`/`stale` (and missing status) as open,
 * so the persisted-status migration can land after the code change: legacy
 * entries keep flowing through `isOpen` filters until their stored status is
 * flipped to `open` for steady-state uniformity.
 */
export function isOpen(entry) {
  if (!entry || typeof entry !== "object") return false;
  const status = entry.status;
  if (status === null || status === undefined) return true;
  return !TERMINAL_STATUSES.has(status);
}
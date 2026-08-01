/**
 * Shared core constants — single source of truth for module-level values that
 * cross module boundaries and risk circular imports.
 * `STALENESS_WINDOW_MS` is extracted here from
 * `core/meta-state.js` so `core/stale-view.js` and the read-only
 * `meta-state-sweep-tool.js` cannot drift apart.
 * The env-var name `META_STATE_STALENESS_WINDOW_MS` is preserved for
 * backward compatibility with existing operator overrides.
 */

/** Default staleness window: 7 days. Overridable via the `META_STATE_STALENESS_WINDOW_MS` env var. */
export const STALENESS_WINDOW_MS = Number(process.env.META_STATE_STALENESS_WINDOW_MS) || 7 * 24 * 60 * 60 * 1000;

/**
 * Observation staleness window — used by the
 * inbound gate's age scan (`observation-staleness.js#isObservationStaleByAge`)
 * and the bash gate's marker scan (`isObservationStaleByMarker`). 30 min
 * matches the prior two independent constants it unifies. Distinct from
 * `STALENESS_WINDOW_MS` (7 days, for findings/meta-state), so the two
 * concepts do not drift. Overridable via
 * `META_STATE_OBSERVATION_STALENESS_WINDOW_MS` (mirrors the
 * `META_STATE_*` prefix convention).
 */
export const OBSERVATION_STALENESS_WINDOW_MS =
  Number(process.env.META_STATE_OBSERVATION_STALENESS_WINDOW_MS) || 30 * 60 * 1000;

/**
 * Single source of truth for `BATCH_SIZE_LIMIT`.
 * Previously the handler default was 500 and the core default was 100; calls
 * with 101–500 ops got a misleading `applied:0` from one layer with no
 * explanation. Centralized here so both layers read the same value.
 *
 * Overridable via `META_STATE_BATCH_LIMIT` env var for stress tests.
 */
/**
 * Single source of truth for the finding-entry `category` / `severity`
 * enums. Consumed by the zod schema in `core/meta-state.js` (which
 * re-exports the categories for backward compat) and by the SessionStart
 * transport banner (`hooks/universal/session-start-inject-discoverability.cjs`),
 * which inlines the values into the write-tool sketch — centralizing here
 * means a new category or severity cannot silently leave the banner stale.
 */
export const META_STATE_FINDING_CATEGORIES = [
  "gate-logic-bug", "record-repair-gap", "schema-drift",
  "mcp-tool-missing", "budget-check",
  "loop-anti-pattern",
];

export const META_STATE_FINDING_SEVERITIES = ["warning", "escalate"];

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
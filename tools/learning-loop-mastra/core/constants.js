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
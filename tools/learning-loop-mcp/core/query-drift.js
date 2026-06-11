import { deriveStatus } from "./derive-status.js";
import { checkGrounding } from "./check-grounding.js";

/**
 * SP3 Drift Aggregation — pure function (no I/O, no subprocess).
 *
 * Joins SP1's deriveStatus (unconditional) + SP2's checkGrounding (opt-in via
 * codeContext.run_grounding) across the registry and filters for drift.
 *
 * 4-case join logic (locked design, brainstorm-260603-sp3-drift.md):
 *   1. SP1 resolved-by-mechanism + SP2 grounded/skipped/unknown   → drift, resolve
 *   2. SP1 resolved-by-mechanism + SP2 drifted                    → drift, resolve (derivation primary)
 *   3. SP1 active-no-signal    + SP2 drifted                      → drift, investigate
 *   4. SP1 active-no-signal    + SP2 grounded/skipped/unknown     → no drift
 *   5. SP1 active-uncertain    + anything                         → drift, investigate
 *   6. SP1 code-missing        + anything                         → drift, investigate
 *
 * Filter contract: this function is filter-agnostic. The tool layer filters
 * the registry by `filter.status` BEFORE passing entries to this function.
 *
 * Change-log fast path: SP1 returns kind:"no-signals" for entry_kind:"change-log";
 * those entries are skipped here without further inspection.
 */
export function queryDrift(entries, codeContext = {}) {
  const runGrounding = codeContext.run_grounding === true;
  const driftEvents = [];

  for (const entry of entries) {
    // SP1 derivation (unconditional)
    const derivation = deriveStatus(entry, codeContext);

    // Change-log fast path: no-signals → skip
    if (derivation.derivation.kind === "no-signals") continue;

    // Optionally run SP2 grounding (only when entry has evidence_code_ref)
    let grounding = null;
    if (runGrounding && typeof entry.evidence_code_ref === "string") {
      grounding = checkGrounding(entry, codeContext);
    }

    // Determine if this entry is a drift candidate
    if (!computeIsDrift(derivation, grounding, entry)) continue;

    // Compute recommendation based on join result
    const recommendation = computeRecommendation(derivation, grounding);

    driftEvents.push({
      id: entry.id,
      raw_status: entry.status,
      derived_status: derivation.derived_status,
      drift_kind: "assertion_lags_derivation",
      recommendation,
    });
  }

  return {
    drift_count: driftEvents.length,
    drift_events: driftEvents,
  };
}

/**
 * Internal helper: 4-case join logic.
 * Returns true iff the entry's raw_status disagrees with the joined view.
 *
 * NOTE: SP1's `derived_status` enum has 3 values: `resolved-by-mechanism`,
 * `active-no-signal`, `active-uncertain`. The `code-missing` case is captured
 * in SP1's `derivation.kind` (a separate enum with 4 values), not as a
 * `derived_status`. So we also check `derivation.kind === "code-missing"`
 * to detect "the mechanism's file is gone" as a drift event.
 */
function computeIsDrift(derivation, grounding, entry) {
  // Terminal statuses (auto-resolved, resolved, superseded) are always
  // non-drift — the entry's claim is consistent with its terminal state, since
  // the entry is no longer the canonical source. The TERMINAL_STATUSES set in
  // core/meta-state.js is the source of truth for which statuses count.
  const rawActive = entry.status === "active" || entry.status === "reported";
  if (!rawActive) return false;

  // Case 1 & 2: SP1 says resolved-by-mechanism → drift (derivation source)
  if (derivation.derived_status === "resolved-by-mechanism") return true;

  // Case 5: SP1 says active-uncertain (code exists but test missing) → drift
  if (derivation.derived_status === "active-uncertain") return true;

  // Case 6: SP1 says the code ref is missing → drift (mechanism is gone)
  if (derivation.derivation.kind === "code-missing") return true;

  // Case 3: SP2 says drifted → drift (grounding source) — only if SP2 was run
  if (grounding && grounding.status === "drifted") return true;

  return false;
}

/**
 * Internal helper: recommendation based on join result.
 *
 * Note: SP1's locked `recommendation` enum has 4 values (`no_action`, `resolve`,
 * `investigate`, `log_drift`). SP3 only emits `resolve` or `investigate` because
 * the lean drift event shape filters to actionable outcomes. `no_action` and
 * `log_drift` are not drift conditions (see `computeIsDrift`).
 */
function computeRecommendation(derivation, grounding) {
  // Case 6: SP1 says code-missing → investigate (file is gone)
  if (derivation.derivation.kind === "code-missing") {
    return "investigate";
  }

  // SP1 resolved + SP2 grounded/skipped/unknown/not-run → resolve
  if (derivation.derived_status === "resolved-by-mechanism" &&
      (!grounding || grounding.status === "grounded" || grounding.status === "skipped" || grounding.status === "unknown")) {
    return "resolve";
  }

  // SP1 resolved + SP2 drifted → resolve (primary = derivation)
  if (derivation.derived_status === "resolved-by-mechanism" &&
      grounding && grounding.status === "drifted") {
    return "resolve";
  }

  // SP1 active-uncertain → investigate (case 5 dominates)
  if (derivation.derived_status === "active-uncertain") {
    return "investigate";
  }

  // SP1 not resolved + SP2 drifted → investigate (ground is the only signal)
  if (grounding && grounding.status === "drifted") {
    return "investigate";
  }

  // Default: investigate (shouldn't reach here for the join cases)
  return "investigate";
}

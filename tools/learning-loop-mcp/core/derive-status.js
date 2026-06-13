import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";

/**
 * Source-of-truth enums. Export so introspection layers (e.g. core/loop-introspect.js
 * in a future SP3) can derive from the same source — mirrors SP0's META_STATE_FINDING_CATEGORIES.
 */
export const META_STATE_DERIVATION_KINDS = [
  "mechanism-shipped", "code-only", "code-missing", "no-signals",
];

export const META_STATE_DERIVED_STATUSES = [
  "resolved-by-mechanism", "active-no-signal", "active-uncertain",
];

export const META_STATE_RECOMMENDATIONS = [
  "no_action", "resolve", "investigate", "log_drift", "re_verify",
];

/** Terminal raw_status values: a `resolved-by-mechanism` derivation is NOT drift
 *  if the entry is already in a terminal state (the agent's claim is consistent).
 *  The legacy 'expired' status was removed in plan 260611-1000; 'stale' is
 *  non-terminal (cascade-closeable) so it is not in this set. */
const TERMINAL_RAW_STATUSES = new Set(["auto-resolved", "resolved"]);

/**
 * Derive the effective status of a meta-state finding entry.
 *
 * Pure: deterministic given (entry, codeContext) inputs, including the
 * injected `now` and `codeContext.root` for filesystem checks. No subprocess
 * execution; `test_passed` is passed in, not computed here.
 *
 * Output uses `signals` (not `evidence`) for per-check booleans because
 * `evidence` is reserved for `records/meta/evidence/` artifacts in the
 * parent doc (per the locked design, brainstorm-260602-sp1-derive-status.md).
 *
 * All entry kinds flow through the same evaluation path. The previous
 * change-log fast path (returning `kind: "no-signals"` for any change-log)
 * was removed when the dual-field migration established top-level
 * `evidence_code_ref` on change-log entries — change-logs now carry
 * evidence and must be evaluated normally so SP3 drift detection covers them.
 *
 * Path safety: the function does not validate path safety — callers should
 * sanitize paths. Relative paths are joined with `codeContext.root` using
 * standard path resolution (e.g., `../` traverses upward).
 */
// fallow-ignore-next-line complexity
export function deriveStatus(entry, codeContext) {
  const root = codeContext.root;
  const now = codeContext.now ?? (() => Date.now());
  const t0 = now();

  // Signal extraction: top-level evidence fields only (nested form removed by migration)
  const codeRef = typeof entry.evidence_code_ref === "string" ? entry.evidence_code_ref : null;
  const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;

  const codeRefExists = codeRef ? checkExists(root, codeRef) : null;
  const testFileExists = testPath ? checkExists(root, testPath) : null;

  const signals = {
    ...(codeRef !== null && { code_ref_exists: codeRefExists, code_ref_path: codeRef }),
    ...(testPath !== null && { test_file_exists: testFileExists, test_file_path: testPath }),
    test_passed: codeContext.test_passed ?? null,
  };

  // Kind computation
  const kind = computeKind(codeRefExists, testFileExists, codeRef, testPath);
  const derived_status = computeDerivedStatus(kind);
  const recommendation = computeRecommendation(derived_status, kind, entry.status);
  const drift = computeDrift(derived_status, entry.status);

  return {
    id: entry.id,
    raw_status: entry.status ?? "unknown",
    derived_status,
    derivation: {
      kind,
      signals,
      checked_at: new Date(t0).toISOString(),
      duration_ms: now() - t0,
    },
    drift,
    recommendation,
  };
}

function checkExists(root, path) {
  const fullPath = isAbsolute(path) ? path : join(root, path);
  return existsSync(fullPath);
}

// fallow-ignore-next-line complexity
function computeKind(codeRefExists, testFileExists, codeRef, testPath) {
  if (codeRef === null && testPath === null) return "no-signals";
  if (codeRefExists === false) return "code-missing";
  if (testPath !== null && testFileExists === false) return "code-only";
  return "mechanism-shipped";
}

function computeDerivedStatus(kind) {
  if (kind === "mechanism-shipped") return "resolved-by-mechanism";
  if (kind === "code-only") return "active-uncertain";
  return "active-no-signal"; // code-missing or no-signals
}

// fallow-ignore-next-line complexity
function computeRecommendation(derivedStatus, kind, rawStatus) {
  if (kind === "mechanism-shipped" && (rawStatus === "reported" || rawStatus === "active")) {
    return "resolve";
  }
  if (kind === "mechanism-shipped" && rawStatus === "stale") {
    return "re_verify";
  }
  if (kind === "mechanism-shipped" && TERMINAL_RAW_STATUSES.has(rawStatus)) {
    return "log_drift";
  }
  if (kind === "code-missing") return "investigate";
  return "no_action";
}

function computeDrift(derivedStatus, rawStatus) {
  if (derivedStatus !== "resolved-by-mechanism") return false;
  return !TERMINAL_RAW_STATUSES.has(rawStatus);
}

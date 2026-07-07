import { existsSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";
import { isOpen, isStaleView } from "./stale-view.js";

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
 *  Plan 260707-0812 Phase 2: `stale` and `auto-resolved` are removed — `stale` is
 *  a derived view, and `auto-resolved` was a dead write-path removed by the enum
 *  collapse. `superseded` is closed via a change-log. */
const TERMINAL_RAW_STATUSES = new Set(["resolved", "superseded"]);

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
  // LIM-4: realpath containment — rejects traversal/symlink/hardlink escape.
  // A missing file inside root (ENOENT, resolvedPath === null) is the
  // legitimate "code-missing"/"code-only" case and returns false; an actual
  // escape (resolvedPath set) re-throws. See core/path-containment.js.
  try {
    const fullPath = resolveSafePath(root, path);
    return existsSync(fullPath);
  } catch (err) {
    if (err instanceof PathContainmentError && err.reason === "outside_root" && err.resolvedPath === null) {
      return false;
    }
    throw err;
  }
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
  // Plan 260707-0812 Phase 2: drive the "open vs. terminal" branch from
  // isOpen / TERMINAL_RAW_STATUSES — the literal status equality sites were
  // removed because the persisted enum no longer carries "reported"/"active".
  //
  // Order matters: stale-view matches BEFORE generic open so the re_verify
  // recommendation wins for aged/open findings (otherwise "resolve" wins
  // for any open finding, masking the stale-view signal).
  const entry = { status: rawStatus };
  if (kind === "mechanism-shipped" && isStaleView(entry)) {
    return "re_verify";
  }
  if (kind === "mechanism-shipped" && isOpen(entry)) {
    return "resolve";
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

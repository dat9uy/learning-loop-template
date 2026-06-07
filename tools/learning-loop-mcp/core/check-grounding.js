import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, isAbsolute } from "node:path";

/**
 * SP2 Grounding Check — pure function (no subprocess).
 *
 * Pure: deterministic given (entry, codeContext) inputs, including the
 * injected `now` and `codeContext.root` for filesystem checks. No subprocess
 * execution; `test_passed` is passed in, not computed here.
 *
 * Output uses `grounding` (not `derivation`) because the parent's lock uses
 * `grounding` for the nested per-check object. SP1 uses `derivation` for the
 * same concept; the names diverge by design (different tool, different shape).
 * See plans/260602-sp1-derive-status/plan.md for the SP1 sibling.
 *
 * Change-log fast path: when `entry.entry_kind === "change-log"`, returns
 * `status: "skipped"` and `grounding: { checked_at, duration_ms }` only.
 * Applied BEFORE the `mechanism_check` check (per I-8 in the plan).
 *
 * Strict equality: `mechanism_check === true` is the opt-in condition.
 * Any other value (false, "true", 1, null, undefined) yields `skipped`.
 *
 * Top-level evidence fields: reads `entry.evidence_code_ref` (nested form was
 * removed by migration in plan 260607-dual-field-schema-unification).
 *
 * Path safety: the function does not validate path safety — callers should
 * sanitize paths. Relative paths are joined with `codeContext.root` using
 * standard path resolution (e.g., `../` traverses upward).
 *
 * Corrupt fingerprint: when the stored `code_fingerprint` does not match
 * the canonical regex, the function defensively returns `hash_match: null`
 * (per H-2 mitigation) and proceeds with drift detection.
 */

/**
 * Source-of-truth enums. Export so introspection layers (e.g. SP3's drift
 * aggregation) can derive from the same source — mirrors SP0's
 * META_STATE_FINDING_CATEGORIES and SP1's META_STATE_DERIVATION_KINDS.
 */
export const META_STATE_GROUNDING_STATUSES = [
  "grounded", "drifted", "unknown", "skipped",
];

export const META_STATE_GROUNDING_DRIFT_KINDS = [
  "hash_mismatch", "code_missing", "test_failed",
];

/** Internal: validates the canonical format of a stored code_fingerprint. */
const TERMINAL_HASH_REGEX = /^sha256:[a-f0-9]{64}$/;

/** Thrown by computeFileHash when the file is missing or unreadable. */
export class FileNotFoundError extends Error {
  constructor(path) {
    super(`File not found or unreadable: ${path}`);
    this.name = "FileNotFoundError";
    this.path = path;
  }
}

/**
 * Compute the SHA-256 of a file's raw bytes, returned as "sha256:<64hex>".
 * Throws FileNotFoundError if the file doesn't exist or can't be read.
 */
export function computeFileHash(absPath) {
  if (!existsSync(absPath)) {
    throw new FileNotFoundError(absPath);
  }
  const bytes = readFileSync(absPath);
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `sha256:${digest}`;
}

/**
 * Check the grounding of a meta-state finding entry.
 *
 * @param {Object} entry - A meta-state entry (finding or change-log)
 * @param {Object} codeContext - { root, run_tests?, test_passed?, now? }
 * @returns {Object} GroundingResult — the parent's locked shape
 */
export function checkGrounding(entry, codeContext) {
  const root = codeContext.root;
  const now = codeContext.now ?? (() => Date.now());
  const t0 = now();

  // Change-log fast path (per I-8) — applied BEFORE mechanism_check check
  if (entry.entry_kind === "change-log") {
    return {
      id: entry.id,
      raw_status: entry.status ?? "active",
      grounding: {
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "skipped",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Strict equality opt-in (per I-2)
  if (entry.mechanism_check !== true) {
    return {
      id: entry.id,
      raw_status: entry.status ?? "active",
      grounding: {
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "skipped",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Signal extraction: top-level evidence fields only (nested form removed by migration)
  const codeRef = typeof entry.evidence_code_ref === "string" ? entry.evidence_code_ref : null;

  // Unknown: opted in but no evidence to ground on
  if (codeRef === null) {
    return {
      id: entry.id,
      raw_status: entry.status ?? "unknown",
      grounding: {
        evidence_code_ref: null,
        code_ref_exists: null,
        code_ref_hash: null,
        code_fingerprint: null,
        hash_match: null,
        tests_referenced: typeof entry.evidence_test === "string",
        tests_run: false,
        test_passed: null,
        checked_at: new Date(t0).toISOString(),
        duration_ms: now() - t0,
      },
      status: "unknown",
      drift_kind: null,
      fingerprint_was_recorded: false,
    };
  }

  // Resolve path: absolute -> as-is, relative -> join with root
  const absPath = isAbsolute(codeRef) ? codeRef : join(root, codeRef);
  const codeRefExists = existsSync(absPath);

  // Compute hash if file exists (catch read race)
  let codeRefHash = null;
  let effectiveExists = codeRefExists;
  if (codeRefExists) {
    try {
      codeRefHash = computeFileHash(absPath);
    } catch {
      // File vanished between existsSync and readFileSync (race)
      effectiveExists = false;
    }
  }

  // Validate stored fingerprint against regex (per H-2)
  const storedFingerprint = typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
    ? entry.code_fingerprint
    : null;
  const hashMatch = codeRefHash !== null && storedFingerprint !== null
    ? codeRefHash === storedFingerprint
    : null;

  const testPath = typeof entry.evidence_test === "string" ? entry.evidence_test : null;
  const testPass = codeContext.test_passed ?? null;
  const testsRun = testPath !== null && codeContext.run_tests === true;

  const grounding = {
    evidence_code_ref: absPath,
    code_ref_exists: effectiveExists,
    code_ref_hash: codeRefHash,
    code_fingerprint: storedFingerprint,
    hash_match: hashMatch,
    tests_referenced: testPath !== null,
    tests_run: testsRun,
    test_passed: testPass,
    checked_at: new Date(t0).toISOString(),
    duration_ms: now() - t0,
  };

  const status = computeStatus(grounding);
  const driftKind = computeDriftKind(status, grounding);

  return {
    id: entry.id,
    raw_status: entry.status ?? "unknown",
    grounding,
    status,
    drift_kind: driftKind,
    fingerprint_was_recorded: false, // Set by tool layer when auto-record fires
  };
}

function computeStatus(grounding) {
  if (grounding.code_ref_exists === false) return "drifted";
  if (grounding.hash_match === false) return "drifted";
  if (grounding.tests_referenced && grounding.tests_run && grounding.test_passed === false) return "drifted";
  return "grounded";
}

function computeDriftKind(status, grounding) {
  if (status !== "drifted") return null;
  if (grounding.code_ref_exists === false) return "code_missing";
  if (grounding.hash_match === false) return "hash_mismatch";
  if (grounding.tests_referenced && grounding.tests_run && grounding.test_passed === false) return "test_failed";
  return null; // defensive; should not happen
}

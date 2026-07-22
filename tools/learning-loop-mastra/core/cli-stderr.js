// cli-stderr.js — Phase 2 of plans/260722-1343-write-capable-cli-w.
//
// Structured stderr for the write-capable CLI. Splits the non-usage error
// branch into two distinct shapes so the agent's recovery policy can tell
// a real rejection from a programmer/transport bug:
//
//   - Recognized rejection — the error carries a stable `code`/`name` from
//     the record-writer / R2 / path-containment / dispatch layers.
//     → exit 1 + `{error: <name>, code: <code>, reason: <message>}`.
//     Agent policy: parse, fix args, retry.
//
//   - Unrecognized error — TypeError, ReferenceError, plain Error with no
//     stable code (a programmer/transport bug).
//     → exit 1 + `{error: "InternalError", reason: <message>, internal: true}`.
//     Agent policy: do NOT retry by arg-fixing; file a bug.
//
//   - UsageError / isIdentityPinError → exit 2 (handled by the existing
//     path in bin/loop.mjs, NOT this module).
//
// Why a separate module: the binary `bin/loop.mjs` is a thin CLI shim and
// the catch path is not directly importable in tests. This module is
// pure: it takes an error, returns `{json, exitCode}` — unit-testable
// without spawning the binary.
//
// Stable-code allowlist: derived from the actual error classes the
// record-writer + path-containment + R2 + dispatch handlers throw. The
// allowlist is intentionally explicit so a future error class lands in
// one of the two shapes deterministically and the drift test (see
// cli-stderr-format.test.js) catches a new rejection reason slipping
// through as `InternalError`.

import { isIdentityPinError } from "./identity-pin.js";

// Stable `code` prefixes that the record-writer / dispatch layers throw
// as plain Error messages (the `code` is the leading token before `:`).
// The set is intentionally explicit — adding a new rejection reason
// requires extending this list so the classification stays deterministic.
const KNOWN_REJECTION_CODE_PREFIXES = [
  // record-writer rejection reasons (core/meta-state.js)
  "version_mismatch",
  "validation_failed",
  "immutable_field",
  "not_found",
  "change_log_immutable",
  "already_archived",
  "auto_emit_id_collision",
  "invalid_entry",
  "invalid_patch",
  "branch_mismatch",
  "empty_patch",
  "id_already_exists",
  // R2 denial reasons (core/r2/*, mastra/with-r2-gate.js)
  "r2_denied",
  "cross_runtime_write_denied",
  "path_fields_undefined_for_tool",
  "r2_allowlist_missing",
  "r2_allowlist_invalid",
  "r2_allowlist_invalid_json",
  "r2_allowlist_invalid_schema",
  // path-containment rejection reasons (core/path-containment.js)
  "outside_root",
  "traversal_detected",
  "hardlink_rejected",
  "realpath_failed",
  // registry lock / atomic-append
  "registry_lock_failed",
  "ledger_append_failed",
  // promote-rule guard (Phase 1)
  "pattern_matches_cli_transport",
  "pattern_rejected_by_safety_check",
];

// Stable error class names that always serialize as recognized rejections.
// The class names come from core/meta-state.js: InvalidEntryError,
// SchemaVersionSkewError, plus core/path-containment.js: PathContainmentError.
const KNOWN_REJECTION_ERROR_NAMES = new Set([
  "InvalidEntryError",
  "SchemaVersionSkewError",
  "PathContainmentError",
  "WriteNotVisibleError",
  "PostWriteVisibilityError",
]);

/**
 * Classify an error and produce the structured stderr payload + exit code.
 * Pure function — no I/O, no process.exit.
 *
 * @param {unknown} err
 * @returns {{ json: string, exitCode: 1 | 2 }} where `json` is the bytes
 *          to write to stderr (no trailing newline — the caller adds one
 *          for parity with the UsageError path) and `exitCode` is the
 *          process exit code.
 */
export function classifyCliError(err) {
  if (!err) {
    return { json: JSON.stringify({ error: "InternalError", reason: "unknown error", internal: true }), exitCode: 1 };
  }
  // UsageError + identity-pin preconditions stay on the existing exit-2 path.
  // The CLI binary emits these via the loop.mjs: <message> human-readable line,
  // not as JSON. Returning `null` here signals "this is a usage error" and
  // the caller in bin/loop.mjs takes its existing branch.
  if (err instanceof UsageError || isIdentityPinError(err)) {
    return null;
  }
  // Known rejection class names → recognized rejection.
  if (err instanceof Error && KNOWN_REJECTION_ERROR_NAMES.has(err.name)) {
    return { json: serializeRecognizedRejection(err), exitCode: 1 };
  }
  // Error message starts with a known rejection code token → recognized.
  if (err instanceof Error && typeof err.message === "string") {
    const code = leadingCodeToken(err.message);
    if (code && KNOWN_REJECTION_CODE_PREFIXES.includes(code)) {
      return { json: serializeRecognizedRejection(err, code), exitCode: 1 };
    }
  }
  // Anything else — TypeError, ReferenceError, plain Error with no stable
  // code, non-Error throws — is an InternalError (not retriable by
  // arg-fixing).
  const reason = err instanceof Error ? err.message : String(err);
  return {
    json: JSON.stringify({ error: "InternalError", reason, internal: true }),
    exitCode: 1,
  };
}

// Extract the leading code token from a rejection message. Conventions:
//   - "version_mismatch: ..."           → "version_mismatch"
//   - "r2_denied: ..."                  → "r2_denied"
//   - "Invalid meta-state entry: ..."   → null (no code prefix; rely on `name`)
//   - "Unexpected token ..."            → null (no code prefix; InternalError)
function leadingCodeToken(message) {
  if (typeof message !== "string") return null;
  const m = message.match(/^([a-z][a-z0-9_]*)\s*:/i);
  if (!m) return null;
  return m[1];
}

function serializeRecognizedRejection(err, codeFromMessage) {
  // Prefer the class name as the `error` field (stable, schema-friendly)
  // and the actual rejection reason as the `code` field (stable, agent-friendly).
  const error = err.name || "Error";
  // Class-style rejections (PathContainmentError, InvalidEntryError)
  // carry the rejection reason on `.reason` — prefer that over the
  // leading code token (which would pick up the class name for these
  // cases because the message format is "<ClassName>: <reason> ...").
  const classReason = typeof err.reason === "string" ? err.reason : null;
  // For known class rejections, `.reason` is the authoritative code;
  // for plain-Error rejections, the leading code token wins.
  const isKnownClass = KNOWN_REJECTION_ERROR_NAMES.has(err.name);
  const code =
    codeFromMessage
    || (isKnownClass ? classReason : null)
    || leadingCodeToken(err.message)
    || error;
  const reason = stripCodePrefix(err.message || String(err), code);
  return JSON.stringify({ error, code, reason });
}

function stripCodePrefix(message, code) {
  if (typeof message !== "string") return String(err ?? "");
  // Strip a leading "<code>: " so the `reason` field carries the human
  // detail without the duplicate code prefix.
  const prefix = `${code}:`;
  if (message.startsWith(prefix)) return message.slice(prefix.length).trim();
  return message;
}

// Re-export the `UsageError` class so callers (bin/loop.mjs) can throw it
// without re-defining the class. Keeps the single source of truth here.
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

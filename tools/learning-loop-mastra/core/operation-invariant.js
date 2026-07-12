// Plan 260712-0724 (Implementation 3 of assertinvariant resolution).
// Universal pre-state-only boundary helper for core-logic operations that own
// an invariant the agent depends on.
//
// **Scope:** pre-state-only check. NOT before/after — the wrapper does not see
// post-state. For identity-invariant after-the-fact guards (patch path), see
// `IMMUTABLE_PATCH_FIELDS` in core/meta-state.js:339-355 (the patch-tool has
// its own handler-side deny-list that fires BEFORE updateEntry's mutation).
//
// **Locking:** the caller is responsible for invoking `accept.context()` INSIDE
// `withRegistryLock` for mutation operations. The wrapper does NOT acquire
// locks itself; doing so from the wrapper would double-lock under nested calls
// and introduce deadlock risk (Red Team Finding 6). `metaStateBatch` calls
// `writeEntry` from inside its own lock — wrapper-acquires-lock would deadlock.
//
// **Universal scope:** per source report § The principle, narrow scopes are
// hand-wavy. The wrapper applies to every core-logic operation that owns an
// invariant the agent depends on. Curating the call-site list is hand-wavy;
// universal scope is the only honest answer.
//
// **Architecture (Red Team Finding 1 fix):** the wrapper's accept shape is
// `{context, check}` — `context()` snapshots pre-state, `check(pre)` is the
// pre-condition predicate. This shape matches what the wrapper can actually
// implement (pre-state-only). The cascade replaces 4 ad-hoc mechanisms
// (`assertWriteVisible`, `isSchemaBranchSupported`, the inbound-gate markers,
// and per-tool case-by-case `delete cleanPatch.entry_kind` defenses) with one
// primitive that fires BEFORE the mutation.

import { appendGateLog } from "#lib/gate-logging.js";

/**
 * Pre-state pre-condition failure shape. The wrapper emits this on rejection.
 *
 * @typedef {{ok: false, reason: string} & Record<string, any>} InvariantFail
 */

/**
 * Operation success shape. Always includes `ok: true` plus the operation's
 * own return value spread.
 *
 * @typedef {{ok: true} & Record<string, any>} InvariantOk
 */

/**
 * Universal pre-condition boundary helper.
 *
 * Captures pre-state via `accept.context()` (called at the call site, INSIDE
 * the lock for mutation ops), evaluates `accept.check(pre)` as a pre-condition
 * predicate. On violation: emits to `logTo` (gate-log or stderr) and returns
 * `{ok: false, reason, ...returnOnFail}`. On success: runs `operation()` and
 * returns `{ok: true, ...result}`.
 *
 * @template T
 * @param {() => Promise<T> | T} operation - the operation that owns the invariant
 * @param {object} options
 * @param {{ context: () => any | Promise<any>, check: (pre: any) => boolean | Promise<boolean> }} options.accept
 *   - `context()` is invoked at the call site (INSIDE the lock for mutation ops)
 *   - `check(pre)` is the pre-condition predicate evaluated against the captured context
 * @param {object} options.returnOnFail - structured failure shape spread into the rejection
 * @param {string} options.root - project root; required for `appendGateLog`
 * @param {"gate-log" | "stderr"} [options.logTo="gate-log"] - where to emit the violation
 * @returns {Promise<InvariantOk | InvariantFail>}
 */
export async function assertinvariant(operation, { accept, returnOnFail, root, logTo = "gate-log" }) {
  // Signature contract: `root` is required. `appendGateLog(root, ...)` throws
  // on bad root (the contract was hardened after a malformed-root artifact
  // root-cause in an earlier session). Validate upfront so a missing root
  // produces a stable failure shape instead of an uncaught TypeError mid-call.
  if (!root || typeof root !== "string") {
    return { ok: false, reason: "missing_root", reason_code: "missing_root" };
  }
  const pre = await accept.context();
  const ok = await accept.check(pre);
  if (!ok) {
    const failure = { ok: false, reason: JSON.stringify(returnOnFail), ...returnOnFail };
    if (logTo === "stderr") {
      console.warn(`assertinvariant: ${failure.reason}`);
    } else {
      appendGateLog(root, {
        tool: "assertinvariant",
        returnOnFail,
        timestamp: new Date().toISOString(),
      });
    }
    return failure;
  }
  return { ok: true, ...(await operation()) };
}

/**
 * Synchronous variant of `assertinvariant` for callers that cannot be made
 * async (e.g., `core/file-readers.js#readRuntimeObservations` is consumed by
 * the universal bash + inbound gates, which run as sync hook entry points).
 *
 * `accept.context`, `accept.check`, and `operation` MUST be synchronous. The
 * structured-failure shape and logTo behavior mirror the async variant.
 *
 * @template T
 * @param {() => T} operation
 * @param {object} options
 * @param {{ context: () => any, check: (pre: any) => boolean }} options.accept
 * @param {object} options.returnOnFail
 * @param {string} options.root
 * @param {"gate-log" | "stderr"} [options.logTo="gate-log"]
 * @returns {{ok: true} & T | {ok: false, reason: string} & Record<string, any>}
 */
export function assertinvariantSync(operation, { accept, returnOnFail, root, logTo = "gate-log" }) {
  if (!root || typeof root !== "string") {
    return { ok: false, reason: "missing_root", reason_code: "missing_root" };
  }
  const pre = accept.context();
  const ok = accept.check(pre);
  if (!ok) {
    const failure = { ok: false, reason: JSON.stringify(returnOnFail), ...returnOnFail };
    if (logTo === "stderr") {
      console.warn(`assertinvariant: ${failure.reason}`);
    } else {
      appendGateLog(root, {
        tool: "assertinvariant",
        returnOnFail,
        timestamp: new Date().toISOString(),
      });
    }
    return failure;
  }
  return { ok: true, ...operation() };
}

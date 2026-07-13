---
phase: 1
title: "Phase 1: RED→GREEN wrapper primitive (pre-state-only accept) + keep IMMUTABLE_PATCH_FIELDS on patch-tool path"
status: done
effort: ""
---

# Phase 1: Phase 1: RED→GREEN wrapper primitive + writeEntry wrap + add cross-process race fix

## Overview

Create `core/operation-invariant.js` exporting `assertinvariant(operation, {accept, returnOnFail, root, logTo})` as a **pre-state-only** boundary helper (not before/after — see Red Team Finding 1: the architecture cannot do before/after comparison because post-state is not reachable from the predicate). Wrap `writeEntry`, `updateEntry`, `archiveEntry`, `deleteEntry`, and `metaStateBatch`. **Keep `IMMUTABLE_PATCH_FIELDS` on `meta-state-patch-tool.js`** (the patch-tool has its own handler-side deny-list that fires before `updateEntry`'s mutation; the wrapper is a different layer). **Keep `case "write"` envelope reject** (Red Team Finding 5: removing it re-opens the forge vector closed by Implementation 2). Wrapper snapshot is taken INSIDE `withRegistryLock` to close the cross-process race (Red Team Finding 6).

## Implementation Steps

1. **RED tests first** — write `tools/learning-loop-mastra/core/operation-invariant.test.js` (golden fixture per Q2, Rec 10 template). Fixtures cover the 4 pre-condition shapes that the wrapper can express: (a) caller-supplied envelope on change-log write (forge-vector surface), (b) change-log `entry_kind` flip attempt via patch (identity surface), (c) delete of a change-log entry (immutability surface), (d) missing `root` arg (signature surface). Each fixture asserts the wrapper's exact `{ok:false, reason, ...returnOnFail}` failure shape. RED: assert each fixture passes after `assertinvariant` is called — initially fails because the wrapper doesn't exist.
2. **GREEN minimum** — write `tools/learning-loop-mastra/core/operation-invariant.js`. The wrapper:
   - Captures pre-state via `accept.context()` (called INSIDE the lock at the call site; see Finding 6 fix)
   - Calls `accept.check(context)` — pre-condition predicate
   - On violation: emits to `logTo` (stderr or gate-log) and returns `{ok:false, reason, ...returnOnFail}`
   - On success: runs `operation()` and returns `{ok:true, ...result}`
   - **Requires `root` as a top-level option** (Red Team Finding 10: `appendGateLog(root, ...)` contract requires root first; missing root = runtime TypeError or wrong-root writes)
3. **Wire into `core/meta-state.js#writeEntry`** (line 626) — wrapper around the schema-validation + write. The `accept.context()` returns the entry being written; `accept.check(entry)` enforces `(entry.entry_kind !== "change-log" || entry.operation_envelope === undefined)` (this is the **forge-vector guard** that the `case "write"` reject at line 840-844 was duplicating; the wrapper at writeEntry is the canonical surface). Red Team Finding 4: `writeEntry` was missing from the wrap list; this step adds it.
4. **Wire into `core/meta-state.js#updateEntry`** (line 660) — wrapper around the existing mutation. `accept.context()` is the lock-protected entry lookup (`entries.find(e => e.id === id)`); `accept.check(entry)` enforces identity pre-conditions (`entry.entry_kind === expected_entry_kind` if patch is intent-specific, else pre-condition is the existing `delete cleanPatch.entry_kind` defense). **Keep the `delete cleanPatch.entry_kind` line** (line 710) — it's the defense-in-depth guard for the patch-tool path; the wrapper is additive, not replacement.
5. **Wire into `core/meta-state.js#archiveEntry`** (line 730) — `accept.context()` is the lock-protected entry lookup; `accept.check(entry)` enforces `entry.status !== "archived"` (the already-archived early-return at line 736-738 is moved INTO the wrapper).
6. **Wire into `core/meta-state.js#deleteEntry`** (line 759) — `accept.context()` is the lock-protected entry lookup; `accept.check(entry)` enforces `entry.entry_kind !== "change-log"` (change-logs are immutable audit log; deletion is forbidden — closes Red Team Finding 3's gap on `case "delete"` having no pre-state).
7. **Wire into `core/meta-state.js#metaStateBatch`** (line 798) — wrap each op type with a type-specific `accept.check`. The wrapper's pre-state is read INSIDE the lock, after `entries = readRegistry(root)` and BEFORE the op switch (line 818). For `case "write"`, `accept.check(op.entry)` enforces the envelope-reject pre-condition (this is now redundant with the wrapper at writeEntry — **remove `case "write"` envelope reject at line 840-844** because writeEntry is the canonical surface; see Finding 5 fix). For `case "update"|"archive"|"delete"`, `accept.check(entries[idx])` enforces type-specific pre-conditions (e.g., delete forbids change-log; update enforces entry_kind immutability via the patch-field check that the existing `IMMUTABLE_PATCH_FIELDS` deny-list enforces).
8. **KEEP `IMMUTABLE_PATCH_FIELDS` deny-list** at `core/meta-state.js:339-355` — Red Team Finding 2: the patch-tool handler (`meta-state-patch-tool.js:7,14,74-91`) has its OWN handler-side deny-list that fires BEFORE `updateEntry` is invoked. Removing the deny-list leaves the patch path unguarded. The wrapper is a different layer (core mutation boundaries); the deny-list is the after-the-fact guard on the patch path. **Both are needed.**
9. **Remove `case "write"` envelope reject** at `core/meta-state.js:840-844` (Red Team Finding 5 fix) — superseded by the wrapper at `writeEntry` (Phase 1 step 3), which IS the canonical forge-vector guard. The deny-list at `IMMUTABLE_PATCH_FIELDS` stays; the in-op check is removed because writeEntry's wrapper catches the case before the entry lands.
10. **DO NOT add `assertinvariant` to `meta-state-log-change-tool.js`** — Red Team Finding 13: the handler already has 3 overlapping guards (Zod `.strict()` at line 36, schema validation at line 76, `assertWriteVisible` at line 82-99). Adding a 4th wrapper creates 4 overlapping failure shapes; the existing catch block only handles `WriteNotVisibleError`, silently masking the wrapper's `{ok:false}` return. The wrapper at writeEntry (Phase 1 step 3) is the canonical surface.
11. **Cross-process race fix** — for every wrapper call site, `accept.context()` MUST be invoked INSIDE `withRegistryLock`. The wrapper itself does not acquire the lock; the caller is responsible. The plan's Phase 1 step 2 documents this contract: "accept.context() is called at the call site INSIDE the lock; the wrapper does not acquire locks."

## Architecture

```js
// tools/learning-loop-mastra/core/operation-invariant.js
import { appendGateLog } from "#lib/gate-logging.js";

/**
 * Universal pre-condition boundary helper for core-logic operations that
 * own an invariant the agent depends on.
 *
 * **Scope:** pre-state-only check. NOT before/after — the wrapper does not
 * see post-state. For identity-invariant after-the-fact guards, see
 * `IMMUTABLE_PATCH_FIELDS` (patch-tool path) or the per-op deny-lists.
 *
 * **Locking:** the caller is responsible for invoking `accept.context()`
 * INSIDE `withRegistryLock`. The wrapper does not acquire locks itself;
 * doing so from the wrapper would double-lock under nested calls and
 * introduce deadlock risk (Red Team Finding 6: cross-process race).
 *
 * Per source report § The principle: every core-logic operation that owns
 * an invariant the agent depends on wraps with assertinvariant. Curating
 * the call-site list is hand-wavy; the universal scope is the only honest
 * answer.
 *
 * @template T - the operation's return type
 * @param {() => Promise<T> | T} operation - the operation that owns the invariant
 * @param {object} context
 * @param {{ context: () => any | Promise<any>, check: (pre: any) => boolean | Promise<boolean> }} context.accept
 *   - `context()` is invoked at the call site (INSIDE the lock for mutation ops)
 *   - `check(pre)` is the pre-condition predicate evaluated against the captured context
 * @param {object} context.returnOnFail - structured failure shape
 * @param {string} context.root - project root; required for `appendGateLog`
 * @param {"gate-log" | "stderr"} [context.logTo="gate-log"] - where to emit the violation
 * @returns {Promise<{ok: true} & T | {ok: false, reason: string} & typeof context.returnOnFail>}
 */
export async function assertinvariant(operation, { accept, returnOnFail, root, logTo = "gate-log" }) {
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
```

The wrapper's `accept` is a `{context, check}` pair: `context()` snapshots pre-state (called at the call site INSIDE the lock); `check(pre)` is the pre-condition predicate. This shape matches what the wrapper can actually implement (Red Team Finding 1 fix): pre-state-only, not before/after.

## Why Direction B (pre-state-only)

The original plan claimed the wrapper does "before/after identity comparison." Red Team Finding 1 proved this is architecturally impossible because the predicate signature `(pre) => boolean` cannot receive post-state. Direction B (this plan) is the honest framing:

- **Wrapper**: pre-state pre-condition gate. Catches "this op is being attempted on an entry that violates pre-conditions (forge vector, immutability, missing pre-state)." Runs BEFORE the mutation.
- **`IMMUTABLE_PATCH_FIELDS` deny-list**: after-the-fact guard on the patch-tool path. Catches "this patch tried to write a protected field name." Runs BEFORE the patch's `Object.assign`.
- **`case "write"` envelope reject (removed)**: was redundant with the wrapper at writeEntry; the wrapper is the canonical surface.

The cascade reduces 4 ad-hoc mechanisms (`assertWriteVisible`, `isSchemaBranchSupported`, `withRegistryLock`, inbound-gate markers) + 1 deny-list to 2 layers: wrapper (pre-condition) + deny-list (after-the-fact). Not 1 layer, but honest about what each does.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/operation-invariant.js` (the wrapper primitive, ~80 lines)
- Create: `tools/learning-loop-mastra/core/operation-invariant.test.js` (golden fixture, Rec 10 template, ~500 lines)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:626` (wrap `writeEntry`)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:660` (wrap `updateEntry`)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:730` (wrap `archiveEntry`)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:759` (wrap `deleteEntry`)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:798` (wrap `metaStateBatch` op loop)
- Modify: `tools/learning-loop-mastra/core/meta-state.js:840-844` (remove `case "write"` envelope reject)
- KEEP: `tools/learning-loop-mastra/core/meta-state.js:339-355` (IMMUTABLE_PATCH_FIELDS deny-list)
- KEEP: `tools/learning-loop-mastra/core/meta-state.js:710` (`delete cleanPatch.entry_kind` defense-in-depth)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` (assertions on `case "write"` envelope reject change to wrapper assertions)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js` (test passes as-is; deny-list is unchanged)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js` (test passes as-is; deny-list still includes `operation_envelope`)

## Success Criteria

- [ ] `core/operation-invariant.js` exports `assertinvariant(operation, {accept: {context, check}, returnOnFail, root, logTo})` with documented signature
- [ ] 4 RED→GREEN fixtures: caller-supplied envelope on change-log write (forge vector), change-log `entry_kind` flip via patch (identity), delete of change-log (immutability), missing root arg (signature)
- [ ] All 4 fixtures pass after wiring
- [ ] `writeEntry`, `updateEntry`, `archiveEntry`, `deleteEntry`, `metaStateBatch` all wrapped with `assertinvariant`
- [ ] `accept.context()` is invoked INSIDE `withRegistryLock` at every call site (cross-process race fix)
- [ ] `appendGateLog(root, ...)` always passes `root` first
- [ ] `case "write"` envelope reject removed (line 840-844)
- [ ] `IMMUTABLE_PATCH_FIELDS` deny-list KEPT unchanged
- [ ] `delete cleanPatch.entry_kind` defense KEPT unchanged
- [ ] `meta-state-log-change-tool.js` NOT wrapped (3 existing guards sufficient)
- [ ] Pre-existing 4 test files still pass: `meta-state-patch-immutable-fields.test.js`, `change-log-operation-envelope.test.js`, `meta-state-batch-tool.test.js`, `meta-state-patch-entry-kind-invariant.test.js`
- [ ] Two change-logs filed: code fix + IMMUTABLE_PATCH_FIELDS clarification
- [ ] `pnpm test` passes with no regressions across all 9 namespaces

## Risk Assessment

- **Risk:** Removing `case "write"` envelope reject at meta-state.js:840-844 re-opens the forge vector if the wrapper at writeEntry is bypassed (e.g., direct call to `metaStateBatch` from a future code path that doesn't go through writeEntry). **Mitigation:** the wrapper at writeEntry is the canonical surface; `metaStateBatch.case "write"` calls `writeEntry` internally (after the schema validation pass), so the wrapper fires. The deny-list still catches `metaStateBatch.case "update"` patches that try to set `operation_envelope`. **Redundant defense, not removed defense.**
- **Risk:** Wrapper adds ~1ms latency per call (context snapshot + predicate + optional gate-log write). **Mitigation:** snapshot is in-memory (no I/O); predicate is a single boolean check; gate-log write is async (fire-and-forget). Acceptable cost.
- **Risk:** Test-file blast radius underestimated. **Mitigation:** per Red Team Finding 12, 4 test files reference `IMMUTABLE_PATCH_FIELDS`; plan keeps the deny-list, so all 4 tests pass unchanged. The only test that needs update is `meta-state-batch-tool.test.js` (the `case "write"` envelope-reject assertions become wrapper assertions).
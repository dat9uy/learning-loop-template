# Debug Report — PR#77 runtime-state.jsonl prune flaw

## What PR#77 was trying to do
Stop the inbound gate's recurring **"27 stale active observations"** warning
(vnstock 15, meta-state-tools 12) that kept firing after the runtime-state plan
completed. Two compounding defects were identified:

1. The per-surface **pause-skip** lived only in `core/inbound-state.js` (the
   **bash** gate's staleness path), but the warning is emitted by the
   **UserPromptSubmit** hook → `evaluateInboundGate` → `loadStaleActiveObservations`,
   which had no pause awareness. Pausing a surface never suppressed the warning
   on the path that produces it.
2. `runtime-state.jsonl` held 33 active rows, all older than the 30-min
   staleness threshold, pinning the gate's count at 27.

## What PR#77 got right (keep)
**Fix #1 — `evaluate-inbound-gate.js` pause-skip.** Adding `isSurfacePaused` to
`loadStaleActiveObservations` (with corrupt-sidecar degrade-to-not-paused) is a
correct, well-tested fix of a real gap. The two new tests drive the actual
emitter path. **This should be kept.**

## What is flawed (the prune)
**Fix #2 — deleting all 33 rows from `runtime-state.jsonl` to zero the count.**
Wrong for four independent reasons:

1. **It destroys an append-only audit ledger.** `readRuntimeStateRows` is
   documented as *"the RAW sidecar (every row) — historical and read-by-everyone
   invariant."* The 33 rows are permanent history, not pending observations:
   - 20 vnstock device-slot experiment ledger events (May 2026), each with
     `operator_cleared_after` flags + rich notes — the experiment history backing
     the vnstock budget rule.
   - 12 `delivery-*` rows — **the observable delivery audit trail for resolved
     finding `meta-260719T2120Z-sessionstart-steering-injection-…`**, whose own
     resolution text cites these rows as the verification artifact
     (*"Delivery is now observable: … writes delivery-<sessionId> ledger rows …
     to runtime-state.jsonl, queryable via runtime_state_read"*).
   - 1 `dispatch-` idempotency marker + re-pin rows.

2. **It is redundant with fix #1.** If the pause-skip works, pausing the
   surfaces suppresses their stale rows *without destroying history*. The PR
   built the mechanism, then bypassed it by deleting the data it would have
   suppressed. The pause-skip fix becomes dead code on the real repo.

3. **It broke CI (3 failures).** The repo's integration tests read the *real*
   `runtime-state.jsonl` and assert it has rows:
   - `gate-integration.test.cjs` (2 tests): copies the real sidecar to drive
     "real observations" assertions (`real stale obs + state-change → marker
     written`, `inbound_gate flag true with real obs`) — fail with empty sidecar.
   - `runtime-state-metadata-validation.test.js`: `assert.ok(rows.length > 0,
     "expected stored rows when sidecar exists")` — fails with empty sidecar.
   The author ran only 8 focused suites (synthetic fixtures), not the full
   suite that exercises the real sidecar.

4. **The rebase issue.** PR branch is `BEHIND` main (based at `77e9d15`,
   missing #78's commits: L2 transport, CLI tools, drift tests, trigger-workflow
   coverage). Independent of the prune logic, the PR must rebase.

## Deeper root cause
The gate's staleness scan treats **every** `status: "active"` row as a pending
observation that must be refreshed within 30 min (`STALENESS_THRESHOLD_MS`).
But `runtime-state-record-tool.js:100` **hardcodes `status: "active"`** for
every ledger event — there is **no terminal status** for runtime-state rows.
So permanent ledger history is eternally "stale." The gate conflates *ledger
history* with *pending live observations to reconcile*.

Compounding: pause is a **write-blocker** too, not just a read-skip. Pausing
`meta-state-tools` makes `meta_state_dispatch_finding` refuse (issue dispatch
halts) — so pause is the wrong lever for the delivery rows. (`delivery-classify.mjs`
itself bypasses pause, writing via `appendLedgerEvent` directly, so pause
wouldn't even stop new delivery rows — only the gate read would skip them.)

## Correction options (decision pending)
- **A. Minimal**: keep fix #1, revert prune, rebase, pause `vnstock` only.
  Honest but does NOT fully clear the warning (meta-state-tools delivery rows +
  runtime-state re-pin remain as stale `unmapped-active-entry`).
- **B. Status lifecycle**: add a close/resolve op that flips runtime-state rows
  `active → closed`; gate already skips non-active. Preserves ledger, clears
  warning, gives a real "done" lever. New tool + schema field (larger scope).
- **C. Gate-level exemption**: `loadStaleActiveObservations` skips audit/cleared
  rows (delivery-/dispatch- ids, `operator_cleared_after===true`). No new tool,
  preserves ledger, clears warning. Risk: row-type heuristic in the gate.

## Evidence
- PR state: OPEN, mergeStateStatus BEHIND, CI `test` FAILED (run 29935469595).
- `git show main:runtime-state.jsonl | wc -l` = 33; PR branch = 0 (deletion not
  yet on main).
- Failed tests: `gate-integration.test.cjs` (2), `runtime-state-metadata-
  validation.test.js` (1) — all read the real sidecar.
- `core/runtime-state.js:144` pruneSurfaceRows comment: *"history is NOT
  preserved for the pruned rows (this is the point — the operator is deleting
  noise)"* — but these rows are not noise, they are audit history.
- Finding `meta-260719T2120Z-…` status = `resolved` (2026-07-21); its delivery
  rows are the remediation's verification artifact.
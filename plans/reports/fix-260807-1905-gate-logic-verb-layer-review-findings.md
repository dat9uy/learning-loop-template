# Fix report: gate-logic verb-layer review findings (2026-08-07)

Scope: all items from the code review of plan 260807-1633 (uncommitted state).
Pre-fix baseline: 7 failing tests (6 in gate-logic-inert-sink, 1 regression in
gate-logic-echo-prose-pipe-target) + 2 in evaluate-bash-gate; commit blocked.

## Fixes

1. **Quote-stripping bug (regression).** `applyInertSinkBlanking`'s rebuild
   dropped quote characters from every token, so quoted pipes (`echo "$(a |
   b)"`) became real pipes for `splitSegments` and patterns split across
   segments → violations returned `ok`. Fix: keep quote chars in the token
   buffer; the rebuild is now shape-preserving.
2. **`&&`/`||` segment desync (no-bypass hole).** The blanking walker did not
   advance its segment counter on two-char logical ops while
   `classifyPolicyTokens` splits on them, so an executed segment after `&&`
   inherited an echo segment's blankability and its quoted args were erased
   (`echo "x" && pnpm run "BANNED"` → hidden). Fix: advance on `&&`/`||`.
3. **Chain-wide inert/redirect withhold (no-bypass hole).** Blanking only
   checked the echo segment's redirect and the chain END verb; `echo x | cat
   > f` and `echo x | tee f | tail` persisted prose while blanked. Fix:
   blank only when EVERY downstream chain segment is an inert sink and no
   chain segment has a redirect.
4. **Gate-verb observation path did not exist.** `AFFECTED_SYSTEM_TO_CONSTRAINTS`
   had no mapping that could emit a `gate-verb:<verb>` observation, so the
   observation-gated design ("block without, ok with") was unreachable
   end-to-end — the friction behind the filed observation-friction finding.
   Fix: identity mapping derived from the `gate-verbs` config in
   patterns.json (match path and observation path share one source).
   Operator unlock: `runtime_state_record({affected_system: "gate-verb:bash",
   kind: "budget-state", ...})` (projection is budget-state-only).
5. **`node <script>.js` inert sink.** Chain-end `node x.js` (no eval flags)
   now counts as inert — the original Finding-1 hook shape
   (`printf ... | node core/bash-gate.js`). Eval flags stay gate-verbed.
6. **Test file repair.** `gate-logic-inert-sink.test.js` referenced undefined
   `EXEC`/`EXEC_C` (4 tests crashed with ReferenceError) — defined.
7. **Dead code.** Removed unused `pipeChainEnd()`; fixed impossible
   `"&>>"` two-char comparison in both walkers (`&>>` now a 3-char op).

## Tests added

- inert-sink group F: `&&`/`||` boundary fidelity, mid-chain `tee` withhold.
- evaluate-bash-gate: end-to-end gate-verb observation pair (block without,
  ok with recorded observation) — covers the gap that let item 4 slip.

## Verification (fresh evidence)

- Pre-fix probes re-run: all four failing shapes now behave per spec.
- `pnpm test` (full commit gate): 310 files, **3089 passed / 0 failed**,
  exit 0 (was 2 failing files / 8 failing tests across runs pre-fix).

## Notes

- Phase 5 deferral (strip helpers retained) unchanged — out of scope.
- Public contracts unchanged: `applyInertSinkBlanking` /
  `classifyPolicyTokens` signatures intact; policy view gains no new fields.

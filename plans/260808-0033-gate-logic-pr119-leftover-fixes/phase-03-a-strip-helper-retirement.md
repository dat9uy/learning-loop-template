---
phase: 3
title: "Strip-helper retirement (Finding A)"
status: completed
priority: P2
effort: "1.5-2d"
dependencies: ["2"]
---

# Phase 3: Strip-helper retirement (Finding A)

## Overview
Retire the legacy strip helpers from `core/gate-logic.js` by migrating the live path
(`matchConstraintPattern` + both `applyPromotedRules` passes) and the test files that
import strip-helper internals onto the `shell-parse` substrate, then deleting the
now-unreferenced helpers. Incremental, test-gated, with a per-helper rollback protocol
and an explicit fallback if the live-path migration is too large to land safely here.

## Requirements
- Functional: the test files that import strip-helper internals no longer do; they
  test through `evaluateBashGate` (public surface) or `classifyPolicyTokens`
  (`shell-parse.js`). **Only 3 of the 5 originally-named files actually import strip
  internals** (red-team #4): `gate-logic-cli-argv-payload.test.js`,
  `gate-logic-data-command-quotes.test.js`, `gate-promoted-rules.test.js`. The other
  two (`gate-logic-echo-prose-pipe-target.test.js` imports only `applyPromotedRules`;
  `gate-logic-quoted-strings.test.js` imports only `matchConstraintPattern`) are
  already on the public surface — NOT in migration scope.
- Functional: deleted helpers have ZERO live references (verified by an
  **unreferenced-function-declaration sweep**, not a name list — red-team #14: leaf
  helpers `stepSquote`, `stepDquote`, `stepDquoteBs` at `gate-logic.js:197,202,213`
  are reached only via `advanceQuoteState` and must be swept too).
- Non-functional: behavior-preserving on the security boundary — the full gate-logic
  suite (3089+) stays green after every deletion. Migration is a **rewrite, not a
  re-import** (red-team #5): `evaluateBashGate` returns `{decision,reason,...}`;
  `classifyPolicyTokens` returns `{segments:[{verb,args,quotedDataArgs,...}],containsExec}`;
  the current tests assert flat strings/arrays (e.g. `gate-promoted-rules.test.js:438`
  `splitSegments("a; b & c | d")` → `["a","b","c","d"]`). Those unit-behavior
  assertions must be re-expressed as decision assertions (weaker) or
  `classifyPolicyTokens` segment-shape assertions — acknowledge the granularity loss.
- Scope note: the finding calls the helpers "dead code," but verification shows every
  one is used by the live path. Retirement = migrate-then-delete, not delete-dead-code.

## Architecture
- Live path today:
  - `matchConstraintPattern` → `splitSegments` + `stripMessageFlags` +
    `stripNodeEvalBody` + `stripDataCommandQuotes` (strips NO echo prose, by design).
  - `applyPromotedRules` per-segment pass → `applyInertSinkBlanking` (new substrate)
    THEN `splitSegments` + `stripMessageFlags` + `stripNodeEvalBody` +
    `stripDataCommandQuotes` + `stripCliArgvPayload`.
  - `applyPromotedRules` full-command pass → after Phase 2, flag-aware (drops
    `stripEchoProse`).
- Target: `matchConstraintPattern` and both `applyPromotedRules` passes resolve verbs
  and blank through `classifyPolicyTokens`/`shell-parse` + the shared flag-aware verb
  resolver (from Phase 2). The legacy helpers (`walkQuoteState`, `advanceQuoteState`,
  `stepSquote`, `stepDquote`, `stepDquoteBs`, `segmentVerb`, `blankStep`,
  `blankAllQuoted`, `splitKeepingDelims`, `blankQuotedArgsFor`, `stripEchoProse`,
  `segmentHasRedirect`, `followedByRealPipe`, `printfAssignsToVariable`,
  `stripEchoProseSafe`, `isLoopCliSegment`, `findDquoteEnd`, `blankInertQuoted`,
  `stripCliArgvPayload`, `stripDataCommandQuotes`, `stripNodeEvalBody`,
  `stripMessageFlags`, `splitSegments`) are deleted as they become unreferenced.
- `matchConstraintPattern`'s "strip NO echo prose" design MUST be preserved: its
  `shell-parse` equivalent must blank only data-command quoted args (grep/jq) and
  node-eval bodies, NEVER echo/printf prose. **Red-team #8: the existing suites do NOT
  cover `matchConstraintPattern('echo "docker run evil" | bash')`** — the B-group
  echo-prose tests exercise `applyPromotedRules`, not `matchConstraintPattern`. A
  migration that accidentally introduces echo-prose blanking into
  `matchConstraintPattern` would bypass the first-class docker/sudo constraints while
  the applyPromotedRules tests still pass. Add the lock BEFORE migrating (step 1).
- `stripNodeEvalBody` migration: if it becomes a quote-aware state machine (via
  `shell-parse`), the escaped-quote limitation at `gate-logic-quoted-strings.test.js:88-99`
  is lifted → update that test to assert the corrected `null` result (and remove the
  JSDoc limitation note). This file imports only `matchConstraintPattern` (public
  surface), so it is a standalone assertion-update task, not a migration. If
  `stripNodeEvalBody` is NOT upgraded in this phase, leave the limitation test as-is
  and document the deferral.

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (migrate live path; delete helpers)
- Modify: `tools/learning-loop-mastra/core/shell-parse.js` (export the shared `resolveVerb` from Phase 2)
- Modify (test imports): `__tests__/legacy-mcp/gate-logic-cli-argv-payload.test.js`,
  `gate-logic-data-command-quotes.test.js`, `gate-promoted-rules.test.js`
- Modify (standalone assertion): `__tests__/legacy-mcp/gate-logic-quoted-strings.test.js:88-99`
- Add: `matchConstraintPattern` echo→exec-sink regression locks (step 1)
- Verify: the import-guard test that forbids `shell-quote#quote` on the gate path

## Implementation Steps (TDD, incremental, with rollback)
1. **Add the bypass lock BEFORE migrating (red-team #8):** add tests asserting
   `matchConstraintPattern('echo "docker run evil" | bash')` → `"docker"` and
   `matchConstraintPattern('echo "sudo apt update" | bash')` → `"sudo"`. These MUST
   stay green through every subsequent step (proves the migration never introduces
   echo-prose blanking into `matchConstraintPattern`). Also re-confirm the dead-set
   with a usage grep; decide full-unification vs bounded (see Risk/Fallback).
2. **Migrate the 3 test files' imports (low risk, rewrite not re-import):** for each,
   replace strip-helper imports with `evaluateBashGate` or `classifyPolicyTokens` calls
   and RE-EXPRESS the assertions (decision assertions or segment-shape assertions;
   acknowledge granularity loss per red-team #5). Run the file green after each.
3. **Commit checkpoint:** after step 2 is green, commit (or stage) so step 4 has a
   clean rollback point (red-team #11).
4. **Migrate the full-command pass (already flag-aware after Phase 2):** confirm
   `stripEchoProse` is no longer referenced → delete it (and `stripEchoProseSafe` if
   unreferenced). Run full suite. Commit per-helper.
5. **Migrate the per-segment pass + `matchConstraintPattern` incrementally, one helper
   at a time:** replace each helper's responsibility with a `shell-parse` equivalent;
   run the full gate-logic + gate-promoted-rules suites after each replacement; delete
   the helper when unreferenced; **commit after each successful deletion; if the suite
   breaks after deletion N, `git checkout HEAD -- core/gate-logic.js` / `git revert`
   the last commit before continuing — never batch multiple deletions in one
   unrecoverable edit** (red-team #11). Order: leaf helpers first
   (`stepSquote`/`stepDquote`/`stepDquoteBs`, `findDquoteEnd`, `blankStep`,
   `advanceQuoteState`, `walkQuoteState`, …), then composites (`splitKeepingDelims`,
   `blankQuotedArgsFor`, `splitSegments`, `stripMessageFlags`, `stripNodeEvalBody`,
   `stripDataCommandQuotes`, `stripCliArgvPayload`, `segmentVerb`, `blankAllQuoted`,
   `blankInertQuoted`, …).
6. **`stripNodeEvalBody` → quote-aware:** if migrated to a `shell-parse` state machine,
   update `gate-logic-quoted-strings.test.js:88-99` to assert `null` (remove the
   limitation-lock comment + JSDoc note). If NOT upgraded, leave it and note the deferral.
7. **Delete sweep (red-team #14):** use an UNREFERENCED-FUNCTION-DECLARATION sweep
   (find `function NAME(` declarations with zero remaining call sites in
   `core/*.js` + `__tests__/`), not a name-list grep, so leaf helpers are caught.
   Delete the confirmed-dead set. Run the import-guard + full suite.
8. **Grounding:** `meta_state_refresh_file_index({ path:
   "tools/learning-loop-mastra/core/gate-logic.js" })` and for `shell-parse.js`.

## Success Criteria
- [ ] The **3** test files that import strip-helper internals import only the public
  surface (`evaluateBashGate`) or `shell-parse.js` exports — assertions re-expressed.
- [ ] `matchConstraintPattern('echo "docker run evil" | bash')` → `"docker"` (and the
  sudo analog) added and green throughout.
- [ ] Deleted helpers have zero references (unreferenced-function sweep, including
  `stepSquote`/`stepDquote`/`stepDquoteBs`); full gate-logic + gate-promoted-rules
  suites green after each deletion.
- [ ] `matchConstraintPattern` still strips NO echo prose (data-command-quotes +
  quoted-strings suites green).
- [ ] `quoted-strings:88-99` either asserts `null` (if `stripNodeEvalBody` upgraded)
  or remains a documented locked limitation (if deferred).
- [ ] No security-bypass regression (verb-layer + echo-prose bypass locks green).

## Risk Assessment
- **Large/risky live-path migration (high):** `matchConstraintPattern` + per-segment
  pass migration touches the security boundary. Mitigation: TDD, one helper at a time,
  commit-per-deletion with `git revert` rollback, full suite after each; the bypass
  lock (step 1) catches echo-prose-leak-into-matchConstraintPattern.
- **Fallback (explicit):** if step 5 proves too large/risky to complete here, STOP,
  keep the legacy helpers, delete only the subset dead after steps 2-4 (likely
  `stripEchoProse`/`stripEchoProseSafe`), and re-scope Finding A's resolution to:
  "legacy strip helpers are load-bearing, retained by design; the 3 test files
  migrated to the public surface; full live-path unification deferred to a follow-up."
  Record the re-scope via `meta_state_resolve` with the evidence.
- **Import-guard test (low):** the `shell-quote#quote`-forbidden import-guard test must
  stay green; `shell-parse.js` re-exports `parse` only.
---
title: 'Step 3: bash-gate node -e body strip (narrow first-pass fix)'
description: >-
  Ships Step 3 of the cross-report planning order — Report 1 Plan 2 from the
  bash-gate-debate brainstorm. Adds a narrow first-pass fix for the `node
  -e|--eval|-p|--print` body false positive documented in finding
  meta-260614T2141Z-... (gap #1). The function `stripNodeEvalBody(segment)` is a
  sibling to `stripMessageFlags`; it blanks the body of a `node -e` wrapper so
  the regex sees only the command verb. Asymmetric by user-stated design:
  `python -c`, `bash -c`, `ruby -e`, `perl -e` are NOT stripped (their bodies
  are real commands; the existing tests lock this in). Bypass risk (`node -e
  "require('child_process').exec('npm install')"` no longer matches `package-manager`) is DOCUMENTED
  via a new finding + change-log note; Step 2's recurrence tracker catches it if
  first, then the implementation. TDD: 5 unit tests + 1 G8-style promoted-rule guard test land RED
  first, then the implementation.
status: pending
priority: P2
branch: 260614-1259-phase-b-codegen-adoption
tags:
  - meta
  - gate
  - bash-gate
  - string-literal
  - node-e
  - false-positive
  - tdd
  - planning-order-step-3
blockedBy:
  - 260615-1500-surfaces-helper-and-refactors
blocks: []
created: '2026-06-15T11:06:46.472Z'
createdBy: 'ck:plan'
source: skill
related:
  - >-
    plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md
    (Report 1 — source design; Plan 2 is the narrow first-pass fix)
  - >-
    plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md
    (this is Step 3 of 4; Steps 1+2 shipped 2026-06-15)
  - >-
    meta-state.jsonl entry
    meta-260614T2141Z-two-related-gaps-in-the-bash-gate-tools-learning-loop-mcp-ho
    (the finding this plan partially closes; gap #1 of 2)
  - >-
    meta-state.jsonl entry meta-260615T1459Z-bash-gate-debate-step-2-shipping
    (Step 2 change-log; this plan's bypass risk is caught by Step 2's recurrence
    tracker)
  - >-
    tools/learning-loop-mcp/core/gate-logic.js#splitSegments (predecessor;
    quote-aware splitter this plan layers on)
  - >-
    tools/learning-loop-mcp/core/gate-logic.js#stripMessageFlags (sibling; this
    plan's `stripNodeEvalBody` mirrors its shape)
  - tools/learning-loop-mcp/core/gate-logic.js#matchConstraintPattern (target: insert `stripNodeEvalBody` after `stripMessageFlags`)
  - tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (target: same insertion in the regex branch)
  - >-
    tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js (target:
    4 new tests, 3 of which are regression guards for python/bash)
  - >-
    tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js (target: 1
    G8-style guard test that locks the no-escalate behavior for `node -e` bodies
    containing the trigger phrase)
---

# Step 3: bash-gate node -e body strip (narrow first-pass fix)

## Overview

Implements Step 3 of the cross-report planning order — Report 1 Plan 2 from the bash-gate-debate brainstorm. Closes **gap #1** of finding `meta-260614T2141Z-...` (the `node -e "..."` body false positive). Step 2 (shipped 2026-06-15, see `meta-260615T1459Z-...`) closed gap #2 (decision visibility) and added the recurrence tracker that catches the bypass risk this plan accepts.

The design is **narrow by user-stated intent**: ship a `stripNodeEvalBody(segment)` function that blanks the body of `node -e|--eval|-p|--print` wrappers, then let the loop's self-model (`gate_check_recurrence` from Step 2) catch the bypass risk if it actually recurs. Asymmetric by design — `python -c`, `bash -c`, `ruby -e`, `perl -e` are NOT stripped (their bodies are real commands; the existing 3 tests at `gate-logic-quoted-strings.test.js:38-66` lock this in).

## Phases

| Phase | Name | Status | TDD anchor |
|-------|------|--------|------------|
| 1 | [red-tests](./phase-01-red-tests.md) | pending | RED: 5 tests in `__tests__/gate-logic-quoted-strings.test.js` + 1 guard test in `__tests__/gate-promoted-rules.test.js`; confirm FAIL |
<!-- Updated: Validation Session 1 — 5 quoted-strings tests (was 4) after including bypass guard. -->
| 2 | [green-impl-and-ship](./phase-02-green-impl-and-ship.md) | pending | GREEN: implement `stripNodeEvalBody`; wire into `matchConstraintPattern` + `applyPromotedRules`; tests pass; file bypass-risk finding; ship change-log |
| 3 | [annotate-planning-order-report](./phase-03-annotate-planning-order-report.md) | pending | No tests (tracking-only phase; mirrors Step 2 Phase 5 + Step 1 Phase 4): annotate the planning-order report's "Shipped status" table + TL;DR table with the change-log id from Phase 2 |

## Dependencies

**Same-scope blockedBy** (this plan requires):
- `260615-1500-surfaces-helper-and-refactors` (shipped) — provides `core/surfaces.js`; **not consumed by Step 3** (this plan touches pure logic, not cross-surface I/O), but listed for cross-plan matrix integrity per `brainstorm-260615-1430-planning-order-...` § Cross-Report Dependency Matrix.

**Same-scope blocks** (this plan unblocks): none. Step 3 is the end of the Report 1 path; Step 4 (`260615-runtime-agnostic-rule-phases-2-5`) is unblocked by Step 2, not Step 3.

**Cross-plan dependencies** (per `brainstorm-260615-1430-planning-order-...`):
- This plan is **Step 3 of 4** in the planning-order execution sequence.
- Step 1 (helper): ✅ shipped 2026-06-15.
- Step 2 (decision visibility + override + log + recurrence): ✅ shipped 2026-06-15 — the `gate_check_recurrence` MCP tool + the `.gate-decision.log` are the **catch-net** for this plan's accepted bypass risk.
- Step 4 (runtime-agnostic rule Phases 2-5): pending — not blocked by Step 3.

## TDD structure

Phases 1 + 2 follow **red → green → refactor**; Phase 3 is a tracking-only annotation step (no tests):

1. **Red (Phase 1)** — write 6 tests first, confirm they fail with the *current* code (the current `matchConstraintPattern` and `applyPromotedRules` do not strip `node -e` bodies, so the strip-related tests fail and the regression guards pass).
2. **Green (Phase 2)** — implement `stripNodeEvalBody`; insert into the two call sites; confirm all 6 tests pass and 0 regressions across the existing 870+ tests.
3. **Refactor (Phase 2)** — JSDoc, file-level comment, dead-code removal, whole-plan consistency sweep.
4. **Ship (Phase 2)** — file bypass-risk finding, ship change-log, optionally refresh + resolve `meta-260614T2141Z-...`.
5. **Annotate (Phase 3)** — mark Step 3 complete in the planning-order report's "Shipped status" + TL;DR tables with the change-log id from Phase 2; append any cosmetic findings to the report's "Cleanup backlog". Mirrors Step 2 Phase 5 + Step 1 Phase 4's pattern.

Per the `--tdd` flag, **no implementation lands without a failing test first**. The regression-guard tests (python-c / bash-c) are *expected to pass in RED* — they lock in the asymmetry before the implementation lands, so any future refactor that breaks them is caught.

## Design constraints (the user-stated reframe)

Three constraints from the source report (`brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md` § "Final Recommended Solution — Plan 2" + § "Implementation Considerations and Risks"):

1. **Asymmetric strip.** Only `node -e|--eval|-p|--print`. Do NOT strip `python -c`, `bash -c`, `ruby -e`, `perl -e`. The existing 3 tests at `gate-logic-quoted-strings.test.js:38-66` enforce this; any new code that strips them is a regression.
2. **Bypass risk is documented, not prevented.** `node -e "require('child_process').exec('npm install')"` no longer matches `package-manager` after the strip. The user accepted this trade-off (per the report: "the bypass risk is documented in the change-log and caught by Plan 1's recurrence tracker if it recurs"). The recurrence tracker from Step 2 is the catch-net.
3. **Sibling to `stripMessageFlags`.** Same module, same shape (pure function over a segment string), same insertion point (after `stripMessageFlags` in both `matchConstraintPattern` and `applyPromotedRules`). The function is a pure string transform — no I/O, no side effects.

## Test plan

| File | Test | Asserts |
|------|------|---------|
| `gate-logic-quoted-strings.test.js` | `node -e with nested string literal containing trigger phrase → null` | `matchConstraintPattern('node -e "console.log(\'do not create a new schema\')"')` returns `null` |
| `gate-logic-quoted-strings.test.js` | `node -e with nested string literal containing propose → null` | `matchConstraintPattern('node -e "console.log(\'propose a new artifact\')"')` returns `null` |
| `gate-logic-quoted-strings.test.js` | `python -c with import docker inside → docker (regression guard)` | `matchConstraintPattern('python -c "import docker"')` returns `"docker"` (unchanged) |
| `gate-logic-quoted-strings.test.js` | `bash -c with docker run inside → docker (regression guard)` | `matchConstraintPattern('bash -c "docker run ubuntu"')` returns `"docker"` (unchanged) |
| `gate-logic-quoted-strings.test.js` | `node -e body with package-manager command → null (accepted bypass)` | `matchConstraintPattern('node -e "require(\'child_process\').exec(\'npm install\')"')` returns `null` |
| `gate-promoted-rules.test.js` | `applyPromotedRules: node -e body with trigger phrase → no escalate` | With `rule-no-new-artifact-types` in rules, `applyPromotedRules('node -e "console.log(\'create a new schema\')"', null, rules)` returns `{ decision: "ok" }` (does not escalate) |

Total new tests: **6**. The first 3 are RED-then-GREEN (the strip doesn't exist yet). The middle 2 are pre-existing assertions (regression guards) — they must pass in BOTH RED and GREEN; they protect the asymmetry. The 6th is a promoted-rule integration test that pins the end-to-end behavior with the canonical P1 rule loaded. The bypass-guard test (test 5) is also RED-then-GREEN and documents the accepted bypass.

## Architecture (the strip)

```js
// tools/learning-loop-mcp/core/gate-logic.js (sibling to stripMessageFlags)

/**
 * Strip the body of a `node -e|--eval|-p|--print` wrapper.
 * The body of a `node -e` command is a JavaScript string literal in shell;
 * the regex above it should not see trigger phrases inside that body.
 *
 * Asymmetric by user-stated design: this strips only `node` wrappers.
 * `python -c`, `bash -c`, `ruby -e`, `perl -e` are NOT stripped because
 * their bodies are real commands (the existing
 * `gate-logic-quoted-strings.test.js` tests pin this asymmetry).
 *
 * Bypass risk: `node -e "require('child_process').exec('npm install')"` no longer matches
 * `package-manager` after the strip. This is documented in the
 * change-log and caught by `gate_check_recurrence` (Step 2) if it recurs.
 */
export function stripNodeEvalBody(segment) {
  // Match: (node|nodejs) ( -e | --eval | -p | --print ) "..." or '...'
  // Replace the quoted body with an empty placeholder.
  return segment.replace(
    /\b(node|nodejs)\s+(-e|--eval|-p|--print)\s+(["'])(?:(?!\3).)*\3/g,
    (match, _node, _flag, _quote) => {
      // Preserve the wrapper+flag; blank the body. E.g.:
      //   node -e "foo bar"   ->   node -e ""
      //   node --eval 'baz'   ->   node --eval ''
      return match.replace(/(["'])(?:(?!\1).)*\1/, "$1$1");
    }
  );
}
```

**Insertion sites** (in the same file):

```js
// matchConstraintPattern (line ~213)
for (const segment of splitSegments(command)) {
  const stripped = stripMessageFlags(segment);
  const stripped2 = stripNodeEvalBody(stripped);   // NEW
  for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
    if (pattern.test(stripped2)) return type;       // CHANGED: was `stripped`
  }
}

// applyPromotedRules regex branch (line ~687)
for (const segment of splitSegments(command)) {
  const stripped = stripMessageFlags(segment);
  const stripped2 = stripNodeEvalBody(stripped);   // NEW
  if (new RegExp(pattern).test(stripped2)) {        // CHANGED: was `stripped`
    matched = true;
    break;
  }
}
```

**Why insert after `stripMessageFlags` (not before):** the existing `splitSegments` + `stripMessageFlags` pair already handles message flags (`-m`, `--message`, etc.). Layering on top of `stripMessageFlags` keeps the existing 17 tests untouched and makes the strip composable with future wrappers (each wrapper gets its own strip step).

## Whole-plan consistency

- **Files touched:**
  - `tools/learning-loop-mcp/core/gate-logic.js` — 1 new function (`stripNodeEvalBody`) + 2 insertion sites (`matchConstraintPattern`, `applyPromotedRules` regex branch) + 1 file-level comment.
  - `tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js` — 5 new tests.
  - `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` — 1 new test.
  - `meta-state.jsonl` — 1 new finding (bypass-risk documentation) + 1 new change-log (this plan's shipping record).
  - `docs/journals/260615-step3-node-e-strip.md` — 1 new journal entry (cook handoff).
- **Files NOT touched:**
  - `core/patterns.json` — no new pattern added (the strip is code-side, not pattern-side).
  - Constraint patterns (`package-manager`, `side-effect-import`, etc.) — no change (the strip is code-side; patterns are still correct for non-`node -e` cases).
  - `rule-no-new-artifact-types` pattern — no change (the strip is the fix; the regex is still correct for non-`node -e` cases).
  - Step 2's `.gate-override` marker, `.gate-decision.log`, `gate_override` MCP tool, `gate_check_recurrence` MCP tool — all untouched; the bypass is caught by their existing infrastructure.
  - The 3 existing wrapper-commands tests at `gate-logic-quoted-strings.test.js:38-66` — unchanged (the asymmetry is locked in).

## Security considerations

- **No new attack surface.** The strip is a pure string transform. The bypass (`node -e "require('child_process').exec('npm install')"`) is the only new gap; it is **observable** via Step 2's `.gate-decision.log` (the decision log is the audit trail).
- **The bypass is documented, not hidden.** A new finding (`meta-260615T<time>Z-node-e-strip-bypass-risk-...`) explicitly names the gap. The operator sees it in `meta_state_list`. The recurrence tracker auto-files if the pattern recurs N≥3 in M≤10min.
- **The strip is operator-tunable.** The set of detected wrappers (`-e`, `--eval`, `-p`, `--print`) is a constant in `stripNodeEvalBody`. Adding `--inspect` or `-r` is a one-line change; removing the strip entirely is a one-line revert.
- **The strip does not affect `python -c` / `bash -c` / `ruby -e` / `perl -e`.** These are explicit non-targets (the user's design choice); the existing 3 tests + 2 new regression guards in this plan lock the asymmetry.

## Validation log

### Session 1 — 2026-06-15
**Trigger:** `/ck:plan validate plans/260615-1600-step3-bash-gate-node-e-strip/`
**Questions asked:** 7
**Verification Results:**
- Claims checked: 12
- Verified: 10 | Failed: 2 | Unverified: 0
- Tier: Standard
- Failures:
  1. Phase 2 finding example uses `category: "gate-logic-trade-off"` — not in `metaStateFindingEntrySchema` enum. Must be one of `gate-logic-bug`, `record-repair-gap`, `schema-drift`, `stale-ref`, `mcp-tool-missing`, `budget-check`, `loop-anti-pattern`.
  2. Parent finding `meta-260614T2141Z-...` has `expires_at: "2026-06-15T14:41:31.786Z"` which is in the past vs current time ~18:31, so it is `stale`; resolving it requires ack or re_verify first.

#### Questions & Answers

1. **[Assumptions/Risks]** The Phase 2 bypass-risk finding example uses category `"gate-logic-trade-off"`, which is rejected by `meta_state_report` schema. Which valid category should it use?
   - Options: `loop-anti-pattern` (Recommended) | `gate-logic-bug` | `schema-drift` | Other
   - **Answer:** `loop-anti-pattern`
   - **Rationale:** The finding documents an accepted anti-pattern/trade-off, not an active bug. Subtype `strip-bypass-accepted` preserves the specific semantics.

2. **[Risks]** The source finding `meta-260614T2141Z-...` is now stale (TTL expired). How should Phase 2 handle its resolution after gap #1 is closed?
   - Options: Ack then resolve (Recommended) | Re-verify then resolve | Leave unresolved | Resolve without ack
   - **Answer:** Ack then resolve
   - **Rationale:** The underlying gap is being fixed, so the parent finding should be closed. It must be acked first because it is currently stale.

3. **[Scope]** Phase 1 includes an optional 6th test that locks in the accepted bypass. Should it be included?
   - Options: Yes, include it (Recommended) | No, skip it | Other
   - **Answer:** Yes, include it, but with a more realistic Node.js example.
   - **Custom input:** "Hmm... That's fix is not reflected the real world. import vnstock_data is for the Python, not nodejs. So, let's use another example, related to git or node create something"
   - **Rationale:** Documentation-by-test is valuable, but the example must be realistic for Node.js. Chosen example: `node -e "require('child_process').exec('npm install')"`.

4. **[Architecture]** The proposed regex only strips `node -e` when the eval flag is the first token after the binary, so `node --inspect-brk -e "..."` is not stripped. Should the regex be extended now?
   - Options: Keep narrow, let recurrence catch it (Recommended) | Extend regex to allow flags before `-e`
   - **Answer:** Keep narrow, let recurrence catch it
   - **Rationale:** Matches the narrow-first-pass intent. Broadening now adds scope and extra regression tests. Step 2's `gate_check_recurrence` is the catch-net.

5. **[Assumptions]** For the bypass-risk finding and optional test, which realistic `node -e` example should document the accepted bypass?
   - Options: `node -e "require('child_process').exec('docker run ubuntu')"` (Recommended) | `node -e "require('child_process').exec('npm install')"` | Keep original `import vnstock_data` | Other
   - **Answer:** `node -e "require('child_process').exec('npm install')"`
   - **Rationale:** Realistic Node.js idiom that would normally match the `package-manager` constraint but is hidden after the strip.

6. **[Assumptions]** The Phase 2 bypass-risk finding example says `expires_at: +24h`, but the risk assessment says default to `null`. Which should it be?
   - Options: Set `expires_at` to `null` (Recommended) | Set 24h TTL (reported)
   - **Answer:** Set `expires_at` to `null`
   - **Rationale:** The accepted bypass is durable documentation; it should not auto-expire.

7. **[Architecture]** The Phase 2 change-log example uses `affected_system: "meta"`. Since the change is to `core/gate-logic.js`, should it be `"gate-logic"`?
   - Options: `gate-logic` (Recommended) | `meta`
   - **Answer:** `gate-logic`
   - **Rationale:** The change modifies gate logic semantics, not meta tooling. Both values are schema-valid, but `gate-logic` is more accurate.

#### Confirmed Decisions
- Bypass-risk finding category: `loop-anti-pattern` with subtype `strip-bypass-accepted`.
- Parent finding resolution: ack `meta-260614T2141Z-...` then resolve it after Step 3 ships.
- Bypass example: `node -e "require('child_process').exec('npm install')"` (realistic Node.js idiom).
- Regex scope: keep narrow; do not handle flags before `-e` in this pass.
- Bypass-risk finding TTL: `expires_at: null` (durable documentation entry).
- Change-log `affected_system`: `gate-logic`.

#### Action Items
- [x] Update plan prose to reflect validation decisions (done during this validation session).
- [ ] During Phase 2 implementation: file bypass-risk finding via `meta_state_report` with category `loop-anti-pattern` and `expires_at: null`.
- [ ] During Phase 2 implementation: file change-log via `meta_state_log_change` with `affected_system: gate-logic`.
- [ ] During Phase 1 implementation: add bypass-guard test using `node -e "require('child_process').exec('npm install')"`.
- [ ] During Phase 2 implementation: ack then resolve stale parent finding `meta-260614T2141Z-...`.
- [ ] During implementation: reconcile test counts across all files (6 new tests total).

#### Impact on Phases
- Phase 1: Optional bypass test is included with realistic Node.js example.
- Phase 2: Finding + change-log metadata updated; stale parent resolution path added.

### Whole-Plan Consistency Sweep
- Replaced all `node -e "import vnstock_data"` references with `node -e "require('child_process').exec('npm install')"`.
- Updated finding category, finding TTL, and change-log affected_system per validation answers.
- Added stale-parent resolution guidance.
- No unresolved contradictions remain.

## Next steps

After this plan ships:
- The finding `meta-260614T2141Z-...` can be refreshed + resolved (gap #1 is closed; gap #2 was closed by Step 2). Operator decision required: refresh `applyPromotedRules` fingerprint first, then `meta_state_resolve`.
- Step 4 (`260615-runtime-agnostic-rule-phases-2-5`) becomes the next plan.
- The cleanup backlog (per `brainstorm-260615-1430-planning-order-...` § Cleanup backlog) accumulates minor findings from each shipped step; processed in one session after all 4 steps ship.
- The planning-order report (per Phase 3's annotation) reflects 3 of 4 steps shipped; the next session reading the report sees Step 4 as the only remaining work.
</content>
</invoke>

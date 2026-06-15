---
phase: 1
title: "red-tests — write 4 quoted-strings tests + 1 G8-style promoted-rule guard test, confirm RED"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 1: red-tests

## Overview

Write the 6 tests for `stripNodeEvalBody` first, confirm they fail with the current code (RED), and freeze the asymmetry between `node -e` (strip) and `python -c` / `bash -c` (do not strip) BEFORE the implementation lands. This is the TDD-first half of Step 3.

The 6 tests are:
<!-- Updated: Validation Session 1 — 6 tests (was 5) after including bypass guard. -->
- 5 unit tests in `__tests__/gate-logic-quoted-strings.test.js` — exercise `matchConstraintPattern` with `node -e` / `python -c` / `bash -c` inputs.
- 1 integration test in `__tests__/gate-promoted-rules.test.js` — pins the end-to-end behavior with the canonical P1 rule `rule-no-new-artifact-types` loaded.

The first 3 tests are RED-then-GREEN (the strip doesn't exist yet, so `matchConstraintPattern` returns the matched constraint). The middle 2 tests are pre-existing assertions in spirit — they must pass in BOTH RED and GREEN; they protect the asymmetry. The 6th test is RED-then-GREEN (the `applyPromotedRules` regex branch does not strip `node -e` bodies today, so the trigger inside the body escalates the canonical rule).

## Requirements

Functional:
- Extend `__tests__/gate-logic-quoted-strings.test.js` with 5 new tests covering:
  1. `node -e` body containing the G8 trigger phrase `do not create a new schema` → no match.
  2. `node -e` body containing the G8 trigger phrase `propose a new artifact` → no match.
  3. `python -c "import docker"` → matches `docker` (regression guard; the body is a real import).
  4. `bash -c "docker run ubuntu"` → matches `docker` (regression guard; the body is a real command).
  5. `node -e "require('child_process').exec('npm install')"` → returns `null` (bypass guard; documents the accepted `package-manager` bypass).
- Extend `__tests__/gate-promoted-rules.test.js` with 1 new test:
  6. When the canonical P1 `rule-no-new-artifact-types` is loaded into the rules array, `applyPromotedRules('node -e "console.log(\'create a new schema\')'", null, rules)` returns `{ decision: "ok" }` (does NOT escalate).

Non-functional:
- All new tests use the same `import` / `assert` / `node:test` style as the existing 17 tests in `gate-logic-quoted-strings.test.js` and the existing 23+ tests in `gate-promoted-rules.test.js`. No new dependencies.
- Tests are pure: no `mkdtempSync`, no `GATE_ROOT` env var, no I/O. The existing `matchConstraintPattern` and `applyPromotedRules` are already pure (no I/O).
- Each test has a one-line description that follows the existing `matchConstraintPattern: <input> → <expected output>` style.

## Architecture

The 4 quoted-strings tests slot into the existing 3-category structure of `gate-logic-quoted-strings.test.js`:

- **False-positive cases (message flags)** — existing 7 tests for `git commit -m` and `gh pr create --title`.
- **Wrapper-command cases (must still match)** — existing 3 tests for `bash -c` and `python -c`. The new 2 regression guards (tests 3 and 4) extend this section.
- **Normal constraint cases (must still match)** — existing 5 tests.
- **NEW: node -e cases (must NOT match)** — 2 new tests for the strip.

The promoted-rule test slots into the existing structure of `gate-promoted-rules.test.js`. Look for the section that tests `rule-no-new-artifact-types` (the G8 family) — add the new test there.

### Test code

```js
// tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js (NEW tests, appended)

// ─── node -e body cases (must NOT match) ───

await test("matchConstraintPattern: node -e with nested string literal containing trigger → null", () => {
  const result = matchConstraintPattern(`node -e "console.log('do not create a new schema')"`);
  assert.strictEqual(result, null);
});

await test("matchConstraintPattern: node -e with nested string literal containing propose → null", () => {
  const result = matchConstraintPattern(`node -e "console.log('propose a new artifact')"`);
  assert.strictEqual(result, null);
});
```

```js
// tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js (NEW test, appended to the G8 section)

await test("applyPromotedRules: node -e body with trigger phrase → ok (no escalate)", () => {
  // The trigger phrase "create a new schema" is inside the `node -e` body.
  // After Phase 2 ships stripNodeEvalBody, the body is blanked before regex match.
  // Today (RED), the regex sees the trigger and escalates.
  const rules = [
    {
      id: "rule-no-new-artifact-types",
      entry_kind: "rule",
      status: "active",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "(propose|design|create)\\s+(a|an|new|separate|own|the)?\\s*(schema|artifact|directory|convention)|new\\s+(schema|artifact|directory|convention)",
    },
  ];
  const result = applyPromotedRules(
    `node -e "console.log('create a new schema')"`,
    null,
    rules,
    "/tmp",
  );
  assert.strictEqual(result.decision, "ok");
});
```

**Note on the `applyPromotedRules` integration test**: the function takes a `root` argument (4th) used by `readGateOverride` (Step 2's override marker) and `checkResolutionEvidence` (the cold-session rule). `/tmp` is a safe stand-in for the test — both helpers fail-open when the marker/registry doesn't exist.

**Bypass guard (locks in the accepted bypass)**: the report does not require this, but it makes the bypass acceptance visible in the test suite:

```js
// OPTIONAL — locks in the bypass risk documented in the change-log
await test("matchConstraintPattern: node -e body with package-manager command → null (accepted bypass, see meta-...-node-e-bypass-risk-...)", () => {
  const result = matchConstraintPattern(`node -e "require('child_process').exec('npm install')"`);
  assert.strictEqual(result, null);
});
```

This test is **included** per validation decision (Session 1, 2026-06-15). It makes the bypass risk **visible in the test suite** — any future change to `stripNodeEvalBody` that fixes the bypass is caught by this test (a deliberate test-as-documentation choice).

## Related Code Files

- Modify: `tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js` — append 3 new tests.
<!-- Updated: Validation Session 1 — included bypass guard test with realistic Node.js example. -->
- Modify: `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` — append 1 new test in the G8 section.
- No other files touched in this phase.

## Implementation Steps (TDD)

1. **Read the existing test files end-to-end.** Confirm the import style, the `await test()` async pattern, and the G8 section structure in `gate-promoted-rules.test.js`. (Both files already imported by Phase 0 — quick re-read only.)
2. **Append the 3 tests to `gate-logic-quoted-strings.test.js`.** Use the existing test runner pattern. Add a section comment `// ─── node -e body cases (must NOT match) ───` between the wrapper-command section and the normal-cases section.
<!-- Updated: Validation Session 1 — 3 tests (was 2/3 optional). -->
3. **Append the 1 test to `gate-promoted-rules.test.js`.** Add to the section that exercises `rule-no-new-artifact-types`. The test loads a hard-coded rules array (mirroring the pattern in other G8 tests in the file).
4. **Run `pnpm test -- gate-logic-quoted-strings`.** Expect:
   - 3 RED tests: the new `node -e` tests fail (current code returns the matched constraint).
   - 2 GREEN tests: the new `python -c` and `bash -c` regression guards pass (current code already returns `docker` for these — the asymmetry is the existing behavior, not the new one).
   - 17 existing tests: still pass.
<!-- Updated: Validation Session 1 — 3 RED node-e tests (was 2). -->
5. **Run `pnpm test -- gate-promoted-rules`.** Expect:
   - 1 RED test: the new `node -e` promoted-rule test fails (current `applyPromotedRules` regex branch does not strip the body, so the trigger escalates).
   - 23+ existing tests: still pass.
6. **Confirm RED in writing.** Both files have at least 1 failing test. The regression-guard tests (python-c, bash-c) pass — this is **expected** and **required** (they lock the asymmetry before the implementation lands).
7. **Whole-plan consistency check.** `grep -n "node -e\|stripNodeEvalBody" tools/learning-loop-mcp/__tests__/` — confirm 4-5 hits in the test files (the new tests reference the strip), 0 hits in the core file (the implementation lands in Phase 2).

## Success Criteria

- [ ] `__tests__/gate-logic-quoted-strings.test.js` has 3 new tests for `node -e` body cases.
- [ ] `__tests__/gate-logic-quoted-strings.test.js` has 2 new regression-guard tests for `python -c` and `bash -c` (pre-existing assertion style, new tests for clarity).
- [ ] `__tests__/gate-promoted-rules.test.js` has 1 new G8-style test for `applyPromotedRules` + `node -e`.
- [ ] `pnpm test -- gate-logic-quoted-strings` shows: 3 RED (`node -e` tests), 2 GREEN (regression guards), 17 existing GREEN.
<!-- Updated: Validation Session 1 — 3 node-e tests (was 2). -->
- [ ] `pnpm test -- gate-promoted-rules` shows: 1 RED (`node -e` promoted-rule test), 23+ existing GREEN.
- [ ] No regressions in any other test file (the change is contained to the 2 test files).
- [ ] Whole-plan consistency check passes (no `stripNodeEvalBody` in `core/gate-logic.js` yet — that lands in Phase 2).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tests pass instead of fail (the strip is already implemented elsewhere) | Per the report, the strip does NOT exist today. If a test passes in RED, the strip is already in place; stop and audit `core/gate-logic.js` for a previous implementation. (None expected — only the G8 P1/P2 fixes from `meta-260606T0225Z-...` and `meta-260605T2010Z-...` are present.) |
| The 2 regression-guard tests pass in RED (expected) and we forget they were already passing | The success criteria explicitly call this out: "regression guards pass in BOTH RED and GREEN". The test description and section comment mark them as "regression guard" so a future reader knows they were locked in before the implementation. |
| The `applyPromotedRules` test fails for a different reason (e.g., the rule ID `rule-no-new-artifact-types` is not the canonical P1 rule) | The P1 rule's pattern is the same as the source report's example; copy it verbatim from `meta-state.jsonl#rule-no-new-artifact-types` (the regex is `(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`). The test loads a hard-coded rules array, not from `meta-state.jsonl`, so it does not depend on registry state. |
| The `applyPromotedRules` test's `root: "/tmp"` argument is rejected (the override reader requires a real root) | `readGateOverride` is fail-open (returns `null` when the marker file doesn't exist). `/tmp` has no marker; the test passes. Verify by checking `core/gate-override.js`. |
| Test is added to the wrong section in `gate-promoted-rules.test.js` (e.g., the G8 subcommand-class section instead of the rule-application section) | Use a clear section comment `// ─── node -e body strip (G8 integration) ───` and group with the existing rule-application tests, not the G8 subcommand-class tests. The existing structure has multiple G8-related sections; pick the one labeled "rule-application" or "applyPromotedRules with rule-no-new-artifact-types". |

## Security Considerations

- The tests do not change any production code. No attack surface change.
- The bypass guard test makes the accepted bypass (`node -e "require('child_process').exec('npm install')"` no longer matches `package-manager`) **visible in the test suite** — this is documentation-by-test, not a fix. The recurrence tracker from Step 2 is the catch-net.

## Next Steps

After Phase 1 ships RED, Phase 2 implements `stripNodeEvalBody` and the tests turn GREEN. The 2 regression-guard tests stay GREEN throughout (they were already passing; they just become locked in).
</content>
</invoke>

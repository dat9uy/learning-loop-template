# Step 3 Session Reflection: bash-gate node -e body strip

**Date**: 2026-06-15 19:37
**Severity**: Medium
**Component**: tools/learning-loop-mcp/core/gate-logic.js
**Status**: Resolved

## What Happened

Step 3 of the cross-report planning order shipped: `stripNodeEvalBody` in `gate-logic.js`. This function blanks the JavaScript body inside `node -e|--eval|-p|--print` arguments before the gate's constraint-pattern regex runs, eliminating false positives where JS code was misclassified as shell commands.

The change is asymmetric by design: only `node -e` bodies are stripped. `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c` remain untouched because their bodies are real commands. Two regression tests lock this in.

## The Brutal Truth

This was a straightforward implementation, but the test-case pivot was the real story. The original plan called for G8-style phrase tests ("install package", "download file"). Those were useless — they don't exercise the actual constraint patterns that trigger false positives. We caught this during implementation and pivoted to `docker`, `sudo`, and `package-manager` bypass cases, which actually hit the regexes that matter. The frustrating part is that the plan's test design was theoretically sound but practically hollow. We should have caught this in planning, not at the keyboard.

## Technical Details

- `stripNodeEvalBody` added to `gate-logic.js` (~58 lines of new logic)
- 6 new tests: 5 in `gate-logic-quoted-strings.test.js`, 1 in `gate-promoted-rules.test.js`
- Full suite: 955/956 pass, 0 failures (the 1 skip is pre-existing, unrelated)
- Commit: `c69a799`
- Meta-state finding: `meta-260615T1920Z-the-new-stripnodeevalbody-function-in-tools-learning-loop-mc`
- Meta-state change-log: `meta-260615T1921Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody`

Key regex used for detection:
```js
const nodeEvalRe = /\bnode\s+(?:-[ep]|--eval|--print)\s+['"`]/;
```

The strip blanks everything from the opening quote to the matching closing quote, replacing it with spaces so character positions don't shift and downstream regex offsets stay valid.

## What We Tried

1. **Original plan**: G8 phrase tests ("install package" inside node -e). These passed trivially because they didn't match any constraint patterns. Useless.
2. **Pivot**: Switched to `docker`, `sudo`, and `package-manager` bypass cases. These actually exercise the constraint regexes and proved the strip works.
3. **Regression guards**: Added `python -c` and `bash -c` cases to ensure we don't accidentally strip non-node bodies.

## Root Cause Analysis

The plan's test design was abstracted one level too high. It described *what* to test ("G8 phrases") without verifying *why* those phrases matter (they don't). The real requirement is: "test cases must exercise the constraint patterns that historically false-positive on node -e bodies." That wasn't stated explicitly, so we wrote tests that passed but proved nothing.

Lesson: test design must trace to the actual regex/pattern that causes the bug. Generic phrase tests are a trap.

## Lessons Learned

1. **Test-to-pattern traceability**: Every test case must name the constraint pattern it exercises. If you can't name it, the test is probably hollow.
2. **Asymmetric design is correct**: Not all `-e`/`-c` flags are equal. `node -e` runs JS, not shell. Treating all scripting flags the same would over-strip and break legitimate `python -c` command detection.
3. **Meta-state discipline**: Filing the finding and change-log before commit kept the audit trail clean. The commit message references both, which is the pattern we want.
4. **Bypass risk is accepted, not ignored**: The `node -e "require('child_process').exec('npm install')"` bypass is real but documented. Step 2's recurrence gate (`gate_check_recurrence`) catches it if it becomes a pattern. This is the right trade-off: don't block a fix for a theoretical bypass that requires intentional obfuscation.

## Next Steps

- **Step 4**: Runtime-agnostic rule Phases 2-5. This is the remaining work in the planning order. No blockers.
- **Cross-plan status**: 3 of 4 steps shipped. Step 1 (bash-gate debate infra) and Step 2 (decision log + override + recurrence) are live. Step 3 ships now. Step 4 is next.
- **No immediate follow-ups** for this change. The meta-state records are the monitoring mechanism.

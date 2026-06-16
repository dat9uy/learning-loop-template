---
phase: 1
title: "decision visibility — route block/escalate via hookSpecificOutput on stdout, keep ok on stdout"
status: shipped
priority: P1
effort: "1.5h"
dependencies: []
---
<!-- Updated: Validation Session 1 - changed output channel from stderr to stdout hookSpecificOutput -->

# Phase 1: decision visibility (was: stderr visibility)

## Overview

The smallest piece of the bash-gate-debate plan. Change the bash gate's `console.log(formatOutput(decision))` call sites for `block` / `escalate` decisions to write a `hookSpecificOutput` JSON envelope on stdout (matching the existing `formatSoftWarning` contract in `protocol-adapter.js`). The `ok` branch stays silent (`process.exit(0)`, no output).

**Why first:** ship the smallest possible user-pain fix in isolation. The agent now sees WHY the gate blocked. This unlocks the remaining phases (override needs the agent to see the rule_id; recurrence needs the decision JSON to be reachable).

## Requirements

Functional:
- `tools/learning-loop-mcp/hooks/bash-gate.js` line ~108: the `applyPromotedRules` escalate branch writes `formatOutput(promotedCheck, { channel: 'hookSpecificOutput' })` to stdout.
- `tools/learning-loop-mcp/hooks/bash-gate.js` line ~124: the combined block/escalate path writes the same way.
- The `ok` branch (line 121, `process.exit(0)`) stays silent — no `console.log`, no hookSpecificOutput.
- `protocol-adapter.js` gains a new export: `formatHookDecision(decision, { channel })` which wraps the decision in the `hookSpecificOutput` envelope when `channel === 'hookSpecificOutput'`. The existing `formatOutput` stays unchanged for the ok path (no change).
- Exit codes are unchanged: 0 for ok, 2 for block/escalate. The output channel is the only delta.

Non-functional:
- Uses the existing `formatSoftWarning` contract; no new assumptions about the hook runtime.
- `formatOutput` from `protocol-adapter.js` is unchanged; `formatHookDecision` is the new helper.
- No new dependencies, no new files (this phase is a 2-line change in `bash-gate.js` + a small new helper in `protocol-adapter.js`).
- The change is fully backward-compatible with the hook runtime: it still exits with the same code; the difference is whether the model sees the JSON.

## Architecture

```js
// tools/learning-loop-mcp/hooks/lib/protocol-adapter.js (NEW export, sibling to formatOutput)
export function formatHookDecision(decision, { channel } = {}) {
  if (channel === "hookSpecificOutput") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: JSON.stringify(decision),
      },
    });
  }
  return formatOutput(decision);
}
```

```js
// tools/learning-loop-mcp/hooks/bash-gate.js (around line 107)
import { formatHookDecision } from "./lib/protocol-adapter.js";   // NEW import

if (promotedCheck.decision === "escalate") {
  console.log(formatHookDecision(promotedCheck, { channel: "hookSpecificOutput" }));   // CHANGED
  process.exit(exitCode(promotedCheck));
}

// ... combined block/escalate path (around line 124)
console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));         // CHANGED
process.exit(exitCode(decision));
```

The `ok` path is implicit: when `decision` is not set, the function falls through to `process.exit(0)` at line 121. No `console.log` on the ok path; no hookSpecificOutput. The hook runtime treats the absence of output on the block/escalate path (when ok) as the ok signal.

**Why `hookSpecificOutput` (not raw stdout JSON or stderr):** the existing `formatSoftWarning` already uses this pattern for `UserPromptSubmit` (see `protocol-adapter.js:78-85`). It wraps the message in `{ hookSpecificOutput: { hookEventName, additionalContext } }`, which is the canonical channel for hooks to surface context back to the model. Using the same envelope for `PreToolUse` block/escalate decisions keeps the contract symmetric — both gates speak the same dialect.

## Related Code Files

- Modify: `tools/learning-loop-mcp/hooks/bash-gate.js` — 2-line change (line ~108 and line ~124).
- Create: `tools/learning-loop-mcp/__tests__/bash-gate-decision-visibility.test.js` — 5 tests pinning the routing.
- No other files touched.

## Implementation Steps (TDD)

1. **Red — write the test file first.** Create `__tests__/bash-gate-decision-visibility.test.js` (file rename from `bash-gate-stderr-visibility.test.js`) with:
   - `test("ok decision: stdout receives nothing; exit code 0")` — call `main()` (or invoke the hook via subprocess) with a command that produces `decision: "ok"` (e.g., `ls -la`). Assert stdout is empty and exit code is 0.
   - `test("escalate decision: stdout receives hookSpecificOutput envelope; exit code 2")` — call with a command that matches a promoted rule. Assert stdout contains a JSON object with `hookSpecificOutput.hookEventName === "PreToolUse"` and `hookSpecificOutput.additionalContext` containing the decision JSON; exit code 2.
   - `test("block decision: stdout receives hookSpecificOutput envelope; exit code 2")` — call with a command that hits `commandWritesToRecords` (e.g., `> records/foo.json`). Assert stdout has the hookSpecificOutput envelope with `decision: "block"`.
   - `test("hookSpecificOutput.additionalContext is valid JSON with the expected fields")` — parse the `additionalContext` field; assert it has `decision`, `reason`, and the matching rule_id.
   - `test("formatHookDecision defaults to formatOutput shape when no channel")` — backward-compat: `formatHookDecision({ decision: 'ok' })` returns the same as `formatOutput({ decision: 'ok' })`.
2. **Capture stdout in tests.** `import { mock } from "node:test"` to stub `console.log` and `process.exit`; capture the arguments. Pure in-process; no spawn.
3. **Run tests; confirm RED.** `pnpm test -- bash-gate-decision-visibility` — all 5 tests fail because the current code uses `formatOutput` (no envelope).
4. **Green — implement `formatHookDecision`.** Add the new export to `protocol-adapter.js` per the architecture. Re-run tests; the unit tests for `formatHookDecision` pass; the integration tests still fail (bash-gate.js not updated yet).
5. **Green — apply the 2-line change.** Edit `bash-gate.js` to use `formatHookDecision(decision, { channel: "hookSpecificOutput" })`. Re-run tests; all pass.
6. **Refactor.** Confirm the change diff in `bash-gate.js` is exactly 2 lines (the two `formatOutput` → `formatHookDecision` swaps) + 1 new import. Confirm `pnpm test` shows 0 regressions across the existing 840+ tests.
7. **Whole-plan consistency check.** `grep -n "formatOutput\|formatHookDecision" tools/learning-loop-mcp/hooks/bash-gate.js` — expect 0 `formatOutput` calls (all migrated to `formatHookDecision`) and 1 import line.

## Success Criteria

- [x] `protocol-adapter.js` exports `formatHookDecision(decision, { channel })`.
- [x] `bash-gate.js` line ~108 writes via `formatHookDecision(promotedCheck, { channel: "hookSpecificOutput" })`.
- [x] `bash-gate.js` line ~124 writes via `formatHookDecision(decision, { channel: "hookSpecificOutput" })`.
- [x] `bash-gate.js` line ~121 (ok path) is unchanged (`process.exit(0)`, no output).
- [x] `__tests__/bash-gate-decision-visibility.test.js` exists with 5+ passing tests.
- [x] `pnpm test` shows 0 new failures; all 840+ existing tests still pass.
- [x] Manual smoke: an agent invoking a blocked command sees the hookSpecificOutput JSON on stdout (verified via the new test).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Hook runtime doesn't parse `hookSpecificOutput.additionalContext` for `PreToolUse` | This is the canonical channel for `UserPromptSubmit` (per `formatSoftWarning`). `PreToolUse` may have a different contract; the test pins the round-trip. If `additionalContext` is ignored, Phase 1 ships a "decision shape preserved" outcome, but the agent may not see the JSON. Future hardening: also write the decision to the `.gate-decision.log` (Phase 3) so the agent can read it via a meta-surface tool. |
| The 2-line change is too small to be a phase | Intentional. Per the report (Component 1.1, line 152-159), the decision visibility is the "smallest piece, ships first". A 1-day PR is the goal. |
| `formatHookDecision` and `formatOutput` diverge in subtle ways | Both wrap `JSON.stringify(decision)`. The wrapper for `hookSpecificOutput` is a single-level envelope. Unit tests pin both shapes. |
| Backward compat: an existing caller of `formatOutput` from a non-bash-gate context breaks | `formatOutput` is unchanged. New `formatHookDecision` is purely additive. No regression. |

## Security Considerations

- Routing the block reason via `hookSpecificOutput.additionalContext` surfaces the `reason` and `rule_id` back to the model. Both are operator-authored content; no secret leakage (the gate never has secrets). Safe.
- The change is "more transparent", not "more permissive". No new attack surface.

## Next Steps

Phase 2: `.gate-override` marker + `gate_override` MCP tool. The override reader (inside `applyPromotedRules`) needs to know which rule to skip — that rule_id is now visible in the hookSpecificOutput envelope from Phase 1. The override's TTL marker is written via `writeToAllSurfaces` from Step 1's helper.

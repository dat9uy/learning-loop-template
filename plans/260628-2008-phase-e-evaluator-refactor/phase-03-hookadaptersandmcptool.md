---
phase: 3
title: "HookAdaptersAndMcpTool"
status: pending
effort: "0.5 day"
---

# Phase 3: Hook Adapters + gate_check MCP Tool Refactor

## Overview

The 3 hooks become thin I/O adapters (parse stdin → call evaluator → format stdout/exit). The `gate_check` MCP tool rewires to import from the new evaluators; wire shape stays byte-identical (locked by snapshot test against `reports/gate-check-snapshot-captured.json`).

## Requirements

- **Functional:** 3 hooks reduced to ≤35 lines each (excluding imports + header); `gate_check` returns same JSON shape for same inputs; all 1308 baseline tests + 30 new tests pass.
- **Non-functional:** wire protocol unchanged (stdin JSON in, stdout JSON out, exit 0/2); per-runtime shim files (`.claude/coordination/hooks/*.cjs`, `.factory/coordination/hooks/*.cjs`) untouched.

## Architecture

**Hook adapter pattern** (parameterized per hook for the formatter — per red-team C1):

```js
#!/usr/bin/env node
/**
 * Universal <Name> Gate — <HookEvent> hook for <ToolName>.
 * Thin I/O adapter — all policy lives in core/evaluate-<name>-gate.js.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  <extractors>,
  <FORMATTER>,  // formatOutput for write-gate + inbound-gate; formatHookDecision(..., {channel: "hookSpecificOutput"}) for bash-gate
  exitCode,
} from "./lib/protocol-adapter.js";
import { evaluate<Name>Gate } from "../../core/evaluate-<name>-gate.js";
import { findProjectRoot } from "../../core/gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);
  const <payload> = <extract>(input);
  if (!<payload>) process.exit(0);

  const root = findProjectRoot();
  const decision = evaluate<Name>Gate({ <payload>, root });

  if (decision.decision !== "ok") {
    console.log(<FORMATTER_CALL>);  // see per-hook formatter table below
  }
  process.exit(exitCode(decision));
}

main();
```

**Per-hook formatter table** (locked from `tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js` + current hook behavior):

| Hook | Formatter | Reason |
|---|---|---|
| `write-gate.js` | `formatOutput(decision)` | Raw JSON; write-gate currently outputs raw (line 67 etc.) |
| `bash-gate.js` | `formatHookDecision(decision, { channel: "hookSpecificOutput" })` | **Locked by `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:51-55`** — PreToolUse runtime expects the envelope so the decision surfaces back to the model |
| `inbound-gate.js` | `formatSoftWarning(message)` for warn; otherwise exit 0 | Soft warning, not a block — matches `hooks/legacy/lib/protocol-adapter.js:78` + current `inbound-gate.js:125` |

**MCP tool refactor** (snapshot-locked): `tools/legacy/gate-tool.js` imports `evaluateBashGate` + `evaluateWriteGate` (or their thin wrappers) and calls them with the same inputs the hook would. The wire shape (`{ content: [{ type: "text", text: JSON.stringify(decision) }] }`) is byte-identical to the current implementation.

## Related Code Files

### Create

- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-check-snapshot.test.js` (snapshot parity test)
- `plans/260628-2008-phase-e-evaluator-refactor/reports/gate-check-snapshot-captured.json` (pre-refactor capture)

### Modify

- `tools/learning-loop-mastra/hooks/legacy/write-gate.js` (187 → ~30 lines)
- `tools/learning-loop-mastra/hooks/legacy/bash-gate.js` (148 → ~30 lines)
- `tools/learning-loop-mastra/hooks/legacy/inbound-gate.js` (128 → ~30 lines)
- `tools/learning-loop-mastra/tools/legacy/gate-tool.js` (import from new evaluators)

## Implementation Steps

1. **Step 1 — Capture pre-refactor snapshot.** Build a small Node script that imports `gateCheckTool.handler({...})` directly (no MCP server needed) and exercises it against a fixture set of inputs: (a) constraint command + active observation → ok, (b) constraint command + no observation → block, (c) PATH_WRITE_PATTERNS command → block, (d) product/** file with valid preflight marker → ok, (e) product/** file with no marker → block, (f) safe command → ok, (g) empty input → ok. For each fixture, capture **only** `result.content[0].text` (the JSON string the runtime surfaces). Write to `tools/learning-loop-mastra/__tests__/legacy-mcp/fixtures/gate-check-snapshot.json` as `{fixtures: [{fixture_id, input, expected_return_json_string}, ...]}` — exactly 3 fields per entry (per red-team C2 fix). The snapshot does NOT include stderr `console.error` output (`gate-tool.js:64`) or `.gate-decision.log` rows (`gate-tool.js:66-74`) — those are I/O side effects, not the wire shape.
2. **Step 2 — Refactor `write-gate.js` hook.** Replace the 7-rule cascade with a call to `evaluateWriteGate({ filePath, root })`. The preflight checklist rendering stays in the hook (it's display formatting, not policy). The `formatOutput(decision)` call stays (write-gate uses raw JSON). Top-level JSDoc updates to "thin adapter." Preserve the `meta-state.jsonl` audit-gap rationale comment from current `write-gate.js:83-91` as JSDoc on the corresponding rule in `evaluate-write-gate.js` (per red-team H3).
3. **Step 3 — Refactor `bash-gate.js` hook.** Replace the constraint + path + promoted-rules chain with a call to `evaluateBashGate({ command, root })`. **CRITICAL:** keep `formatHookDecision(decision, { channel: "hookSpecificOutput" })` — do NOT replace with `formatOutput` (per red-team C1, the envelope is locked by `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:51-55`; replacing it breaks 2 baseline tests). The `appendDecisionLog` call stays in the hook (it's an I/O side effect, not policy).
4. **Step 4 — Refactor `inbound-gate.js` hook.** Replace the state-change + staleness chain with a call to `evaluateInboundGate({ prompt, root })`. The `writeOperatorMessageMarker` I/O stays in the hook. **CRITICAL ordering** (per red-team C5): the hook must call `evaluateInboundGate` BEFORE `writeOperatorMessageMarker` so the marker reflects the post-evaluator state. For the `warn` decision, the hook calls `formatSoftWarning(decision.context_message)`. Inbound-gate always exits 0 (soft warning, not a block).
5. **Step 5 — Refactor `gate_check` MCP tool.** Replace the inline `matchConstraintPattern` + `makeGateDecision` + `evaluateWritePath` chain with a call to `evaluateBashGate` (when `command` is set) or `evaluateWriteGate` (when `file_path` is set). The decision combination logic moves to the evaluator; the tool becomes a thin dispatcher. The `console.error("gate: ...")` and `appendGateLog(...)` calls STAY (they are I/O side effects, not wire shape).
6. **Step 6 — Run snapshot test.** Execute `__tests__/legacy-mcp/gate-check-snapshot.test.js` against the post-refactor tool. For each fixture, assert `JSON.stringify(result.content[0].text) === fixture.expected_return_json_string` (byte-equality). Separately, assert that stderr and `.gate-decision.log` are non-empty for non-ok decisions (without asserting exact bytes — per red-team C2).
7. **Step 7 — Run full suite.** `pnpm test` — all 1308 baseline + 30 new tests pass.
8. **Step 8 — Per-runtime shim check.** Verify `.claude/coordination/hooks/*.cjs` and `.factory/coordination/hooks/*.cjs` are unchanged (they import the universal hooks via `execFileSync` — no change needed).

## Success Criteria

- [ ] Each hook file is ≤35 lines (excluding imports + header comment + `main()` boilerplate).
- [ ] **bash-gate.js uses `formatHookDecision(decision, { channel: "hookSpecificOutput" })`** (per red-team C1 — locked by `bash-gate-decision-visibility.test.js:51-55`). **NOT** `formatOutput`.
- [ ] **write-gate.js uses `formatOutput(decision)`** (current behavior, preserved).
- [ ] **inbound-gate.js uses `formatSoftWarning(decision.context_message)` for warn decisions**; always exits 0.
- [ ] `gate-tool.js` imports from `core/evaluate-*-gate.js` (not from `gate-logic.js` primitives directly).
- [ ] **Snapshot test passes against `__tests__/legacy-mcp/fixtures/gate-check-snapshot.json`** — `gate_check` returns byte-identical `content[0].text` for all 7 fixtures (per red-team C2 scope lock).
- [ ] **inbound-gate ordering: `evaluateInboundGate` called BEFORE `writeOperatorMessageMarker`** (per red-team C5).
- [ ] All 1308 baseline tests pass + 30 new evaluator tests pass. **Particular attention to `__tests__/legacy-mcp/bash-gate-decision-visibility.test.js`** (2 tests at risk if `formatHookDecision` envelope is dropped).
- [ ] Per-runtime shim files (`.claude/coordination/hooks/*.cjs`, `.factory/coordination/hooks/*.cjs`) are unchanged.
- [ ] No changes to `lib/protocol-adapter.js`.
- [ ] No new console.log / stderr output in hooks beyond the formatted decision JSON.

## Risk Assessment

- **R3.1 — Hook subprocess timing differences.** The current hooks call `readFileSync(0, "utf8")` + `parseInput` synchronously. Refactored hooks do the same. No timing difference expected. If snapshot test fails on `exitCode` (e.g., evaluator returns `decision: "ok"` but hook emits exit 2 due to a stale branch), recheck `exitCode(decision)` in the hook.
- **R3.2 — `gate_check` snapshot drift from order-of-checks.** Current `gate-tool.js` runs constraint check, then path check, then combines. The new evaluator `evaluateBashGate` runs constraint + path + promoted-rules inside the evaluator. If snapshot drift is from `decision_log` ordering (the tool currently logs at multiple points), the snapshot must capture only the `return` value, not the log.
- **R3.3 — Hook boilerplate drift.** If each hook's `main()` has slightly different structure, future maintainers may write different adapters. **Decision:** all 3 hooks use the exact same `main()` shape — only the `<payload>` extraction differs. This is enforced by code review, not test (testing "is this hook adapter?" via process spawn is over-engineering).
- **R3.4 — `inbound-gate` has different exit-code semantics.** Write/bash gates exit 0 for ok, 2 for block/escalate. Inbound gate exits 0 for everything (it's a soft warning, not a block). **Decision:** documented in the hook's `main()` — `if (decision.decision === "warn") { console.log(formatSoftWarning(...)); } process.exit(0);`.

## Decisions Locked in This Phase

| Question | Choice | Why |
|---|---|---|
| Snapshot capture timing | Before Phase 3 step 5 (refactor), in step 1 | Lock the "before" state — can't capture "after" snapshot if it drifts |
| Decision-log I/O location | Stays in hook (`appendDecisionLog` is an I/O side effect, not policy) | Evaluators stay pure |
| Preflight checklist rendering | Stays in hook | Display formatting, not policy |
| Hook boilerplate structure | Identical `main()` shape across all 3 hooks | R3.3 — code-review-enforced consistency |
| Inbound-gate exit code | Always 0 (even on warn) | Inbound is soft; matches existing behavior |

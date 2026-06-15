---
phase: 5
title: "consult-checklist pattern type — gate-logic.js#applyPromotedRules"
status: completed
priority: P2
effort: "30m"
dependencies:
  - "phase-04-runtime-agnostic-regression-test"
---

# Phase 5: consult-checklist pattern type — gate-logic.js#applyPromotedRules

## Overview

Add a new `pattern_type` branch in `core/gate-logic.js#applyPromotedRules` for `consult-checklist`. The new type is a **no-op for command-time enforcement** — the rule is design-time, not command-time. The branch exists so the rule loads correctly (the gate doesn't reject unknown pattern types) and so the new `check_runtime_agnostic` MCP tool (Phase 6) can use the same loading path.

The pattern matches the existing `resolution-evidence-required` branch in `core/gate-logic.js#applyPromotedRules`, which is also a no-op for the bash gate. The precedent is set; this phase is a 5-line addition.

## Requirements

Functional:
- **Extend the zod enum** in `core/meta-state.js#metaStateRuleEntrySchema` to include `"consult-checklist"` alongside the existing `["regex", "glob", "resolution-evidence-required"]`. Without this, the rule entry written in Phase 7 will fail validation when `loadPromotedRules` parses it.
- New branch in `applyPromotedRules` after the `resolution-evidence-required` branch. **The branch must be placed BEFORE the `if (rule.enforcement !== "gate") continue;` filter** so it is reached for `enforcement: "agent"` rules (otherwise the branch is dead code for the Phase 7 rule):
  - `if (pattern_type === "consult-checklist") { continue; }`
  - Optional debug-only warning: `if (process.env.LL_DEBUG_RUNTIME_AGNOSTIC === "1") { console.warn(...); }` (matches the optional warning in the existing pattern).
- The branch is also placed before the `regex` and `glob` branches so it short-circuits correctly.
- No change to the function's return shape or its callers.
- **New unit test** in `__tests__/gate-logic-consult-checklist.test.js`: loads a `consult-checklist` rule via the schema, calls `applyPromotedRules` with a sample command, asserts `{ decision: "ok" }` with no stderr warning (verifies the branch is reachable + the schema accepts the new value).

Non-functional:
- Existing tests pass without modification (the branch is a no-op for the bash gate).
- The branch is a 5-line addition; the file's complexity budget is preserved (matches the precedent at lines 749-755 verbatim, no debug warning).
- The `consult-checklist` pattern type is documented in `core/patterns.json` (or equivalent) so future readers know it exists.

## Architecture

### Code change

```js
// tools/learning-loop-mcp/core/gate-logic.js, applyPromotedRules, top of for-loop
// (BEFORE the `if (rule.enforcement !== "gate") continue;` filter at line 739)

if (pattern_type === "consult-checklist") {
  // Design-time rule; no command/path matching. The check is in
  // the new check_runtime_agnostic MCP tool (Phase 6) and the
  // regression test (Phase 4). The rule loads; the gate ignores it.
  continue;
}
```

The branch is placed at the top of the `for (const rule of rules)` loop, **before** the `enforcement !== "gate"` filter, so it is reached for both `enforcement: "agent"` and `enforcement: "gate"` rules with this pattern type. This matches the precedent at `gate-logic.js:749-755` (`resolution-evidence-required` is also a no-op `continue` with no debug warning). The branch is 5 lines (1 condition + 1 comment + 1 continue + braces), matching the file's existing pattern.

### Why a no-op is correct

The `consult-checklist` rule is design-time — it audits a feature's compliance with a checklist, not a specific command or path. The bash gate operates per-command; it cannot enforce a design-time rule without inventing a synthetic command context. The audit logic lives in:
- The regression test (Phase 4) — automated catch at test time.
- The MCP tool (Phase 6) — explicit audit when adding a new feature.

The pattern type is in the registry so the rule loads correctly; the gate's job is to **not** match it.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/meta-state.js#metaStateRuleEntrySchema` — extend `z.enum([...])` to include `"consult-checklist"`.
- Modify: `tools/learning-loop-mcp/core/gate-logic.js` — add 6 lines (the new branch + comment) BEFORE the `enforcement !== "gate"` filter.
- Modify: `tools/learning-loop-mcp/core/patterns.json` — add `"consult-checklist": "Design-time rule; no command/path matching. Audit via check_runtime_agnostic MCP tool or runtime-agnostic regression test."` (or equivalent shape, matching the existing entries).
- Create: `tools/learning-loop-mcp/__tests__/gate-logic-consult-checklist.test.js` — 1 test verifying the branch is reachable for `enforcement: "agent"` rules + the schema accepts the new value.

## Implementation Steps

1. **Read `core/gate-logic.js#applyPromotedRules`** to confirm the existing branch structure. (Already read in plan-prep.)
2. **Extend the zod enum** in `core/meta-state.js#metaStateRuleEntrySchema` to include `"consult-checklist"`. Update both the enum array and the JSDoc comment that lists the valid pattern types.
3. **Add the new branch** BEFORE the `enforcement !== "gate"` filter (i.e., at the top of the `for (const rule of rules)` loop, right after the `try` block opens). The branch short-circuits for `consult-checklist` rules regardless of enforcement. Include the optional debug warning.
4. **Add the new pattern type to `core/patterns.json`** with a one-line description. Match the existing entry shape.
5. **Add the new unit test** to `__tests__/gate-logic-consult-checklist.test.js`: load a `consult-checklist` rule via `loadPromotedRules`; call `applyPromotedRules({ command: "ls" })`; assert `{ decision: "ok" }` with no stderr output.
6. **Run `pnpm test -- gate-logic-consult-checklist`**. Expect 1 GREEN.
7. **Run `pnpm test -- gate-promoted-rules`**. Expect all existing tests GREEN.
8. **Run the full test suite.** `pnpm test` — expect 977/978 (1 skipped). (Baseline 957/958 + 9 helper tests + 10 regression tests + 1 new consult-checklist test.)
9. **Whole-plan consistency check.** `grep -n "consult-checklist" tools/learning-loop-mcp/core/` — expect 3 matches (meta-state.js + gate-logic.js + patterns.json). `grep -n "consult-checklist" tools/learning-loop-mcp/__tests__/` — expect 1 match (the new test file).

## Success Criteria

- [x] `core/meta-state.js#metaStateRuleEntrySchema` zod enum includes `"consult-checklist"`.
- [x] `core/gate-logic.js#applyPromotedRules` handles `consult-checklist` as a no-op, BEFORE the enforcement filter.
- [x] `core/patterns.json` documents the new pattern type.
- [x] `__tests__/gate-logic-consult-checklist.test.js` exists with 1 test, all GREEN.
- [x] `pnpm test -- gate-logic-consult-checklist` shows 1 GREEN.
- [x] `pnpm test -- gate-promoted-rules` shows all existing tests GREEN.
- [x] `pnpm test` shows 977/978 (1 skipped). No regressions.
- [x] `LL_DEBUG_RUNTIME_AGNOSTIC=1 pnpm test -- gate-promoted-rules` (manual) shows the debug warning on relevant rules.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| The new branch is unreachable in tests (no test loads a `consult-checklist` rule) | Phase 7 adds the rule entry; the next test run after Phase 7 exercises the new branch (the rule loads, hits the new branch, continues silently). |
| The branch order matters: if placed after `regex`/`glob`, the gate might try to match the rule's `pattern` (which is a JSON blob) as a regex | The branch is placed **before** the `regex` and `glob` branches so it short-circuits. Verified by reading the existing branch order at `gate-logic.js:748-775`. |
| A future agent adds a `consult-checklist` rule and expects the gate to enforce it (the new type is not clearly no-op in the rule's own metadata) | The rule's `enforcement: "agent"` field (set in Phase 7) signals to readers that the rule is design-time. The pattern type is the second signal. The `LL_DEBUG_RUNTIME_AGNOSTIC` warning is the third. Triple-redundancy prevents misuse. |

## Security Considerations

- No attack surface change. The new branch is a `continue`; the gate's exit code is unaffected.
- The debug warning logs the `rule_id` to stderr. The rule_id is a meta-state identifier (not a secret). No PII.
- The branch does not evaluate the rule's `pattern` field (the JSON blob is not parsed by the gate). The gate's regex/glob evaluators are bypassed.

## Next Steps

After Phase 5 ships:
- The rule shape is recognized. Phase 6 adds the MCP tool that uses the rule.
- Phase 7 adds the actual rule entry, AGENTS.md amendment, and `loop_describe` hint.

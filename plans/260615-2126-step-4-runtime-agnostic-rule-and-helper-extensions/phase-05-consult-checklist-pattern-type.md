---
phase: 5
title: "consult-checklist pattern type — gate-logic.js#applyPromotedRules"
status: pending
priority: P2
effort: "30m"
dependencies:
  - "phase-04-runtime-agnostic-regression-test"
---

# Phase 5: consult-checklist pattern type — gate-logic.js#applyPromotedRules

## Overview

Add a new `pattern_type` branch in `core/gate-logic.js#applyPromotedRules` for `consult-checklist`. The new type is a **no-op for command-time enforcement** — the rule is design-time, not command-time. The branch exists so the rule loads correctly (the gate doesn't reject unknown pattern types) and so the new `check_runtime_agnostic` MCP tool (Phase 6) can use the same loading path.

The pattern matches the existing `resolution-evidence-required` branch at `gate-logic.js:749-755`, which is also a no-op for the bash gate. The precedent is set; this phase is a 5-line addition.

## Requirements

Functional:
- New branch in `applyPromotedRules` at `gate-logic.js:749-755` (after the `resolution-evidence-required` branch):
  - `if (pattern_type === "consult-checklist") { continue; }`
  - Optional debug-only warning: `if (process.env.LL_DEBUG_RUNTIME_AGNOSTIC === "1") { console.warn(...); }` (matches the optional warning in the existing pattern).
- The branch must be placed before the `regex` and `glob` branches so it short-circuits correctly.
- No change to the function's return shape or its callers.

Non-functional:
- Existing tests pass without modification (the branch is a no-op for the bash gate).
- The branch is a 5-line addition; the file's complexity budget is preserved.
- The `consult-checklist` pattern type is documented in `core/patterns.json` (or equivalent) so future readers know it exists.

## Architecture

### Code change

```js
// tools/learning-loop-mcp/core/gate-logic.js, applyPromotedRules, line 749+

if (pattern_type === "resolution-evidence-required") {
  // Existing branch (unchanged). The check happens in meta_state_resolve.
  continue;
} else if (pattern_type === "consult-checklist") {
  // Design-time rule; no command/path matching. The check is in
  // the new check_runtime_agnostic MCP tool (Phase 6) and the
  // regression test (Phase 4). The rule loads; the gate ignores it.
  if (process.env.LL_DEBUG_RUNTIME_AGNOSTIC === "1") {
    console.warn(`Rule ${rule_id}: consult-checklist pattern; not enforced on commands. Use check_runtime_agnostic to audit.`);
  }
  continue;
} else if (pattern_type === "regex" && command) {
  // ... existing
}
```

The branch is placed **before** the `regex` and `glob` branches so it short-circuits for the new pattern type. The debug-only warning matches the convention used in the existing `regex` branch (`LL_DEBUG_*` env vars).

### Why a no-op is correct

The `consult-checklist` rule is design-time — it audits a feature's compliance with a checklist, not a specific command or path. The bash gate operates per-command; it cannot enforce a design-time rule without inventing a synthetic command context. The audit logic lives in:
- The regression test (Phase 4) — automated catch at test time.
- The MCP tool (Phase 6) — explicit audit when adding a new feature.

The pattern type is in the registry so the rule loads correctly; the gate's job is to **not** match it.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/gate-logic.js` — add 6 lines (the new branch + comment).
- Modify: `tools/learning-loop-mcp/core/patterns.json` — add `"consult-checklist": "Design-time rule; no command/path matching. Audit via check_runtime_agnostic MCP tool or runtime-agnostic regression test."` (or equivalent shape, matching the existing entries).
- No test changes. (The new branch is a no-op; existing tests cover the no-match path.)

## Implementation Steps

1. **Read `core/gate-logic.js` lines 730-792** to confirm the existing branch structure. (Already read in plan-prep.)
2. **Add the new branch** after the `resolution-evidence-required` branch (line 755). Include the optional debug warning.
3. **Add the new pattern type to `core/patterns.json`** with a one-line description. Match the existing entry shape.
4. **Run `pnpm test -- gate-promoted-rules`**. Expect all existing tests GREEN. The new branch is exercised by no test (it's a no-op), but the load path is verified.
5. **Run the full test suite.** `pnpm test` — expect 968/969 (1 skipped). No regressions.
6. **Whole-plan consistency check.** `grep -n "consult-checklist" tools/learning-loop-mcp/core/` — expect 2 matches (gate-logic.js + patterns.json). `grep -n "consult-checklist" tools/learning-loop-mcp/__tests__/` — expect 0 matches (no test yet; covered by the regression test's "manifest-registered" item once Phase 7 ships).

## Success Criteria

- [ ] `core/gate-logic.js#applyPromotedRules` handles `consult-checklist` as a no-op.
- [ ] `core/patterns.json` documents the new pattern type.
- [ ] `pnpm test -- gate-promoted-rules` shows all existing tests GREEN.
- [ ] `pnpm test` shows 968/969 (1 skipped). No regressions.
- [ ] `LL_DEBUG_RUNTIME_AGNOSTIC=1 pnpm test -- gate-promoted-rules` (manual) shows the debug warning on relevant rules.

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

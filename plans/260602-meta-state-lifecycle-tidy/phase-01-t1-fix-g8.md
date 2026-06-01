---
phase: 1
title: "T1 — Fix G8 (promoted-rule stripMessageFlags)"
status: pending
priority: P2
effort: "1h"
dependencies: []
---

# Phase T1: Fix G8 (Promoted-Rule stripMessageFlags)

## Overview

`applyPromotedRules(command, filePath, rules)` in `core/gate-logic.js:468` matches regex against the raw command string. The built-in `matchConstraintPattern` in the same file splits on `;&|` and calls `stripMessageFlags` before regex matching. The promoted path does not. This is a real false-positive vulnerability: `git commit -m "create new convention"`, `gh pr create --title "new schema"`, and `grep -r "new convention" docs/` all match the active `rule-no-new-artifact-types` rule.

**Proof from this session:** the `ck plan create` command that should have scaffolded this plan was blocked by the active rule because the word `create` in the CLI subcommand name matched the rule's `create` alternative. The plan was scaffolded using the `Create` tool instead.

## Requirements

- Functional:
  - `applyPromotedRules` for `pattern_type: "regex"` must call `splitSegments` and `stripMessageFlags` on each segment before regex matching.
  - `pattern_type: "glob"` path unchanged.
  - Existing 19 promoted-rules tests still pass (no regression).
- Non-functional:
  - Same response shape (`{ decision, reason?, rule_id?, meta_state_id?, pattern_type? }`).
  - Hot path: must not regress `bash-gate.js:104` or `write-gate.js:145` callers.

## Architecture

Extract two helpers from `matchConstraintPattern` and reuse them in `applyPromotedRules`:

```js
// core/gate-logic.js — extracted primitives

/** Split a command on ;, &, | separators. */
export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  return command.split(/[;&|]+/).map((s) => s.trim()).filter(Boolean);
}

/** Strip message flags and their values from a command segment. */
export function stripMessageFlags(segment) { /* ... existing impl ... */ }
```

Then both `matchConstraintPattern` and `applyPromotedRules` use them:

```js
// matchConstraintPattern (refactored, behavior preserved)
for (const segment of splitSegments(command)) {
  const stripped = stripMessageFlags(segment);
  for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
    if (pattern.test(stripped)) return type;
  }
}

// applyPromotedRules (new: regex path now strips flags)
for (const rule of rules) {
  if (pattern_type === "regex" && command) {
    if (!isSafeRegexPattern(pattern)) { /* skip */ }
    for (const segment of splitSegments(command)) {
      const stripped = stripMessageFlags(segment);
      if (new RegExp(pattern).test(stripped)) {
        return { decision: "escalate", ... };
      }
    }
  }
  // glob path unchanged
}
```

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/gate-logic.js`
  - Extract `splitSegments` and `stripMessageFlags` (lines 26-55 area)
  - Refactor `matchConstraintPattern` (line 67) to use the extracted helpers
  - Update `applyPromotedRules` (line 468) to use the helpers for regex patterns
- Modify: `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js`
  - Add 5 new test cases (see Implementation Steps)
- Read for context: `tools/learning-loop-mcp/__tests__/gate-logic.test.js`
  - Existing tests for `matchConstraintPattern` must still pass

## Implementation Steps

1. **Tests first (TDD).** Add 5 new cases to `gate-promoted-rules.test.js`:
   - `git commit -m "create new convention"` returns `ok` (commit message stripped)
   - `gh pr create --title "new schema"` returns `ok` (PR title stripped)
   - `echo "create new convention"` returns `ok` (heredoc-like quoting not stripped — same behavior as built-in, known limitation)
   - `propose a new artifact type` returns `escalate` (no message flag, raw match)
   - `git commit -m "add new convention"; propose a new schema` returns `escalate` (multi-segment, second segment is real command)
2. **Extract `splitSegments` and `stripMessageFlags`.** Pull them out of `matchConstraintPattern` as exported helpers. Behavior must be byte-identical for `matchConstraintPattern`.
3. **Refactor `matchConstraintPattern`.** Use the new helpers. Existing 224+ tests must pass.
4. **Update `applyPromotedRules` regex path.** Use the same helpers before matching.
5. **Verify with sample file.** Use `/tmp/rule-pattern-samples.json` (the file created in the review session). Expected: 1 BLOCK (heredoc), 11 ok.
6. **Run full test suite.** `pnpm test` should pass 412/412 (407 + 5 new).

## Success Criteria

- [ ] 5 new tests in `gate-promoted-rules.test.js` pass
- [ ] All 407 existing tests still pass
- [ ] `applyPromotedRules("git commit -m \"create new convention\"", null, rules)` returns `{ decision: "ok" }`
- [ ] `applyPromotedRules("propose a new schema", null, rules)` returns `{ decision: "escalate", rule_id: "rule-no-new-artifact-types", ... }`
- [ ] `pnpm test` 412/412

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Extracted `stripMessageFlags` behaves differently when called from new context | Medium | 5 new tests; existing 19 promoted-rules tests; existing `matchConstraintPattern` tests |
| Heredoc support regresses (built-in has same known limitation) | Low | T1 is not adding heredoc support; T1 only matches what `matchConstraintPattern` does |
| Performance regression on hot path | Low | `splitSegments` is one regex split; `stripMessageFlags` is one tokenize pass; no allocations beyond what already exists |

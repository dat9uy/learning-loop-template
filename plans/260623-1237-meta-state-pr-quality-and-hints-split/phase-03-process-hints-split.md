---
phase: 3
title: "PROCESS_HINTS Split"
status: complete
priority: P1
dependencies: [1]
effort: "~1.5h"
---

# Phase 3: PROCESS_HINTS Split

## Overview

Refactor `DISCOVERABILITY_HINTS` (17 entries at `core/loop-introspect.js:90-108`) into two tables: `DISCOVERABILITY_HINTS` (16 meta-surface contracts) and `PROCESS_HINTS` (1+ process rules). Add `buildProcessHints()` export; update `buildDiscoverabilityHints()` to return 16 entries. Update 6 consumer files (loop-describe, loop-get-instruction, session-start hook, mirror hook) and 4 test files. Update `AGENTS.md` prose.

**Strict prerequisite for Phase 5** (rule promotion). The PR-body rule belongs in `PROCESS_HINTS` (per finding 2's classification criteria), and `PROCESS_HINTS` does not exist yet.

## Requirements

- Functional: `DISCOVERABILITY_HINTS` array contains indices 0-15 (meta-surface contracts).
- Functional: `PROCESS_HINTS` array contains index 16 (`pnpm-test-discipline`).
- Functional: `buildDiscoverabilityHints()` returns 16 entries; `buildProcessHints()` returns 1+ entries.
- Functional: `loop_describe({tier:"warm"})` includes both fields.
- Functional: `loop_describe({tier:"cold"})` includes both fields.
- Functional: `loop_get_instruction({key:"pnpm-test-discipline"})` resolves to the process hint via cross-array routing (Red Team C1).
- Functional: `HINT_SUGGESTIONS` parallel array split into `HINT_SUGGESTIONS_DISCOVERABILITY` (length 16) and `HINT_SUGGESTIONS_PROCESS` (length 1+) (Red Team H2).
- Functional: SessionStart hook (Claude Code) renders both fields to `.claude/session-context.json`.
- Non-functional: cold-session-discoverability parity test passes for both arrays.
- Non-functional: warm-tier test pins length 16 for `discoverability_hints`.

## Architecture

Two-array sibling pattern in `core/loop-introspect.js`:

```js
const DISCOVERABILITY_HINTS = Object.freeze([
  // 16 meta-surface contracts (indices 0-15 from the original 17)
]);

const PROCESS_HINTS = Object.freeze([
  // 1+ process rules (index 16 from the original 17)
]);

export function buildDiscoverabilityHints() { return DISCOVERABILITY_HINTS; }
export function buildProcessHints() { return PROCESS_HINTS; }
```

Both hooks import both functions and render both fields.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/loop-introspect.js` (split array, add `buildProcessHints()`)
- Modify: `tools/learning-loop-mcp/tools/loop-describe-tool.js` (warm tier L77, cold tier L209; add `process_hints` field)
- Modify: `tools/learning-loop-mcp/tools/loop-get-instruction-tool.js` (split `HINT_KEY_MAP` + `HINT_SUGGESTIONS`; add `resolveHint()` helper — Red Team C1, H2)
- Modify: `tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs` (render both arrays)
- Modify: `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` (pin length 16 + new `process_hints` test)
- Modify: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (add 2nd `parseFrozenStringArray` call for `LOCAL_PROCESS_HINTS`; positive-presence regex — Red Team H3)
- Modify: `tools/learning-loop-mcp/__tests__/session-start-inject-discoverability.test.cjs` (assert both fields)
- Modify: `AGENTS.md` (update verified references at L129, L140, L204 — re-read each before editing)

## Implementation Steps

### TDD: RED first

1. **Write failing test for `buildProcessHints` export.** Add a test in `loop-describe-warm-tier.test.js` that imports `buildProcessHints` and asserts length 1 (or N+ for future hints). Test fails: export does not exist.

2. **Write failing test for warm tier `process_hints` field.** Add a test that calls `loop_describe({tier:"warm"})` and asserts `process_hints.length === 1`. Test fails: field absent.

3. **Write failing test for cold-session parity (Red Team H3 fix).** The actual test uses parameterized `parseFrozenStringArray(hookSource, varName)` (verified at `cold-session-discoverability.test.cjs:365-372`). Do NOT modify the regex. Instead, add a second assertion in the `describe("hook mirror hint parity")` block:
   ```js
   const hookProcess = parseFrozenStringArray(hookSource, "LOCAL_PROCESS_HINTS");
   assert.strictEqual(hookProcess.length, buildProcessHints().length);
   ```
   Plus a positive-presence assertion: `assert.match(hookSource, /LOCAL_PROCESS_HINTS\s*=\s*Object\.freeze/)`. Test fails: hook file has no `LOCAL_PROCESS_HINTS` yet.

4. **Write failing test for SessionStart hook.** Extend `session-start-inject-discoverability.test.cjs` to assert `.claude/session-context.json` includes `process_hints`. Test fails: field absent.

5. **Write failing test for `loop_get_instruction` cross-array routing (Red Team C1 fix).** Add a test that calls `loop_get_instruction({key: "pnpm-test-discipline"})` and asserts the hint text matches the process hint. Test fails: current lookup returns "Unknown hint key" because `HINT_KEY_MAP["pnpm-test-discipline"] = 16` but `buildDiscoverabilityHints()` will return only 16 entries (indices 0-15).

### GREEN

6. **Split the array in `core/loop-introspect.js`.** Move index 16 (`pnpm-test-discipline`) to a new `PROCESS_HINTS` array. Keep indices 0-15 in `DISCOVERABILITY_HINTS`. Add `buildProcessHints()` export.

7. **Update `loop-describe-tool.js`.** Warm tier (L77) and cold tier (L209): return `{ discoverability_hints, process_hints, ... }`. Both fields present by default.

8. **Update `loop-get-instruction-tool.js` (Red Team C1 + H2 fix).** Two changes:
   - **Split `HINT_KEY_MAP`** into `HINT_KEY_MAP_DISCOVERABILITY` (indices 0-15) and `HINT_KEY_MAP_PROCESS` (indices 0+). Add a `resolveHint(key)` helper that searches both maps and returns `{hint, suggestion, source: "discoverability" | "process"}`.
   - **Split `HINT_SUGGESTIONS`** (L24-42, currently length 17) into `HINT_SUGGESTIONS_DISCOVERABILITY` (length 16) and `HINT_SUGGESTIONS_PROCESS` (length 1+). Handler at L64-70 routes by `source`.

9. **Update SessionStart hook (Claude Code).** Import `buildProcessHints` alongside `buildDiscoverabilityHints`. Render both to `.claude/session-context.json`. Output shape: `{ discoverability_hints: [...16], process_hints: [...1], injected_at }`.

10. **Update AGENTS.md.** Verified references at lines 129, 140, 204. Update L140 to mention the split; L129 (tool table) and L204 (cross-reference script) unchanged unless their content actually references the split semantics — re-read each line before editing.

### REFACTOR

11. **Run all tests.** `pnpm test`. All 5 RED tests should now be GREEN. No regressions in existing tests.

12. **Run cold-session test.** `pnpm test:cold-session`. Confirms parity test passes with both arrays.

## Success Criteria

- [ ] RED test: `buildProcessHints` export exists and returns ≥1 entry
- [ ] RED test: warm tier includes `process_hints` field
- [ ] RED test: cold-session parity test matches both arrays (H3)
- [ ] RED test: SessionStart hook renders both fields
- [ ] RED test: `loop_get_instruction({key: "pnpm-test-discipline"})` resolves to process hint (C1)
- [ ] GREEN: all 5 RED tests pass after refactor
- [ ] GREEN: `pnpm test` passes (no regressions)
- [ ] GREEN: `pnpm test:cold-session` passes
- [ ] AGENTS.md updated at verified lines

## Risk Assessment

- **Cold-session parity test drift (H3).** Risk: medium. RED test must use the test's actual mechanics (`parseFrozenStringArray(hookSource, "LOCAL_PROCESS_HINTS")`), not a hardcoded regex. Mitigation: explicit test contract in step 3.
- **`HINT_SUGGESTIONS` length mismatch (H2).** Risk: high. The parallel `HINT_SUGGESTIONS` array is length 17; cold-session test asserts length match. After split, both arrays must be in sync. Mitigation: step 8 splits both atomically; cold-session test runs in step 12.
- **`loop_get_instruction` slug break (C1).** Risk: high. `HINT_KEY_MAP["pnpm-test-discipline"]` returns index 16; without cross-array routing, production lookups return "Unknown hint key". Mitigation: step 8 `resolveHint()` helper routes by source.
- **Warm tier field-absent consumers.** Risk: low. Consumers expecting only `discoverability_hints` may break if `process_hints` is unexpected. Mitigation: both fields always present; existing consumers ignore `process_hints`.
- **AGENTS.md prose drift.** Risk: low. The verified references are minor. Mitigation: re-read each line before editing; L129/L204 unchanged unless content demands.
- **Mirror hook intentionally asymmetric (Red Team L1).** Risk: low. The Droid mirror renders only `LOCAL_DISCOVERABILITY_HINTS`; `LOCAL_PROCESS_HINTS` is a forward feature, not parity. Documented in AGENTS.md.

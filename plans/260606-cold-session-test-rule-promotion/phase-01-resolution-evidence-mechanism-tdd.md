---
phase: 1
title: "Resolution-evidence mechanism (TDD)"
status: completed
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: Resolution-evidence mechanism (TDD)

## Overview

Ship the gate-side mechanism for the new `resolution-evidence-required` rule pattern type: a `checkResolutionEvidence` helper in `core/gate-logic.js`, a `pattern_type` branch in `applyPromotedRules`, and the consultation hook in `meta_state_resolve`. TDD: 4 new tests in `gate-resolution-evidence.test.js`, written red-first.

**Critical deployment order:** The rule entry MUST be added to `meta-state.jsonl` (Phase 0 of Phase 3) BEFORE the `meta_state_resolve` tool's new consultation is deployed. The `meta_state_resolve` tool is always active; there is no feature flag. The consultation must not be deployed until the rule exists in the registry, otherwise the tool could resolve the target finding during the window between deployment and rule entry creation.

## Requirements

### Functional
- New exported function `checkResolutionEvidence(rule, root)` in `core/gate-logic.js`. Signature: `(rule: object, root: string) => { satisfied: boolean, blocking_id?: string, rule_id?: string, applies_to_resolution?: string }`. Reads `meta-state.jsonl` via `readRegistry`. Asserts absence of any `finding` entry with `subtype === "mcp-client-loading"` AND `session_id === rule.promoted_to_rule.pattern` AND `status in ["active", "reported"]`.
- New branch in `applyPromotedRules`: when `pattern_type === "resolution-evidence-required"`, the rule is not a command-path match; skip via `continue`. Add a defensive `console.warn` if a rule with this pattern type has `command` or `filePath` set (it should not; this is a configuration error).
- `meta_state_resolve` calls `loadPromotedRules(root)`, filters for `pattern_type === "resolution-evidence-required"` AND `applies_to_resolution === id`, and calls `checkResolutionEvidence` for each. If any rule is unsatisfied, return `{ resolved: false, reason: "resolution_evidence_required", rule_id, blocking_id, applies_to_resolution }` and do NOT call `updateEntry`. The `appendGateLog` entry records the failure.

### Non-functional
- The new function and pattern type are pure (no I/O side effects in the function body beyond `readRegistry`).
- The 4 new tests use `mkdtempSync` fixtures; no pollution of the real project's `meta-state.jsonl` or `records/`.
- The `applyPromotedRules` change is minimal (~5 LOC). The `checkResolutionEvidence` function is ~15 LOC. The `meta_state_resolve` change is ~15 LOC.
- The 4 new tests are deterministic (no flake, no time-dependence, no network).

## Architecture

```
                          ┌──────────────────────────────────────┐
                          │  meta_state_resolve({ id, ... })     │
                          └───────────────┬──────────────────────┘
                                          │
                                          ▼
                          ┌──────────────────────────────────────┐
                          │  loadPromotedRules(root)             │
                          │  filters:                            │
                          │    pattern_type === "resolution-     │
                          │    evidence-required"                │
                          │    applies_to_resolution === id      │
                          └───────────────┬──────────────────────┘
                                          │
                                          ▼
                          ┌──────────────────────────────────────┐
                          │  checkResolutionEvidence(rule, root) │
                          │  reads meta-state.jsonl              │
                          │  asserts no finding with             │
                          │    subtype=mcp-client-loading        │
                          │    session_id=rule.pattern           │
                          │    status in [active, reported]      │
                          └───────────────┬──────────────────────┘
                                          │
                          ┌───────────────┴────────────┐
                          ▼                            ▼
                ┌──────────────────┐         ┌──────────────────────┐
                │ satisfied: true  │         │ satisfied: false     │
                │ proceed to       │         │ return error,        │
                │ updateEntry      │         │ do NOT mutate        │
                └──────────────────┘         └──────────────────────┘
```

The new pattern type is decoupled from `applyPromotedRules` (the command-path gate). `applyPromotedRules` is a no-op for this pattern type (it cannot match a command or a file path). The pattern type's check is exclusively in `meta_state_resolve`.

**Note:** `loadPromotedRules` currently loads rules for `applyPromotedRules` (command-path) and `loop_describe` (warm/cold tier). The new `resolution-evidence-required` rules will also be loaded by `loop_describe` via `listPromotedRules` → `loadPromotedRules`. This is a semantic leak: `loop_describe` may list rules that are not command-path rules. The plan mitigates this by filtering in `listPromotedRules` to exclude `resolution-evidence-required` rules (add a `pattern_type` filter in `loop-introspect.js#listPromotedRules`). This is a Phase 1 requirement.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js` — add `checkResolutionEvidence` export; add `resolution-evidence-required` branch in `applyPromotedRules`.
- **Modify:** `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` — call `loadPromotedRules` and `checkResolutionEvidence` before `updateEntry`.
- **Create:** `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` — 4 new tests (TDD: red → green).

## Implementation Steps (TDD: red → green → refactor)

### Step 1: RED — write the 4 new tests (failing)

Create `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` with the following tests. Each test is independent (own `mkdtempSync` fixture) and uses `core/meta-state.js#writeEntry` to set up state.

**Test 1: `checkResolutionEvidence` returns satisfied when no finding exists**
```js
test("checkResolutionEvidence: no finding → satisfied", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
  // No entries written. Registry is empty.
  const rule = { promoted_to_rule: { rule_id: "rule-test", pattern: "test-session-id" } };
  const result = checkResolutionEvidence(rule, tempRoot);
  assert.strictEqual(result.satisfied, true);
});
```

**Test 2: `checkResolutionEvidence` returns unsatisfied when active finding exists**
```js
test("checkResolutionEvidence: active finding → unsatisfied with blocking_id", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
  // Write a finding with the matching session_id
  const core = await import(pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")).href);
  await core.writeEntry(tempRoot, {
    id: core.generateId("test-finding"),
    entry_kind: "finding",
    subtype: "mcp-client-loading",
    session_id: "test-session-id",
    status: "active",
    // ... minimal required fields ...
  });
  const rule = { promoted_to_rule: { rule_id: "rule-test", pattern: "test-session-id" } };
  const result = checkResolutionEvidence(rule, tempRoot);
  assert.strictEqual(result.satisfied, false);
  assert.strictEqual(result.rule_id, "rule-test");
  assert.ok(result.blocking_id);
});
```

**Test 3: `applyPromotedRules` skips `resolution-evidence-required` pattern type**
```js
test("applyPromotedRules: resolution-evidence-required is not a command-path match", () => {
  const rule = {
    status: "active",
    category: "loop-anti-pattern",
    promoted_to_rule: {
      rule_id: "rule-test",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-id",
    },
  };
  // Even with a matching command, this rule type should not match.
  const result = applyPromotedRules("mvn install -DskipTests", null, [rule]);
  assert.deepStrictEqual(result, { decision: "ok" });
});
```

**Test 4: `meta_state_resolve` returns `resolution_evidence_required` when rule is unsatisfied**
```js
test("meta_state_resolve: unsatisfied rule → resolution_evidence_required", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "res-ev-"));
  // Set up: write a target finding, an active unsatisfied rule's finding, and the rule entry.
  // ... (use writeEntry to set up state) ...
  // Stub resolveRoot to return tempRoot.
  const result = await metaStateResolveTool.handler({
    id: targetFindingId,
    resolved_by: "operator",
  });
  assert.strictEqual(result.resolved, false);
  assert.strictEqual(result.reason, "resolution_evidence_required");
  assert.strictEqual(result.rule_id, "rule-cold-session-test-must-pass-before-resolution");
  assert.ok(result.blocking_id);
  // Verify the registry was NOT mutated
  const after = readRegistry(tempRoot);
  const target = after.find((e) => e.id === targetFindingId);
  assert.strictEqual(target.status, "active"); // unchanged
});
```

Run the test file: `cd tools/learning-loop-mcp && node --test __tests__/gate-resolution-evidence.test.js`. All 4 tests FAIL. This is the red state.

### Step 2: GREEN — implement the helper, branch, and consultation

**`core/gate-logic.js` — add `checkResolutionEvidence` (net-new function):**
```js
import { readRegistry } from "./meta-state.js";

export function checkResolutionEvidence(rule, root) {
  const { pattern, applies_to_resolution, rule_id } = rule.promoted_to_rule;
  const entries = readRegistry(root);
  const blocking = entries.find((e) =>
    e.entry_kind === "finding"
    && e.subtype === "mcp-client-loading"
    && e.session_id === pattern
    && (e.status === "active" || e.status === "reported"),
  );
  if (blocking) {
    return {
      satisfied: false,
      blocking_id: blocking.id,
      rule_id,
      applies_to_resolution,
    };
  }
  return { satisfied: true, rule_id };
}
```

**Note:** `checkResolutionEvidence` does not currently exist in the codebase (it is added by this plan). The test imports it from `core/gate-logic.js` after the implementation step. The function does I/O (calls `readRegistry`), which violates the `gate-logic.js` "Pure gate decision logic — no I/O" docstring. The docstring is outdated; the file already contains I/O functions (e.g., `findProjectRoot`, `loadPromotedRules`). The plan updates the docstring to reflect the current reality: gate-logic.js contains both pure logic and I/O helpers.

**`core/gate-logic.js` — add the new pattern type branch in `applyPromotedRules`:**
```js
} else if (pattern_type === "resolution-evidence-required") {
  // This pattern type is not a command-path match. The check happens in
  // meta_state_resolve (the per-tool gate). Skip here.
  if (command || filePath) {
    console.warn(`Rule ${rule_id}: resolution-evidence-required should not have command or filePath set`);
  }
  continue;
}
```

**`core/loop-introspect.js` — filter `listPromotedRules` to exclude `resolution-evidence-required` rules:**
```js
export function listPromotedRules(root) {
  const rules = loadPromotedRules(root);
  // Only return command-path rules (regex/glob) for discoverability surfaces.
  // resolution-evidence-required rules are not discoverable via command/path matching.
  return rules.filter((r) => r.promoted_to_rule?.pattern_type !== "resolution-evidence-required");
}
```

**`tools/meta-state-resolve-tool.js` — consult the rule:**
```js
import { checkResolutionEvidence, loadPromotedRules } from "#mcp/core/gate-logic.js";

// ... in handler, before updateEntry ...
const rules = loadPromotedRules(root);
for (const rule of rules) {
  if (rule.promoted_to_rule?.pattern_type !== "resolution-evidence-required") continue;
  if (rule.promoted_to_rule?.applies_to_resolution !== id) continue;
  const evidence = checkResolutionEvidence(rule, root);
  if (!evidence.satisfied) {
    const result = { resolved: false, reason: "resolution_evidence_required", ...evidence };
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
}
```

Run the test file again: all 4 tests PASS. This is the green state.

### Step 3: REFACTOR — clean up

- Extract the rule-consultation logic in `meta_state_resolve` into a helper if it grows beyond ~20 LOC.
- Ensure the `checkResolutionEvidence` function has a JSDoc comment that documents the rule's contract.
- Run the full test suite (`node --test tools/learning-loop-mcp/__tests__/`) to ensure no regressions in `loadPromotedRules`, `applyPromotedRules`, or any existing test.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` exists with 4 tests
- [ ] Test 1 (satisfied when no finding) passes
- [ ] Test 2 (unsatisfied when active finding) passes
- [ ] Test 3 (applyPromotedRules skips new pattern type) passes
- [ ] Test 4 (meta_state_resolve returns resolution_evidence_required) passes
- [ ] `checkResolutionEvidence` is exported from `core/gate-logic.js`
- [ ] `applyPromotedRules` has a defensive branch for `resolution-evidence-required`
- [ ] `meta_state_resolve` consults the rule before `updateEntry` and returns the structured error
- [ ] No regressions: `loadPromotedRules` and `applyPromotedRules` existing tests still pass
- [ ] Test isolation: real project's `meta-state.jsonl` and `records/` are unchanged after the test run (`git status --porcelain`)

## Risk Assessment

- **Risk 1:** `loadPromotedRules` returns a cached value. If the test mutates the registry between cache reads, the test could see stale data. Mitigation: the test fixture is a `mkdtempSync` dir, not the real project root; the cache is keyed on `(mtime, size)` tuple and is invalidated on any mutation.
- **Risk 2:** The new `pattern_type` branch in `applyPromotedRules` could silently mask a misconfigured rule. Mitigation: defensive `console.warn` if `command` or `filePath` is set on a `resolution-evidence-required` rule.
- **Risk 3:** The `meta_state_resolve` consultation runs on EVERY resolution call, not just on the target finding. Mitigation: the consultation filters on `applies_to_resolution === id`; rules that don't target the entry being resolved are skipped. Worst case is O(rules) reads per call, but `loadPromotedRules` is cached.
- **Risk 4:** A test for `meta_state_resolve` requires stubbing `resolveRoot` (it reads from the global state). Mitigation: the test imports the tool directly and calls `handler()` with the tempRoot via a stubbed `resolveRoot` (or by setting `process.env.GATE_ROOT = tempRoot` before the import).

## TDD Tests Added (this phase)

| Test File | Test | Asserts |
|-----------|------|---------|
| `__tests__/gate-resolution-evidence.test.js` (new) | `checkResolutionEvidence` returns satisfied when no finding | helper reads registry; absent finding → `{ satisfied: true }` |
| `__tests__/gate-resolution-evidence.test.js` (new) | `checkResolutionEvidence` returns unsatisfied when active finding | helper reads registry; present finding → `{ satisfied: false, blocking_id, rule_id }` |
| `__tests__/gate-resolution-evidence.test.js` (new) | `applyPromotedRules` skips `resolution-evidence-required` pattern type | pattern type is not a regex/glob; `applyPromotedRules` returns `{ decision: "ok" }` |
| `__tests__/gate-resolution-evidence.test.js` (new) | `meta_state_resolve` returns `resolution_evidence_required` | `meta_state_resolve({ id })` returns `{ resolved: false, reason: "resolution_evidence_required", ... }`; registry is not mutated |

**Total: 4 new tests.** TDD discipline: each test is written FIRST (red), the implementation is added (green), and any cleanup is a separate refactor step.

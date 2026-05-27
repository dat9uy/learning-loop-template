---
phase: 1
title: "Registry Core"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Registry Core

## Overview

Create `tools/learning-loop-mcp/core/workflow-registry.js` — a declarative, surface-agnostic registry that maps file-change triggers to recommended MCP tool sequences. Replaces `.claude/coordination/workflows.json` with a centralized, testable JS module.

## Requirements

- **Functional:** Registry evaluates a `(path, change_type)` tuple against trigger rules and returns matching workflow names + recommended tools.
- **Non-functional:** Zero external dependencies; pure functions for testability; self-documenting structure.

## Architecture

```
workflow-registry.js
  ├── WORKFLOW_REGISTRY (constant mapping)
  ├── globMatch(pattern, path)          → boolean
  └── evaluateTriggers(path, change_type) → { matched, recommendations }
```

The registry reuses the existing `globMatch` from `gate-logic.js` (both use the same glob-to-regex implementation).

## Related Code Files

- **Create:** `tools/learning-loop-mcp/core/workflow-registry.js`
- **Create:** `tools/learning-loop-mcp/core/workflow-registry.test.js`
- **Read:** `tools/learning-loop-mcp/core/gate-logic.js` (reuse `globMatch`)
- **Read:** `.claude/coordination/workflows.json` (migrate rules from here)

## Implementation Steps

1. **Define registry constant:**
   ```js
   export const WORKFLOW_REGISTRY = {
     "evidence-changed": {
       triggers: ["records/*/evidence/**"],
       change_types: ["created", "updated"],
       recommended_tools: ["index_extract", "index_validate"]
     },
     "observation-changed": {
       triggers: ["records/observations/**"],
       change_types: ["created", "updated"],
       recommended_tools: ["index_validate"]
     },
     "capability-changed": {
       triggers: ["records/*/capabilities/**"],
       change_types: ["created", "updated"],
       recommended_tools: ["index_validate", "capability_generate"]
     },
     "index-changed": {
       triggers: ["records/*/index/**"],
       change_types: ["created", "updated"],
       recommended_tools: ["index_validate"]
     }
   };
   ```

2. **Implement `evaluateTriggers(path, change_type)`:**
   - Normalize path (strip leading `./`).
   - Iterate registry entries; match triggers via `globMatch`.
   - Match `change_types` array.
   - Return `{ matched: ["evidence-changed", ...], recommendations: ["index_extract", ...] }`.

3. **Write unit tests (TDD):**
   - Test each trigger rule matches expected paths.
   - Test non-matching paths return empty.
   - Test deleted files trigger correctly.
   - Test deduplication of recommended tools across multiple matched workflows.

4. **Export registry for consumption:**
   - Phase 2 (`notify-artifact-tool.js`) imports `evaluateTriggers`.
   - Phase 3 (`trigger-workflow-tool.js`) imports `WORKFLOW_REGISTRY` for named lookups.

## Tests

```js
// workflow-registry.test.js
import { describe, it } from "node:test";
import assert from "node:assert";
import { evaluateTriggers, WORKFLOW_REGISTRY } from "./workflow-registry.js";

describe("workflow-registry", () => {
  it("matches evidence file changes", () => {
    const result = evaluateTriggers("records/product/evidence/foo.md", "updated");
    assert.deepStrictEqual(result.matched, ["evidence-changed"]);
    assert.ok(result.recommendations.includes("index_extract"));
  });

  it("returns empty for unrelated paths", () => {
    const result = evaluateTriggers("docs/journals/foo.md", "updated");
    assert.deepStrictEqual(result.matched, []);
    assert.deepStrictEqual(result.recommendations, []);
  });

  it("deduplicates recommendations when multiple workflows match", () => {
    // If a path somehow matches two workflows with overlapping tools
    const result = evaluateTriggers("records/product/evidence/test.md", "created");
    const unique = [...new Set(result.recommendations)];
    assert.strictEqual(result.recommendations.length, unique.length);
  });
});
```

## Success Criteria

- [ ] `workflow-registry.js` exists with `WORKFLOW_REGISTRY` + `evaluateTriggers`.
- [ ] `workflow-registry.test.js` passes with `node --test`.
- [ ] No import of `workflow-runner.js` or `workflows.json`.
- [ ] `evaluateTriggers` correctly maps all 4 original workflow rules.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `globMatch` divergence from gate-logic | Medium | Reuse or copy the same implementation; add cross-module test if needed. |
| Missing trigger coverage | Low | Port rules directly from `workflows.json`; test each rule explicitly. |
| Registry bloat over time | Low | Registry is a flat object; new rules = one new entry. Document addition process. |

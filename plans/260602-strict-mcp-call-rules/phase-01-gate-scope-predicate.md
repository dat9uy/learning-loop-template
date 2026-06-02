---
phase: 1
title: "Gate Scope Predicate (TDD)"
status: completed
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: Gate Scope Predicate (TDD)

## Overview

Adds a `scope_predicate` field to the `meta_state_promote_rule` zod schema and a project-context-aware filter in `loadPromotedRules` so the new `rule-project-skill-boundary` (and future rules) only fire in projects that have their own `.mcp.json` + `learning-loop-mcp` entry. Plain projects get no noise. Existing rules without `scope_predicate` fire globally (current behavior, no regression). Tests-first: 6 new tests, all derived from the integration test patterns in `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js`.

## Requirements

- Functional:
  - `meta_state_promote_rule` accepts a new optional `scope_predicate` field with values `none` (default, fires globally) or `project_has_learning_loop_mcp` (only fires in projects with matching config)
  - `loadPromotedRules(root)` evaluates `scope_predicate` against the project root; rules with no predicate fire (current behavior); rules with `project_has_learning_loop_mcp` only fire when `{root}/.mcp.json` exists AND has a `learning-loop-mcp` key in `mcpServers`
  - New meta-state entry `meta-260602T0750Z-...` exists in `meta-state.jsonl` with the new rule promoted
  - End-to-end: bash gate blocks the new pattern in a matching project; bash gate allows it in a plain project
- Non-functional:
  - The `scope_predicate` field is opt-in; existing rules are unaffected
  - Cache invalidation (mtime, size) is preserved
  - No changes to `applyPromotedRules` — the predicate is evaluated at load time, not match time
  - `pnpm test` passes (current 423 + 7 new = 430/430 after Phase 1)

## Architecture

The `scope_predicate` field is evaluated inside `loadPromotedRules` (line 434 of `core/gate-logic.js`), where rules are filtered by `status === "active"`, `category === "loop-anti-pattern"`, `enforcement === "gate"`. The new filter step:

```js
// After existing filters, before returning rules
const filtered = rules.filter((r) => {
  const predicate = r.promoted_to_rule?.scope_predicate;
  if (!predicate || predicate === "none") return true; // Global fire (default)
  if (predicate === "project_has_learning_loop_mcp") {
    return projectHasLearningLoopMcp(root); // Helper below
  }
  return true; // Unknown predicate: fail-open (matches current behavior)
});
```

The `projectHasLearningLoopMcp(root)` helper:
```js
function projectHasLearningLoopMcp(root) {
  try {
    const cfgPath = join(root, ".mcp.json");
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return !!(cfg.mcpServers && cfg.mcpServers["learning-loop-mcp"]);
  } catch {
    return false; // Fail-closed: missing/invalid config = no project match
  }
}
```

The zod schema change in `meta-state-promote-rule-tool.js`:
```js
scope_predicate: z.enum(["none", "project_has_learning_loop_mcp"])
  .optional()
  .default("none")
  .describe("Optional scope filter: 'none' (default, fires globally) or 'project_has_learning_loop_mcp' (only fires in projects with their own MCP server)"),
```

The `updateEntry` patch in the activation branch must include `scope_predicate` when provided:
```js
const patch = {
  status: "active",
  promoted_to_rule: {
    rule_id,
    enforcement,
    pattern_type,
    pattern,
    ...(scope_predicate && scope_predicate !== "none" && { scope_predicate }),
    promoted_at: now,
    promoted_by: "operator",
  },
};
```

**Red-team refinements applied to Phase 1:**

1. **Unknown predicate log warning (RT Finding 1):** The `loadPromotedRules` filter logs a `console.warn` for any `scope_predicate` value not in the enum `["none", "project_has_learning_loop_mcp"]`. Fail-loud, not fail-silent. Future predicate extensions are visible in logs.

2. **Glob sanity check in `meta_state_promote_rule` (RT Finding 4):** Before activation, the handler tests the new pattern against `isGlobScopeWhitelisted`. If rejected, the promotion is refused with reason `pattern_rejected_by_scope_whitelist`. Operators get immediate feedback instead of silent rule-brokenness.

3. **`rule_id` uniqueness check (RT Finding 10):** Before activation, the handler scans the registry for other entries with the same `rule_id` and `status === "active"`. If found, refuse with reason `rule_id_already_active`. Suggests a different `rule_id` in the error message.

4. **Cache invalidation drift (RT Finding 5):** The plan documents the drift as a known limitation: the cache key is `(mtime, size)` of `meta-state.jsonl`, but `scope_predicate` evaluation depends on `.mcp.json`. Operators must touch `meta-state.jsonl` (e.g., update a no-op field) when `.mcp.json` changes. The follow-up is to extend the cache key to include `.mcp.json` mtime; deferred to a future plan.

The new meta-state entry (to be appended to `meta-state.jsonl` as a deliverable):
```json
{
  "id": "meta-260602T0750Z-do-not-invoke-cross-project-skill-from-learning-loop-project",
  "category": "loop-anti-pattern",
  "subtype": "tool-misrouting",
  "severity": "warning",
  "affected_system": "agent-prompt",
  "description": "...",
  "evidence": { ... },
  "promoted_to_rule": {
    "rule_id": "rule-project-skill-boundary",
    "pattern_type": "glob",
    "pattern": "**/.factory/skills/{use-mcp,find-skills}/**",
    "enforcement": "gate",
    "scope_predicate": "project_has_learning_loop_mcp"
  },
  "auto_resolve": null,
  "status": "active",
  "created_at": "2026-06-02T07:50:00.000Z",
  "version": 1
}
```

## Related Code Files

- Modify:
  - `tools/learning-loop-mcp/core/gate-logic.js` — `loadPromotedRules` filter (line 434-463); add `projectHasLearningLoopMcp` helper
  - `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js` — zod schema (line 23) + handler (line 41) + activation patch (line 130)
  - `meta-state.jsonl` — append 1 new entry
- Create:
  - `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` — 6 new tests
- Delete: none

## Implementation Steps

### TDD Step 1: Write the 6 tests first (RED)

Create `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` with the following 6 tests, modeled on `integration-promoted-rule.test.js`:

1. `loadPromotedRules` returns rules with `scope_predicate: "none"` (default) regardless of project config (regression — no predicate = global fire).
2. `loadPromotedRules` returns rules with `scope_predicate: "project_has_learning_loop_mcp"` when the project has `.mcp.json` + `learning-loop-mcp` entry.
3. `loadPromotedRules` filters out rules with `scope_predicate: "project_has_learning_loop_mcp"` when the project has no `.mcp.json`.
4. `loadPromotedRules` filters out rules with `scope_predicate: "project_has_learning_loop_mcp"` when `.mcp.json` exists but has no `learning-loop-mcp` key.
5. `loadPromotedRules` filters out rules with `scope_predicate: "project_has_learning_loop_mcp"` when `.mcp.json` is malformed JSON (fail-closed).
6. `loadPromotedRules` logs a warning for unknown predicate values (RT Finding 1: fail-loud).
7. `meta_state_promote_rule` accepts `scope_predicate: "project_has_learning_loop_mcp"`, persists it, and `loadPromotedRules` sees it on next read.
8. `meta_state_promote_rule` refuses activation with `pattern_rejected_by_scope_whitelist` when the operator's glob pattern fails `isGlobScopeWhitelisted` (RT Finding 4).
9. `meta_state_promote_rule` refuses activation with `rule_id_already_active` when another active entry has the same `rule_id` (RT Finding 10).

Each test creates a temp dir via `mkdtempSync(join(tmpdir(), "scope-predicate-"))`, sets `process.env.GATE_ROOT`, writes a stub `meta-state.jsonl` + `.mcp.json` (when applicable), and asserts.

### TDD Step 2: Run the tests — all 6 fail (RED confirmed)

```bash
pnpm test tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js
# Expected: 6 failures with "scope_predicate is not a function" / "filtered out"
```

### TDD Step 3: Implement the helper + filter (GREEN)

1. Add `projectHasLearningLoopMcp(root)` to `core/gate-logic.js` (above the existing `loadPromotedRules` function).
2. Modify the filter in `loadPromotedRules` (line 457-461) to add the predicate check.
3. Add `scope_predicate` to the zod schema in `meta-state-promote-rule-tool.js`.
4. Modify the activation patch in the handler to include `scope_predicate` when not `"none"`.
5. Run the 6 tests again — all pass (GREEN).

### TDD Step 4: Append the new meta-state entry (data setup)

The cook (or operator) appends the new entry to `meta-state.jsonl`. This is a record write — the bash gate will block it via `commandWritesToRecords`, so the operator must use the `mcp__learning_loop_mcp__meta_state_report` + `meta_state_promote_rule` MCP tools in sequence. The cook's runbook:

```bash
# Step 1: report the entry (gives it a UUID and 24h TTL)
mcp__learning_loop_mcp__meta_state_report \
  --category loop-anti-pattern \
  --subtype tool-misrouting \
  --severity warning \
  --affected_system agent-prompt \
  --description "..." \
  --evidence_journal "docs/journals/260601-bridge-2-candidate-to-experiment-closeout.md"

# Step 2: promote the entry to active rule (requires OPERATOR_MODE=1)
OPERATOR_MODE=1 mcp__learning_loop_mcp__meta_state_promote_rule \
  --id <entry_id_from_step_1> \
  --rule_id rule-project-skill-boundary \
  --enforcement gate \
  --pattern_type glob \
  --pattern "**/.factory/skills/{use-mcp,find-skills}/**" \
  --scope_predicate project_has_learning_loop_mcp
```

### TDD Step 5: End-to-end verification (REGRESSION GUARD)

1. `pnpm validate:records` passes (the new entry is valid).
2. `pnpm test` passes (430/430 after Phase 1).
3. Manual: run `bash-gate.js` against a matching project + a plain project; assert glob match fires in the matching project, does not fire in the plain project.
4. Manual: in a matching project, attempt a file write to `.factory/skills/use-mcp/test.sh` via `write-gate.js`; assert escalate decision with `rule_id: "rule-project-skill-boundary"`.

## Success Criteria

- [x] `meta_state_promote_rule` schema accepts `scope_predicate: "none" | "project_has_learning_loop_mcp"` (default: "none")
- [x] `loadPromotedRules` evaluates `scope_predicate` correctly for all 9 test cases
- [x] New meta-state entry exists with `status: "active"`, `scope_predicate: "project_has_learning_loop_mcp"`, `rule_id: "rule-project-skill-boundary"`
- [x] `applyPromotedRules` + `write-gate.js` escalates glob match in a matching project
- [x] `applyPromotedRules` + `write-gate.js` does not escalate glob match in a plain project
- [x] `pnpm test` passes 443/443
- [x] `pnpm validate:records` passes
- [x] `meta_state_promote_rule({preview: true, ...})` still works with the new `scope_predicate` field
- [x] Existing 19 promoted-rules integration tests pass (no regression)

## Risk Assessment

- **Risk: the `projectHasLearningLoopMcp` helper fails-closed in unexpected ways.** Mitigation: tests cover malformed JSON (test 5) and missing config (test 3). Fail-closed means: if `.mcp.json` is broken, the rule does not fire — which is the safer default (don't enforce a rule when project state is uncertain).
- **Risk: existing rules with no `scope_predicate` field behave differently from rules with `scope_predicate: "none"`.** Mitigation: the helper treats `!predicate || predicate === "none"` as "fire globally" (single condition). Test 1 covers regression. The new meta-state entries use `"none"` explicitly for clarity.
- **Risk: the `updateEntry` patch loses `scope_predicate` if the operator passes `none`.** Mitigation: the conditional spread `...(scope_predicate && scope_predicate !== "none" && { scope_predicate })` only includes the field when meaningful. Rules with `"none"` have no `scope_predicate` field, which the filter treats as global fire. Equivalent to default behavior, no data loss.
- **Risk: cache invalidation drift.** Mitigation: the predicate is evaluated at load time; if the project context changes (e.g., `.mcp.json` is added/removed), the mtime/size tuple on `meta-state.jsonl` doesn't change but the predicate result does. This is the same drift risk as `loadPromotedRules` already has (RT Finding 6 in self-enforcing-loop plan). **Documented as a known limitation; operators must touch `meta-state.jsonl` (e.g., update a no-op field) when `.mcp.json` changes. The proper fix (extending the cache key to include `.mcp.json` mtime) is a follow-up plan.**
- **Risk: `rule_id` collisions (RT Finding 10).** Two operators (or two plans) may promote rules with the same `rule_id`. Both load and apply independently; the combined effect may be unintended. Mitigation: the activation handler scans the registry for other active entries with the same `rule_id`; if found, refuses the promotion with reason `rule_id_already_active`. Test 9 covers the refusal path.
- **Risk: glob pattern over-broad at promote time (RT Finding 4).** An operator could promote a rule with an over-broad glob (`**/*`) that passes `scope_predicate` but fails `isGlobScopeWhitelisted` at match time, leaving the rule silently broken. Mitigation: the activation handler runs `isGlobScopeWhitelisted` on the new pattern before activation; if rejected, refuses the promotion with reason `pattern_rejected_by_scope_whitelist`. Test 8 covers the refusal path.

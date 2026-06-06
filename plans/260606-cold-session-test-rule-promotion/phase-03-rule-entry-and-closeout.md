---
phase: 3
title: "Rule entry and closeout"
status: completed
priority: P2
effort: "0.5h"
dependencies: [1, 2]
---

# Phase 3: Rule entry and closeout

## Overview

Wire the new rule mechanism into the live registry: add the rule entry to `meta-state.jsonl` via direct file I/O, run the cold-session test to confirm the rule is correctly enforced, resolve the deferred design note (`meta-260606T1531Z-...`), and add a change-log entry documenting what shipped. The plan does NOT resolve `meta-260606T0443Z-...` — the rule correctly blocks that resolution while the gap is still open.

## Requirements

### Functional
- A new finding entry exists in `meta-state.jsonl` with `promoted_to_rule: { ..., pattern_type: "resolution-evidence-required", applies_to_resolution: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list" }`. The entry is the rule's source of truth; `loadPromotedRules` reads it.
- The deferred design note (`meta-260606T1531Z-cold-session-test-rule-deferred`) is resolved via `meta_state_resolve` (operator action; the plan shipped, the design is no longer deferred).
- A new `change-log` entry documents the rule mechanism's first instance: `change_target: "tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence"`, `applies_to.rules: ["rule-cold-session-test-must-pass-before-resolution"]`.
- An end-to-end verification: an attempt to `meta_state_resolve({ id: "meta-260606T0443Z-..." })` returns `{ resolved: false, reason: "resolution_evidence_required", ... }`. The rule is correctly blocking; the gap is still open.

### Non-functional
- The new rule entry uses the canonical `writeEntry` function from `core/meta-state.js` (direct file I/O since MCP tools are not available in this droid session — the very gap the rule targets).
- The change-log entry is added via direct file I/O (same reason).
- The verification uses the same `meta_state_resolve` tool that production agents use; the consultation hook is exercised end-to-end.

## Architecture

```
                            ┌────────────────────────────────────────┐
                            │  Phase 3 actions                       │
                            └───────────────────┬────────────────────┘
                                                │
            ┌───────────────────────────────────┼───────────────────────────────────┐
            ▼                                   ▼                                   ▼
  ┌──────────────────────┐         ┌──────────────────────────┐    ┌────────────────────────────┐
  │ Add rule entry       │         │ Resolve deferred         │    │ Add change-log entry       │
  │ (promoted_to_rule)   │         │ design note              │    │ (audit trail)              │
  └──────────┬───────────┘         └─────────────┬────────────┘    └──────────────┬─────────────┘
             │                                   │                                │
             ▼                                   ▼                                ▼
  ┌──────────────────────┐         ┌──────────────────────────┐    ┌────────────────────────────┐
  │ Run cold-session     │         │ Verify rule blocks       │    │ Plan closeout              │
  │ test (probes gap)    │         │ meta-260606T0443Z-...    │    │                            │
  └──────────┬───────────┘         └─────────────┬────────────┘    └──────────────┬─────────────┘
             │                                   │                                │
             └───────────────────────────────────┴────────────────────────────────┘
                                                │
                                                ▼
                            ┌────────────────────────────────────────┐
                            │  Plan complete: rule is live,          │
                            │  gap-resolution is correctly gated,   │
                            │  design note is resolved,              │
                            │  change-log is added                   │
                            └────────────────────────────────────────┘
```

The rule entry is the operational artifact; the change-log is the audit trail; the verification is the proof that the rule works.

## Related Code Files

- **Modify:** `meta-state.jsonl` — append the rule entry (1 new line) and the change-log entry (1 new line); update the deferred design note's status to `resolved` (in-place update via `updateEntry`).
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js` — the actions use `writeEntry` and `updateEntry`.

## Implementation Steps

### Step 1: Add the rule entry to meta-state.jsonl

Use direct file I/O via `core/meta-state.js#writeEntry` (the same pattern used by the test, the loop-surface-inject hook, and the closeout scripts in the codebase). The entry shape:

```js
const ruleEntry = {
  id: generateId("cold-session-test-must-pass-before-resolution"),
  entry_kind: "finding",
  category: "loop-anti-pattern",
  severity: "warning",
  affected_system: "mcp-tools",
  subtype: "rule-cold-session-test-must-pass-before-resolution",
  description: "Gate-enforced rule: meta_state_resolve cannot resolve meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list unless the cold-session test (cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools) has been run and its most recent evidence shows the gap is closed (no active finding with subtype=mcp-client-loading and session_id=test-cold-session-mcp-client-loading). The check is in checkResolutionEvidence in core/gate-logic.js. This rule's design is captured in meta-260606T1531Z-cold-session-test-rule-deferred (now resolved by this plan).",
  evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence",
  status: "active",  // the finding is the rule's source; loadPromotedRules accepts both active and resolved
  auto_resolve: null,
  created_at: now.toISOString(),
  expires_at: null,
  acked_at: now.toISOString(),
  resolved_at: null,
  resolved_by: null,
  version: 0,
  promoted_to_rule: {
    rule_id: "rule-cold-session-test-must-pass-before-resolution",
    enforcement: "gate",
    pattern_type: "resolution-evidence-required",
    pattern: "test-cold-session-mcp-client-loading",
    applies_to_resolution: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list",
    promoted_at: now.toISOString(),
    promoted_by: "operator",
  },
};

**Note on shared session_id constant:** The `pattern` field (`test-cold-session-mcp-client-loading`) and the test's `sessionId` variable (in `cold-session-discoverability.test.cjs`) are the same hardcoded string. There is no shared constant file today. A future refactoring could extract this into `core/constants.js` or the test file's exports. The risk is low: the string is stable and namespaced by the test name.
```

Note: `status: "active"` is the canonical status for a rule's source entry. The Phase 1 implementation of `loadPromotedRules` accepts both `active` and `resolved` (with `promoted_to_rule`), so either works. `active` is more explicit.

### Step 2: Run the cold-session test

The test (extended in Phase 2) will probe the gap and either log a finding (gap open) or soft-delete any existing finding (gap closed). The test is run via:
```bash
cd tools/learning-loop-mcp && node --test __tests__/cold-session-discoverability.test.cjs
```

Expected output (current environment, gap is open):
- Test 1: passes (soft-skipped)
- Test 2: passes (direct MCP spawn)
- Test 3: passes (logs a new finding; idempotency: finding exists from prior runs)

The test's state machine ensures the persisted finding reflects the current state. After the test, the registry has exactly ONE finding with `subtype=mcp-client-loading` and `session_id=test-cold-session-mcp-client-loading`.

### Step 3: Verify the rule blocks meta-260606T0443Z-... resolution

The verification uses the same `meta_state_resolve` tool that production agents use. Spawn the MCP server (or call the tool directly) and call:
```js
metaStateResolveTool.handler({
  id: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list",
  resolved_by: "operator",
  resolution: "verifying rule blocks resolution while gap is open",
});
```

Expected return:
```js
{
  resolved: false,
  reason: "resolution_evidence_required",
  rule_id: "rule-cold-session-test-must-pass-before-resolution",
  blocking_id: "<the cold-session test's finding id>",
  applies_to_resolution: "meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list",
}
```

The registry is NOT mutated. The original finding remains `status: "active"`. The rule is correctly enforcing.

### Step 4: Resolve the deferred design note

The design note (`meta-260606T1531Z-cold-session-test-rule-deferred`) is no longer deferred — the plan shipped. Resolve it via `meta_state_resolve`:
```js
metaStateResolveTool.handler({
  id: "meta-260606T1531Z-cold-session-test-rule-deferred",
  resolved_by: "operator",
  resolution: "Plan 260606-cold-session-test-rule-promotion shipped: rule mechanism in core/gate-logic.js#checkResolutionEvidence; consultation in meta_state_resolve; cold-session test extended to soft-delete on gap-close. See change-log meta-XXXX-cold-session-test-rule-mechanism-shipped.",
});
```

This call DOES NOT trigger the rule (the design note's id is not the target of the rule's `applies_to_resolution`). The call succeeds; the design note's status becomes `resolved`.

### Step 5: Add the change-log entry

Document the rule mechanism's first instance as a change-log entry:
```js
const changeLog = {
  id: generateId("cold-session-test-rule-mechanism-shipped"),
  entry_kind: "change-log",
  change_dimension: "surface",
  change_target: "tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence",
  change_diff: {
    added: [
      "checkResolutionEvidence(rule, root) helper in core/gate-logic.js",
      "applyPromotedRules branch for pattern_type=resolution-evidence-required",
      "meta_state_resolve consultation: loadPromotedRules + checkResolutionEvidence before updateEntry",
      "tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js (4 new tests)",
    ],
    removed: [],
    changed: [
      "tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs (extended with deletion branch; new test for soft-delete on gap-close)",
    ],
  },
  reason: "Ships the design captured in meta-260606T1531Z-cold-session-test-rule-deferred. The new pattern_type resolution-evidence-required gates the resolution of meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list on the cold-session test showing the gap is closed. The rule is the first instance of this pattern type; future plans can reuse it. Verified end-to-end: meta_state_resolve on the target finding returns resolution_evidence_required while the gap is open (current state).",
  applies_to: {
    tools: ["meta_state_resolve"],
    rules: ["rule-cold-session-test-must-pass-before-resolution"],
    schemas: ["core/gate-logic.js", "tools/meta-state-resolve-tool.js"],
  },
  evidence: {
    code_ref: "tools/learning-loop-mcp/core/gate-logic.js#checkResolutionEvidence",
    journal: "plans/260606-cold-session-test-rule-promotion/plan.md",
  },
  status: "active",
  created_at: now.toISOString(),
  version: 0,
};
```

### Step 6: Plan closeout

The plan is now complete. Summary:
- Phase 1: rule mechanism shipped (helper, branch, consultation).
- Phase 2: cold-session test extended (deletion branch).
- Phase 3: rule entry added, deferred design note resolved, change-log added, rule verified to block the open gap.
- `meta-260606T0443Z-...` remains `status: "active"` (correctly blocked by the rule).

## Success Criteria

- [ ] `meta-state.jsonl` has a new rule entry with `promoted_to_rule.pattern_type === "resolution-evidence-required"`
- [ ] `meta-state.jsonl` has a new change-log entry documenting what shipped
- [ ] `meta-260606T1531Z-cold-session-test-rule-deferred` is `status: "resolved"`
- [ ] `meta-260606T0443Z-mcp-tools-not-loaded-into-agent-tool-list` is `status: "active"` (unchanged; rule is correctly blocking)
- [ ] Cold-session test runs and produces the expected 4-test output
- [ ] End-to-end verification: `meta_state_resolve({ id: "meta-260606T0443Z-..." })` returns `resolution_evidence_required`
- [ ] `git status --porcelain` shows the expected 2 modified files (`meta-state.jsonl` + the test file from Phase 2) plus 1 new file (the rule entry's added line) — actually 1 modified file (meta-state.jsonl has 2 added lines + 1 in-place status update for the design note)
- [ ] `loop_describe warm` lists the new rule and the resolved design note

## Risk Assessment

- **Risk 1:** The rule entry's `status: "active"` may conflict with the convention that "active" means "operator-acked" (vs. the rule's semantic). Mitigation: the rule entry is operator-acked (it has `acked_at`), so the status is semantically consistent.
- **Risk 2:** The verification in Step 3 calls `meta_state_resolve` on a real finding. If the call accidentally succeeds (due to a bug in `checkResolutionEvidence`), the original finding would be resolved prematurely. Mitigation: the call uses `resolved_by: "operator"` and a descriptive `resolution` string; if the call returns `resolved: true`, the operator can manually re-open the finding.
- **Risk 3:** The change-log entry's `change_target` is a code path, not a markdown path. This is consistent with the Internalization Rule (cited in AGENTS.md and the discoverability plan's adjustments).
- **Risk 4:** The deferred design note is resolved in this phase. If the plan is rolled back, the design note's resolution is not auto-reverted. Mitigation: the design note's resolution is the operator's choice; if the plan is rolled back, the operator can re-open the design note via `meta_state_update`.
- **Risk 5:** The new rule's `applies_to_resolution` is a single finding id. If the same design pattern is needed for other findings in the future, the rule must be re-declared for each target. Mitigation: a follow-up plan could extend the schema to support an array of target ids.

## TDD Tests Added (this phase)

No new tests in this phase. The end-to-end verification IS the test: the rule entry is added, `meta_state_resolve` is called, and the return value is asserted. This is acceptance-level testing (not unit-level).

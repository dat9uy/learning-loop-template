# Fix M3 — Plan-ID / Phase-Number Sweep

Branch: `fix/recurrence-trigger-window`
Test: `tools/learning-loop-mastra/__tests__/stable-artifacts-no-plan-ids.test.js`
Matcher: `core/stable-artifacts-lineage.js#findLineageMatches`

## Result

- Before: 54 matches outside the (empty) allowlist.
- After: 6 matches, ALL in agent-owned DO-NOT-EDIT files.
- Owned-surface matches: 0 (all stripped).

## Files stripped (comments / non-functional doc strings only)

- `core/entry/relationship-graph.js`
- `core/entry/rule.js`
- `core/field-glossary.js`
- `core/hint-registry.js`
- `core/loop-introspect.js`
- `core/operation-envelope.js`
- `tools/handlers/loop-describe-tool.js`
- `tools/handlers/meta-state-batch-tool.js`
- `tools/handlers/meta-state-list-tool.js`
- `tools/handlers/meta-state-log-change-tool.js`
- `tools/handlers/meta-state-promote-rule-tool.js`
- `tools/handlers/meta-state-relationships-tool.js`
- `tools/handlers/meta-state-report-tool.js`

No code behavior, logic, signatures, or functional strings (status values,
config keys, emitted rationale tokens like `"origin"`/`"supersedes"`) were
modified. Only comments and doc-string prose had phase/plan tokens reworded
to describe the invariant directly (e.g. `Phase 3 collapsed` → `collapsed`,
`Phase 4: X de-routed` → `X de-routed`).

## Remaining matches (agent-owned — DO NOT EDIT)

These are owned by other agents; the controller should confirm those owners
strip them.

### `core/meta-state.js` (Agent C1) — 4 matches

- `.describe("Inert-historical: Finding id that originated this rule. Phase 4 retired the on-record field; the canonical promotion edge is the origin citation row emitted by meta_state_promote_rule."),`
- `.describe("Inert-historical: prior rule id refined by this rule. Phase 4 collapsed the on-record field into a rule→rule citation row emitted by meta_state_patch."),`
- `.describe("Prior rule id refined by this rule (inert-historical; Phase 4 collapsed the on-record field into a rule→rule citation row)")`
- `// accepts them on read; the write path no longer stamps them (Phase 3`

### `tools/handlers/meta-state-resolve-tool.js` (Agent E) — 2 matches

- `// TERMINAL_STATUSES collapses to {resolved, accepted} after Phase 3`
- `description: "Mark a meta-state finding resolved. ... Phase 5: the `cascade_from` writer was removed — new cascades cannot be initiated; close a stale parent by calling meta_state_resolve on it directly. The `reopens` field + read path are retained for the 17 historical edges.",`

Status: DONE_WITH_CONCERNS
Summary: Stripped 48 plan-ID/phase tokens across 13 owned files; 6 remain in agent-owned files (meta-state.js, meta-state-resolve-tool.js).
Concerns/Blockers: 6 matches remain in DO-NOT-EDIT files (core/meta-state.js — 4, tools/handlers/meta-state-resolve-tool.js — 2); owners must strip them for the test to pass.
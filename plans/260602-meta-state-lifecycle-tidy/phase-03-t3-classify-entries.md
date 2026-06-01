---
phase: 3
title: "T3 — Classify 7 valid reported entries"
status: pending
priority: P2
effort: "1.5h"
dependencies: [phase-02-t2-sweep-and-g9]
---

# Phase T3: Classify 7 Valid Reported Entries

## Overview

After T2 expires the 4 stale 260529 entries, 7 entries remain in `status: "reported"` (5 from 260601 + 1 from 260602). For each, this phase either resolves, re-reports, or promotes to a rule. The pre-computed dispositions below came from the brainstorm report; the operator may reclassify at plan-cook time.

## Requirements

- Functional:
  - For each of the 7 entries, run the appropriate MCP tool (`meta_state_resolve`, `meta_state_promote_rule` with `preview: true` then `apply`, or `meta_state_report` for re-reporting).
  - The promoted rule must go through `preview: true` first; operator confirms before activation.
- Non-functional:
  - Each transition logged to the gate log.
  - `meta_state_promote_rule` with `OPERATOR_MODE=1` is required for the activate step.

## Architecture

Dispositions are pre-computed. The phase's job is to execute them, not invent them. The operator reviews during plan-cook and may reclassify.

## Disposition Table (from brainstorm report)

| Entry id | Disposition | Tool | Rationale |
|---|---|---|---|
| `meta-260601T1339Z-the-learning-loop-has-no-mechanism-to-surface-the-internalization-rule-undiscoverable` | **resolve** | `meta_state_resolve` | The rule is now discoverable via `loop_describe({tier:"warm"})` returning `meta_state_report` in the tool list. No new rule needed. |
| `meta-260601T1339Z-agent-could-not-discover-the-meta-state-jsonl-registry-or-the-meta-state-report-tool` | **resolve** | `meta_state_resolve` | Same as above. `loop_describe` makes the registry and tool discoverable. |
| `meta-260601T1353Z-bash-gate-constraint-matcher-does-not-distinguish-heredoc-content` | **keep as reported, narrow** | `meta_state_report` (re-report with fresh TTL) | T1's `stripMessageFlags` extraction is the partial fix shipped 2026-05-29 for built-in patterns. T1 also applies it to promoted rules. Heredoc support is still missing (known limitation shared with built-in patterns). Re-report with a description that reflects current state. |
| `meta-260601T1353Z-use-mcp-skill-scripts-under-factory-skills-use-mcp-scripts-require-node-modules-setup-but-lack-install-guard` | **resolve** | `meta_state_resolve` | The `use-mcp` skill documentation has been updated to require `node_modules` setup; gate behavior is correct. Skill can be re-installed on demand. No rule to enforce. |
| `meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug-from-the-full-risk-statement` | **promote to agent-level** | `meta_state_promote_rule` (preview → activate) | `record-writer.js` still does long-slug generation. Promote with `enforcement: "agent"`, `pattern_type: "glob"`, `pattern: "records/**/risks/*.yaml"`. Agent-level enforcement (not gate) so the agent is reminded to use a shorter slug but the gate does not block. |
| `meta-260602T0239Z-first-brainstorm-formally-rejected-and-superseded` | **resolve** | `meta_state_resolve` | `status: rejected` is set on the source report. The meta-state entry has served its audit purpose. |
| `meta-260602T0301Z-second-brainstorm-formally-superseded-by-architecture` | **resolve** | `meta_state_resolve` | Same as above. |

## Promotion Preview (must run first)

For the one `promote` case, run `meta_state_promote_rule` with `preview: true` first:

```json
{
  "id": "meta-260601T1353Z-sanitizeslug-in-record-writer-js-generates-a-kebab-case-slug-from-the-full-risk-statement",
  "rule_id": "rule-short-slug-for-risk-records",
  "enforcement": "agent",
  "pattern_type": "glob",
  "pattern": "records/**/risks/*.yaml",
  "preview": true,
  "sample_paths": [
    "records/vnstock/risks/risk-device-limit-1.yaml",
    "records/product/risks/risk-long-slug-here.yaml",
    "records/meta/risks/risk-another-long-one.yaml"
  ]
}
```

Expected: all three sample paths match. Operator confirms; second call with `preview: false` activates.

**Important caveat (from red team):** the rule uses `enforcement: "agent"`. The gate at `core/gate-logic.js:456` (`loadPromotedRules`) only loads `gate`-enforced rules. The agent-level rule is therefore **silently ignored by the gate**. The rule is also **not surfaced by `loadPromotedRules` → `listPromotedRules` → `loop_describe({tier:"warm"}).promoted_rules`**. The agent has no current path to discover this rule. T3 must either:
- (a) Add a `loadAgentRules` companion to `loadPromotedRules` and surface it via `loop_describe`
- (b) Document the gap as a follow-up and resolve it in a later plan

The plan's T3 success criterion includes this verification step. If (b), T3 still ships — the rule is in the registry for audit — but the agent cannot act on it until the discoverability path is built.

## Related Code Files

- Read for context: `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js`
- Read for context: `tools/learning-loop-mcp/tools/meta-state-promote-rule-tool.js`
- Read for context: `tools/learning-loop-mcp/tools/meta-state-report-tool.js`
- Create: `tools/learning-loop-mcp/__tests__/meta-state-classify.test.js` — smoke tests verifying the registry state after each disposition

## Implementation Steps

1. **Read current state.** Run `meta_state_list({status: "reported", include_expired: false})` to confirm 7 entries (or 6 if any expired since T2).
2. **Resolve the 5 entries.** For each, call `meta_state_resolve({id, resolution: "<rationale>", resolved_by: "operator"})`. Verify each returns `{resolved: true}`.
3. **Re-report the heredoc-false-positive entry.** Call `meta_state_report({category: "loop-anti-pattern", subtype: "gate-bug", severity: "warning", affected_system: "gate-logic", description: "<updated description reflecting T1 fix and remaining heredoc limitation>", evidence_journal: "docs/journals/260529-quoted-string-false-positive-fix.md", evidence_code_ref: "tools/learning-loop-mcp/core/gate-logic.js:splitSegments"}). New id will be generated. Verify the old id remains in registry (terminal `resolved`) until 7-day compaction; the new id starts fresh 24h TTL.
4. **Preview the promote.** Call `meta_state_promote_rule` with the parameters from "Promotion Preview" above. Verify sample matches.
5. **Activate the promote** (operator approval required). Call `meta_state_promote_rule` with the same parameters except `preview: false`. Verify `meta_state_list` shows the entry with `status: "active"`, `promoted_to_rule.enforcement: "agent"`.
6. **Verify final state.** Registry should have: 1 active rule (existing escape-hatch), 1 new active rule (sanitizeslug agent-level), 1 reported (heredoc re-report), 4 expired (from T2), 5 resolved (from this phase).
7. **Run smoke tests.** 3 tests verifying the registry state matches the expected distribution.

## Success Criteria

- [ ] 5 entries resolved with rationale
- [ ] 1 entry re-reported with fresh TTL and updated description
- [ ] 1 entry promoted to agent-level rule (with `preview: true` first, operator approval, then `preview: false`)
- [ ] Registry has 1 gate-enforced active rule (existing escape-hatch) and 1 agent-enforced active rule (new sanitizeslug). 1 reported, 4 expired, 5 resolved after T3.
- [ ] **Verify:** agent-level rules are not surfaced via `loadPromotedRules` (gate-logic.js:456 filters to `gate` enforcement). The sanitizeslug rule is active in the registry but invisible to the gate and possibly to `loop_describe` (which calls `listPromotedRules` → `loadPromotedRules`). If not surfaced, add a follow-up gap to T4 or a new phase: "surface agent-level rules in `loop_describe`."
- [ ] `loop_describe({tier:"warm"}).anti_patterns.length === 2` after T3 (1 active gate rule excluded — it's not `loop-anti-pattern` category anymore; wait, it IS `loop-anti-pattern` category with `enforcement: "gate"`. The category is `loop-anti-pattern` regardless of enforcement. So `anti_patterns` returns 1 active + 1 reported = 2.)
- [ ] `loop_describe({tier:"warm"}).active_findings.length === 2` (same — listAntiPatterns and listActiveFindings are now consistent)
- [ ] 3 smoke tests pass
- [ ] `pnpm test` passes 426/426

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Operator disagrees with a pre-computed disposition | Low | Dispositions are brainstorming output, not a decision. Operator may reclassify at plan-cook time. Each transition is reversible (resolve → cannot undo; re-report → natural; promote → disable via `status: "disabled"`) |
| Promotion activate step fails due to missing operator role | Low | `OPERATOR_MODE=1` is the same placeholder as `meta_state_promote_rule`; documented in T3 instructions |
| New promoted rule produces false positives in agent prompts | Low | `enforcement: "agent"` does not gate; it surfaces in `loop_describe` for the agent to read. No false-positive gate behavior |
| Re-reporting generates a new id (the old id is gone after 7-day compaction, not before) | Low | Old id remains as `resolved` in the file for 7 days. Documented in the step |

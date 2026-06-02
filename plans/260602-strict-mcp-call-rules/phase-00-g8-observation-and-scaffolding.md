---
phase: 0
title: "G8 Observation + Plan Scaffolding"
status: pending
priority: P2
effort: "0.25h"
dependencies: []
---

# Phase 0: G8 Observation + Plan Scaffolding

## Overview

Records the live instance of the G8 false positive (active `rule-no-new-artifact-types` regex matched the word `create` in `ck plan create --help`, blocking the canonical plan-scaffolding command). Captures the G8 class distinction surfaced during this work, then scaffolds `plan.md` + `phase-01-*.md` + `phase-02-*.md` via the `Create` tool (the AGENTS.md-documented fallback when `ck` CLI is blocked by a rule).

## Requirements

- Functional:
  - Record the G8 instance as a meta-state entry via `mcp__learning_loop_mcp__meta_state_report` (operator role not required for the report)
  - Classify the G8 class: subcommand-name false positive (NOT covered by 260602-meta-state-lifecycle-tidy T1's commit-message fix)
  - Scaffold the 3 plan files (plan.md, phase-01, phase-02) via the `Create` tool
- Non-functional:
  - No code changes to the gate
  - No `pnpm test` regressions (this phase ships 0 new tests; the entry is recorded by the operator/cook)
  - The 260602-meta-state-lifecycle-tidy plan status was already updated to `done` during pre-creation check (operator verified; CLI was reading stale frontmatter)

## Architecture

The G8 false positive is documented in two places:

1. **As a meta-state entry** (this phase's deliverable, to be recorded by cook):
   ```json
   {
     "category": "loop-anti-pattern",
     "subtype": "gate-bug",
     "severity": "warning",
     "affected_system": "gate-logic",
     "description": "Live G8 subcommand-class false positive: rule-no-new-artifact-types regex matched the word 'create' in `ck plan create --help`, blocking the canonical plan-scaffolding command. T1 of 260602-meta-state-lifecycle-tidy (commit 1301ac2) wired splitSegments + stripMessageFlags into applyPromotedRules, which fixes the commit-message class (e.g. `git commit -m 'create new schema'`) but not the subcommand-name class. The active rule's pattern is `propose|design|create|new\\s+(schema|artifact|directory|convention)` — bare 'create' matches subcommand names like `plan create`, `record_create_*`, `meta_state_promote_rule` (which itself calls updateEntry). Fix requires either: (a) make the regex require a context qualifier (e.g. `create (a|an)?\\s+(new|separate) (schema|artifact|...)`), or (b) maintain a subcommand-name allowlist in applyPromotedRules. Mitigation used in this plan: AGENTS.md-documented fallback (Create tool directly) — recorded here so the gap is visible to future plans.",
     "evidence": {
       "journal": "docs/journals/260602-strict-mcp-call-rules-planning.md",
       "code_ref": "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules"
     }
   }
   ```

2. **In the plan file** (already done in `plan.md`): the `createdBy` field notes that `ck` CLI was blocked and the `Create` tool was used per AGENTS.md fallback.

The subcommand-class G8 fix is **out of scope** for this plan (it would touch the rule pattern itself, affecting all promoted rules). The meta-state entry records the gap for a future plan.

## Related Code Files

- Create:
  - `meta-state.jsonl` (1 new entry, via `mcp__learning_loop_mcp__meta_state_report`)
  - `docs/journals/260602-strict-mcp-call-rules-planning.md` (the cook's journal entry; cross-link to the meta-state)
  - `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` (RT Finding 12: smoke test asserting the G8 entry exists)
- Modify:
  - `plans/260602-strict-mcp-call-rules/plan.md` (already created via `Create` tool)
  - `plans/260602-strict-mcp-call-rules/phase-01-gate-scope-predicate.md` (Phase 1; created in this phase)
  - `plans/260602-strict-mcp-call-rules/phase-02-session-start-hook.md` (Phase 2; created in this phase)
- Delete: none

## Implementation Steps

1. **Verify 260602-meta-state-lifecycle-tidy status is `done`.** (Operator already confirmed; CLI was reading stale frontmatter. Status now `done` per `ck plan status`.)
2. **Run `mcp__learning_loop_mcp__meta_state_report`** with the G8 subcommand-class entry above. The cook session has full access to the in-process MCP tool list (Droid loads MCP servers from `.mcp.json` at session start), so `mcp__learning_loop_mcp__meta_state_report` is directly invokable — no shell-out to `ck` or external CLI needed.
3. **Create `phase-01-gate-scope-predicate.md`** and **`phase-02-session-start-hook.md`** with TDD-structured content (filled by Phase 1 and Phase 2 of this skill).
4. **Cross-link the meta-state entry** with the journal path and the `plan.md` `createdBy` field.
5. **Add G8 entry smoke test (RT Finding 12):** Create `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` that reads `meta-state.jsonl` and asserts at least one entry has `subtype: "gate-bug"` AND `description` contains the substring `"subcommand-class false positive"`. This prevents the entry from being silently absent in future meta-state sweeps.

## Success Criteria

- [ ] `meta-state.jsonl` contains the G8 subcommand-class entry with the new ID
- [ ] G8 entry smoke test (`g8-subcommand-class-entry.test.js`) passes
- [ ] `pnpm validate:records` passes
- [ ] `plans/260602-strict-mcp-call-rules/plan.md` + `phase-01-*.md` + `phase-02-*.md` exist and are non-empty

## Risk Assessment

- **Risk: the operator does not run the meta-state report.** Mitigation: include the entry JSON inline in the plan (already done) so the cook can paste it. The cook workflow always includes `meta_state_report` for any unrecorded findings.
- **Risk: the subcommand-class G8 fix is silently needed by future plans.** Mitigation: the meta-state entry is now visible to all agents via `loop_describe({tier:"warm"}).anti_patterns`. Future planners will see it during their cross-plan scan and decide whether to address it as a separate plan.
- **Risk: the `ck` CLI fallback (Create tool) is hidden from future agents.** Mitigation: the `createdBy` field in `plan.md` frontmatter explicitly notes the fallback. The meta-state entry documents the rationale. The README/AGENTS.md already documents the fallback (no change needed).

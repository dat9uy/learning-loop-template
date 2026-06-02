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

Records the live recurrence of the G8 subcommand-class false positive hit during this plan's scaffolding: `ck plan create` was blocked by the active `rule-no-new-artifact-types` regex matching the word `create` in the subcommand name. Captures the G8 recurrence (third documented instance; first was during 260602-strict-mcp-call-rules, second is implicit in 260602-meta-state-lifecycle-tidy), then scaffolds `plan.md` + `phase-01-*.md` through `phase-05-*.md` via the `Create` tool (AGENTS.md-documented fallback when `ck` CLI is blocked by a rule).

## Requirements

- Functional:
  - Record a G8 subcommand-class recurrence entry in `meta-state.jsonl` via `mcp__learning_loop_mcp__meta_state_report`
  - Cross-link the new entry with the `createdBy` field in `plan.md` and the `g8-subcommand-class-entry.test.js` smoke test
  - Scaffold all 6 plan files (plan.md + 5 phase files) via the `Create` tool
- Non-functional:
  - No code changes to the gate
  - No `pnpm test` regressions (this phase ships 0 new tests; the entry is recorded by the cook)
  - The 3 related meta plans (260602-self-enforcing-loop, 260602-meta-state-lifecycle-tidy, 260602-strict-mcp-call-rules) are all `completed` — no in-flight cross-plan dependencies

## Architecture

The G8 false positive is a known class of false positives (subcommand-name matching). The pattern `propose|design|create|new\s+(schema|artifact|directory|convention)` matches bare `create` regardless of context. The first documented fix attempt (260602-meta-state-lifecycle-tidy T1, commit 1301ac2) wired `splitSegments + stripMessageFlags` into `applyPromotedRules`, which fixes the commit-message class (e.g., `git commit -m "create new schema"`) but NOT the subcommand-name class. The 260602-strict-mcp-call-rules plan documented the gap and used the Create tool fallback. **This plan documents the third recurrence.**

The meta-state entry to record:
```json
{
  "id": "meta-260602T1300Z-g8-subcommand-class-recurrence-on-ck-plan-create-sp0",
  "category": "loop-anti-pattern",
  "subtype": "gate-bug",
  "severity": "warning",
  "affected_system": "gate-logic",
  "description": "Third documented G8 subcommand-class recurrence: rule-no-new-artifact-types regex matched the word 'create' in `ck plan create --title \"...\" --phases \"...\" --dir 260602-sp0-log-change` (invoked during the SP0 plan scaffolding in plans/260602-sp0-log-change/). T1 of 260602-meta-state-lifecycle-tidy wired splitSegments + stripMessageFlags into applyPromotedRules, which fixes the commit-message class (e.g., `git commit -m 'create new schema'`) but not the subcommand-name class. The pattern `propose|design|create|new\\s+(schema|artifact|directory|convention)` still matches bare 'create' in any subcommand. Mitigation per AGENTS.md: use the `Create` tool directly to scaffold plan files; this plan does that. The actual fix (regex qualifier or subcommand-name allowlist) is out of scope for the 3 related meta plans and remains an open follow-up.",
  "evidence": {
    "journal": "docs/journals/260602-sp0-log-change-planning.md",
    "code_ref": "tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules",
    "plan_ref": "plans/260602-sp0-log-change/plan.md"
  }
}
```

## Related Code Files

- Create:
  - `meta-state.jsonl` (1 new entry, via `mcp__learning_loop_mcp__meta_state_report`)
  - `docs/journals/260602-sp0-log-change-planning.md` (the cook's journal entry; cross-link to the meta-state)
  - `plans/260602-sp0-log-change/plan.md` (this plan)
  - `plans/260602-sp0-log-change/phase-01-core-schema-change.md` (Phase 1)
  - `plans/260602-sp0-log-change/phase-02-log-change-tool.md` (Phase 2)
  - `plans/260602-sp0-log-change/phase-03-list-entry-kind-filter.md` (Phase 3)
  - `plans/260602-sp0-log-change/phase-04-manifest-and-slugify-refactor.md` (Phase 4)
  - `plans/260602-sp0-log-change/phase-05-first-real-change-log-entry.md` (Phase 5)
- Modify:
  - `meta-state.jsonl` (1 new entry appended)
- Delete: none

## Implementation Steps

1. **Verify the 3 related meta plans are `completed`.** (Already confirmed via frontmatter read in the cross-plan scan.)
2. **Run `mcp__learning_loop_mcp__meta_state_report`** with the G8 subcommand-class recurrence entry above. The cook session has full access to the in-process MCP tool list (Droid loads MCP servers from `.mcp.json` at session start), so `mcp__learning_loop_mcp__meta_state_report` is directly invokable — no shell-out to `ck` or external CLI needed.
3. **Create all 6 plan files** (`plan.md` + 5 phase files) via the `Create` tool. The files are stub-content at this point; the cook fills the test content for each TDD phase during the corresponding phase execution.
4. **Cross-link the meta-state entry** with the journal path and the `plan.md` `createdBy` field.
5. **Verify the G8 smoke test still passes:** `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` asserts that at least one meta-state entry has `subtype: "gate-bug"` AND description contains `"subcommand-class false positive"`. The new entry adds to the set; the test continues to pass.

## Success Criteria

- [ ] `meta-state.jsonl` contains the G8 subcommand-class recurrence entry with the new ID
- [ ] All 6 plan files exist in `plans/260602-sp0-log-change/` and are non-empty
- [ ] `g8-subcommand-class-entry.test.js` continues to pass
- [ ] `pnpm validate:records` passes
- [ ] `pnpm validate:plan-loop` passes

## Risk Assessment

- **Risk: the operator does not run the meta-state report.** Mitigation: include the entry JSON inline in the plan (already done) so the cook can paste it. The cook workflow always includes `meta_state_report` for any unrecorded findings.
- **Risk: the G8 fix is never implemented.** Mitigation: each recurrence records a fresh entry, so the pattern is visible to all agents via `loop_describe({tier:"warm"}).anti_patterns`. Future planners see it during their cross-plan scan.
- **Risk: the `Create` tool fallback is hidden from future agents.** Mitigation: the `createdBy` field in `plan.md` frontmatter explicitly notes the fallback. The meta-state entry documents the rationale. The README/AGENTS.md already documents the fallback (no change needed).

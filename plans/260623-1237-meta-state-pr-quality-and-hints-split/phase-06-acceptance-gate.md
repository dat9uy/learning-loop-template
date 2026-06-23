---
phase: 6
title: "Acceptance Gate"
status: complete
priority: P1
dependencies: [2, 3, 4, 5]
effort: "~30min"
---

# Phase 6: Acceptance Gate

## Overview

Final closeout phase. Verify all 5 prior phases shipped correctly, log the plan as a change-log entry, write a shipped journal, and update `pr-body.md` for the plan.

## Requirements

- Functional: `pnpm test` passes (all tests, no regressions).
- Functional: `pnpm test:cold-session` passes.
- Functional: `gh workflow lint .github/workflows/meta-state-pr-body-advisory.yml` passes.
- Functional: `meta_state_list({ id: ["rule-pr-body-registry-deltas", "loop-design-pr-quality-rules-and-hints-split"] })` returns both entries.
- Functional: `loop_describe({tier:"warm"})` includes `process_hints` with the new entry.
- Functional: cold-session parity test passes (canonical vs mirror).
- Functional: `meta_state_log_change` for plan ship is recorded.
- Functional: shipped journal exists at `docs/journals/260623-meta-state-pr-quality-and-hints-split-shipped.md`.
- Functional: `pr-body.md` for this plan enumerates registry deltas (per finding 1's invariant).
- Non-functional: no regressions in any pre-existing test.

## Architecture

Standard closeout pattern. Single branch (`main`), single PR, single change-log entry, single journal file.

## Related Code Files

- Create: `docs/journals/260623-meta-state-pr-quality-and-hints-split-shipped.md` (journal)
- Create: `plans/260623-1237-meta-state-pr-quality-and-hints-split/pr-body.md` (PR body)
- Modify: `meta-state.jsonl` (1 `meta_state_log_change`)

## Implementation Steps

1. **Run full test suite.** `pnpm test`. Confirm 0 failures.

2. **Run cold-session test.** `pnpm test:cold-session`. Confirm parity.

3. **Lint workflow file.** `gh workflow lint .github/workflows/meta-state-pr-body-advisory.yml`. Confirm valid.

4. **Verify rule + design + PROCESS_HINTS entry exist.** `meta_state_list` and `loop_describe({tier:"warm"})` checks.

5. **Test the CI advisory on a fixture.** Use `act` or a manual `pull_request` event to run the workflow against a fixture branch that touches `meta-state.jsonl`. Confirm the categorized deltas appear in `$GITHUB_STEP_SUMMARY`.

6. **Log the plan ship.** `meta_state_log_change` with:
   - `change_dimension: "semantic"`
   - `change_target: "plans/260623-1237-meta-state-pr-quality-and-hints-split/plan.md"`
   - `change_diff`: `{ added: ["rule-pr-body-registry-deltas", "loop-design-pr-quality-rules-and-hints-split", "tools/scripts/ci-registry-deltas.sh", ".github/workflows/meta-state-pr-body-advisory.yml"], removed: [], changed: ["tools/learning-loop-mcp/core/loop-introspect.js", "tools/learning-loop-mcp/tools/loop-describe-tool.js", "tools/learning-loop-mcp/tools/loop-get-instruction-tool.js", "tools/learning-loop-mcp/hooks/session-start-inject-discoverability.cjs", ".factory/hooks/loop-surface-inject.cjs", "AGENTS.md", "meta-state.jsonl"] }`
   - `reason`: "Plan 260623-1237 shipped: PROCESS_HINTS split, PR-body CI advisory, rule promotion, citation repair."
   - `applies_to`: `{ tools: ["meta_state_propose_design", "meta_state_promote_rule", "meta_state_patch", "meta_state_log_change"], rules: ["rule-pr-body-registry-deltas"], schemas: ["core/loop-introspect.js#DISCOVERABILITY_HINTS"] }`
   - `evidence_journal`: "docs/journals/260623-meta-state-pr-quality-and-hints-split-shipped.md"
   - `evidence_code_ref`: "tools/learning-loop-mcp/core/loop-introspect.js"`

7. **Write the shipped journal.** `docs/journals/260623-meta-state-pr-quality-and-hints-split-shipped.md`. Include:
   - Plan summary
   - Phase outcomes (1-6)
   - Test count delta (+2 net)
   - Registry deltas (per finding 1's invariant: cite the new rule, design entry, change-log)
   - Open follow-ups

8. **Write the PR body.** `plans/260623-1237-meta-state-pr-quality-and-hints-split/pr-body.md`. Per finding 1's required content + Validation Q4 supersede decision:
   - **Swept entries:** none
   - **Superseded entries:** `meta-260622T1708Z-...` (rule promoted + superseded; consolidated_into: <change-log-id>), `meta-260622T1713Z-...` (PROCESS_HINTS split shipped; consolidated_into: <change-log-id>)
   - **New entries:** `rule-pr-body-registry-deltas`, `loop-design-pr-quality-rules-and-hints-split`, the change-log entry from step 6
   - **Promoted rules:** `meta-260622T1708Z-...` → `rule-pr-body-registry-deltas`
   - **Other patches:** both findings' `evidence_journal` repointed (Phase 2)

9. **Confirm the change-log consolidates the findings.** `meta_state_list({ ref_field: "consolidated_into", ref_by: "<change-log-id>" })`. Should include the 2 source findings if they were superseded with `consolidated_into`.

10. **Supersede source findings (Validation Q4).** Call `meta_state_supersede` for both findings with `consolidated_into: <change-log-id-from-step-6>`. This atomically stamps `status=superseded` + `superseded_at` + `superseded_by` + `consolidated_into`. The source findings transition `reported` → `superseded` in a single mutation per finding.

## Success Criteria

- [ ] `pnpm test` passes
- [ ] `pnpm test:cold-session` passes
- [ ] Workflow YAML lints clean
- [ ] Rule + design + PROCESS_HINTS entry all exist
- [ ] `loop_describe({tier:"warm"})` surfaces the new entry
- [ ] CI advisory tested on a fixture (or skipped with operator approval)
- [ ] `meta_state_log_change` for plan ship recorded
- [ ] Shipped journal exists with all 6 phase outcomes
- [ ] `pr-body.md` enumerates registry deltas (Swept/Resolved/New/Promoted/Other)

## Risk Assessment

- **CI advisory test on fixture is too costly.** Risk: low. Manual `pull_request` event on a test branch is the fallback. Skip with operator approval if no fixture infrastructure exists.
- **Test count drift.** Risk: low. Phase 3 expected +1 test, Phase 4 expected +1 test. Net +2. If test runner reports different, reconcile in journal.
- **Change-log `consolidates` field may not apply.** Risk: low. Source findings are resolved with `resolution` text; `consolidated_into` is only used for `superseded` status. Skip if not applicable.
- **Plan 1a's journal is not edited.** Risk: very low. Plan 1a's journal is preserved unchanged per Plan 1b's discipline; this plan adds a new journal entry.

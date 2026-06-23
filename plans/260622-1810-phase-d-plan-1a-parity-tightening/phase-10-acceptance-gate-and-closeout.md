---
phase: 10
title: "Acceptance Gate and Closeout"
status: pending
effort: "~30min"
---

# Phase 10: Acceptance Gate and Closeout

## Overview

Final acceptance gate: full `pnpm test` passes (1099 / 0 / 1). Closeout contract: 3 `meta_state_resolve` calls (one per finding added by operator), 1 `meta_state_log_change` (Plan 1a ship event), journal entry, PR body. No master-tracker flip (D1/D2/D3 already closed by Plan 1; Plan 1a is atomic-fix tier).

## Context Links

- All Phases 1-9 (sequential dependencies)
- `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` (Phase 7 resolves)
- `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` (Phase 8 resolves)
- `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` (Phase 9 resolves)
- `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (closeout journal template)
- `plans/260618-1911-phase-d-plan-1-workflows/pr-body.md` (PR body template)

## Requirements

- **Functional:**
  - `pnpm test` exits 0 with 1099 pass / 0 fail / 1 skipped.
  - 3 `meta_state_resolve` calls:
    - `meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift` → resolved (resolution: "Plan 1a Phase 7 ships pre-closeout refresh script; closeout protocol updated").
    - `meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis` → resolved (resolution: "Plan 1a Phase 8 ships Claude Code SessionStart hook; parity with Droid achieved").
    - `meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n` → resolved (resolution: "Plan 1a Phase 9 ships `mastra_task_update` MCP wrapper returning {changed: bool}; agents can self-detect no-ops").
  - 1 `meta_state_log_change` call:
    - `change_dimension: "semantic"`, `change_target: "plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md"`, `reason: "Plan 1a shipped: 5 brainstorm candidates (deep-equal parity, envelope input, factory id-shape, runId generation, schema fingerprint) + 3 finding resolutions (fingerprint-drift refresh, SessionStart hint, TaskUpdate idempotency)"`.
  - Journal entry at `docs/journals/260622-phase-d-plan-1a-shipped.md`.
  - PR body at `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md`.
- **Non-functional:**
  - Acceptance gate runs in <5min (full `pnpm test` + 4 MCP calls + journal + PR body).
  - Closeout journal follows the same template as `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (sections: TL;DR, Phases, Decisions, Deferred, Files).

## Architecture

Verify-only phase. No code changes outside `meta-state.jsonl` + journal + PR body.

## Related Code Files

- **Modify:** `meta-state.jsonl` (4 entries appended)
- **Create:** `docs/journals/260622-phase-d-plan-1a-shipped.md`
- **Create:** `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md`
- **Delete:** none

## Implementation Steps

1. Run `pnpm test 2>&1 | tee /tmp/plan-1a-final.log`; confirm 1099 / 0 / 1.
2. Call `mastra_meta_state_resolve` 3 times (one per finding):
   ```js
   await client.callTool("mastra_meta_state_resolve", { id: "meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift", resolution: "Plan 1a Phase 7 ships pre-closeout refresh script; closeout protocol updated" });
   await client.callTool("mastra_meta_state_resolve", { id: "meta-260622T1439Z-plan-b-s-layer-2-fix-gh-2246-relies-on-the-new-pnpm-test-dis", resolution: "Plan 1a Phase 8 ships Claude Code SessionStart hook; parity with Droid achieved" });
   await client.callTool("mastra_meta_state_resolve", { id: "meta-260622T1439Z-claude-code-s-native-taskupdate-tool-returns-updated-task-n", resolution: "Plan 1a Phase 9 ships mastra_task_update MCP wrapper returning {changed: bool}; agents can self-detect no-ops" });
   ```
3. Call `mastra_meta_state_log_change` once:
   ```js
   await client.callTool("mastra_meta_state_log_change", {
     change_dimension: "semantic",
     change_target: "plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md",
     change_diff: { added: ["5 parity tightening phases", "3 finding resolutions", "1 schema fingerprint test", "1 pre-closeout refresh script", "1 SessionStart hint injection hook", "1 TaskUpdate idempotency wrapper tool"], removed: [], changed: [] },
     reason: "Plan 1a shipped: 5 brainstorm candidates (deep-equal parity, envelope input, factory id-shape, runId generation, schema fingerprint) + 3 finding resolutions (fingerprint-drift refresh, SessionStart hint, TaskUpdate idempotency)",
     applies_to: { tools: ["mastra_task_update"], surfaces: ["product"], statuses: [], schemas: [] },
     evidence_code_ref: "tools/learning-loop-mastra/create-loop-workflow.js:58",
     evidence_journal: "docs/journals/260622-phase-d-plan-1a-shipped.md"
   });
   ```
4. Author journal entry at `docs/journals/260622-phase-d-plan-1a-shipped.md` (template: mirror `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md`).
5. Author PR body at `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md` (template: mirror `plans/260618-1911-phase-d-plan-1-workflows/pr-body.md`).
6. Update GitHub issue (Phase 6 of post-plan handoff; closes the issue with PR link).

## Success Criteria

- [ ] `pnpm test` exits 0 with 1099 / 0 / 1.
- [ ] 3 `meta_state_resolve` calls succeed; `meta-state.jsonl` reflects `status: "resolved"` for all 3 finding ids.
- [ ] 1 `meta_state_log_change` call succeeds; `meta-state.jsonl` contains the Plan 1a closeout entry.
- [ ] Journal entry authored at `docs/journals/260622-phase-d-plan-1a-shipped.md`.
- [ ] PR body authored at `plans/260622-1810-phase-d-plan-1a-parity-tightening/pr-body.md`.
- [ ] GitHub issue updated with PR link + closeout summary.

## Risk Assessment

- **`pnpm test` fails on Phase 10.** Risk: very low (Phases 2-9 each gate on local test pass; Phase 10 is the consolidated check). Mitigation: if Phase 10 fails, surface the regression to operator; Plan 1a does not own unrelated fixes.
- **MCP server unreachable during resolve/log_change.** Risk: low. Mitigation: `OPERATOR_MODE=1` env var gates; retry on transient failure.

## Security Considerations

None. Verify-only phase with read-only MCP tool calls (resolve + log_change are operator-gated writes).

## Next Steps

Plan 1a is shipped. Plan 3 (agents) becomes the next unblocked content phase. Plan 4 (cutover) closes Phase D. The 3 resolved findings free the meta-surface from carrying structural gaps into Plan 3.
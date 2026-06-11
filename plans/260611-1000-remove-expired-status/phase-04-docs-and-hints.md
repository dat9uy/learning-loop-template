---
phase: 4
title: Docs and DISCOVERABILITY_HINTS rewrite
status: completed
priority: P2
effort: 1.5h
dependencies:
  - 3
---

# Phase 4: Docs and DISCOVERABILITY_HINTS rewrite

## Overview

After the code and tests are stale-only, the docs must catch up. Rewrite `docs/meta-state-lifecycle.md` to drop the `expired` row and the legacy migration section. Edit `AGENTS.md` to drop step 3 of the cross-reference script (the `meta_state_migrate_expired_to_stale` call). Edit `docs/trajectory.md` to fix the `reopens_inverse` row. Update the 4 stale/expired lines in `DISCOVERABILITY_HINTS` in both copies (`core/loop-introspect.js` and `.factory/hooks/loop-surface-inject.cjs`).

## Requirements

- Functional:
  - `docs/meta-state-lifecycle.md` is rewritten:
    - Remove the `expired` row from the status definitions table (currently around line 35).
    - Rewrite the status transitions diagram to drop the `expired` box and the `reported --[TTL elapsed]--> expired` arrow.
    - Update the "Terminal vs Non-Terminal" section to drop `expired` from the terminal list.
    - Update the tools table to remove `meta_state_sweep -> expired` from the `meta_state_sweep` row's transition column (it currently says `-> stale / expired / auto-resolved`; becomes `-> stale / auto-resolved`).
    - Update the line-ref note: the `pending_expired_migration` block in `loop-describe-tool.js` is at lines 76-87 (off-by-one from the original plan's 77-88; red-team finding).
    - Update the "Why stale replaces expired" section to a "Lifecycle cleanup" section that documents the status enum change and the data-layer proof (0 expired rows in the registry at the time of this plan).
    - Remove the migrate-tool row from the tools table.
    - Update the related-documents section if any linked doc still references `expired`.
  - `AGENTS.md` is edited:
    - Line 100: change the `meta_state_sweep` description from "Auto-resolve expired findings" to "Mark past-TTL findings stale" (or whatever the new tool description is after Phase 1).
    - Line 199: change the cross-reference script. Current text: "The canonical script is `(1) meta_state_relationship_validate to lint, (2) meta_state_report({reopens: [orphan_ids]}), (3) meta_state_migrate_expired_to_stale per expired parent, (4) meta_state_resolve({cascade_from}) to close`." New text: "The canonical script is `(1) meta_state_relationship_validate to lint, (2) meta_state_report({reopens: [orphan_ids]}), (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the parent in 1 step`." The script is now 3 steps, not 4.
  - `docs/trajectory.md` line 226: the `reopens_inverse` row's first column changes from `expired finding` to `stale finding`. The "reopen findings that re-surface it" column stays the same.
  - `tools/learning-loop-mcp/core/loop-introspect.js` `DISCOVERABILITY_HINTS` (lines 92-102):
    - Line 96: change the 6-status bullet to a 6-status bullet without `expired`. Current: "Findings have 6 statuses: `reported` (24h TTL), `active` (operator-acked), `stale` (past TTL or past staleness window; re-verifiable via meta_state_re_verify), `resolved` (closed), `expired` (legacy — kept for backward compat; new TTL semantics use `stale`), `superseded` (consolidated into a change-log)." New: "Findings have 6 statuses: `reported` (24h TTL), `active` (operator-acked), `stale` (past TTL or past staleness window; re-verifiable via meta_state_re_verify), `resolved` (closed), `superseded` (consolidated into a change-log), `auto-resolved` (closed by mechanism)."
    - Line 97: change the reopens hint. Current: "For reopens: set reopens: ['<old_expired_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]})." New: "For reopens: set reopens: ['<old_stale_id>'] on the new finding at report time, then cascade-resolve the parent via meta_state_resolve({id: old_id, cascade_from: [child_id]}). The cascade closes the stale parent in 1 step."
    - Line 101: change the cross-reference script. Current: "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_migrate_expired_to_stale per expired parent; (4) meta_state_resolve({cascade_from}) to close. The cascade is 2-step: migrate then resolve." New: "For 'X is related to Y' prompts: (1) meta_state_relationship_validate to lint; (2) meta_state_report({..., reopens: ['<orphan_id>']}); (3) meta_state_resolve({id: parent, cascade_from: [new_finding_id]}) to close the stale parent in 1 step."
  - `.factory/hooks/loop-surface-inject.cjs` `LOCAL_DISCOVERABILITY_HINTS` (lines 19-27): apply the same 3 edits as the canonical `core/loop-introspect.js` (the local copy is kept in sync; this plan restores parity after the stale-flag-redesign closeout noted the drift).
- Non-functional:
  - `grep -rn 'expired' docs/meta-state-lifecycle.md AGENTS.md docs/trajectory.md tools/learning-loop-mcp/core/loop-introspect.js .factory/hooks/loop-surface-inject.cjs 2>/dev/null` returns 0 matches (after this phase, the only `expired` mentions in the active docs are in `docs/journals/2606*.md` and `plans/reports/*.md`, which are historical and left as audit trail).
  - `pnpm test` still passes (the docs changes don't affect runtime).

## Architecture

### Why the doc rewrite is non-trivial for `meta-state-lifecycle.md`

The file is the canonical reference for the finding lifecycle. It currently documents a 7-state model (`reported, active, stale, resolved, expired, superseded, auto-resolved`) with a 7-row table. After the change, it's a 6-state model. The file structure is:
- Status Definitions table (7 rows → 6 rows)
- Status Transitions diagram (text-based; `expired` box removed)
- Terminal vs Non-Terminal section (terminal list loses `expired`)
- Archive Mechanics (unchanged)
- Tools table (the `meta_state_sweep` row's transition column loses `expired`; the migrate-tool row is removed)
- Grounding and Drift (unchanged)
- Key Design Decisions (the "Why stale replaces expired" section becomes "Lifecycle cleanup: status enum was reduced in plan 260611-1000")
- Related Documents (link list; verify no linked doc still says `expired`)

The rewrite preserves the file's overall structure and most content; the changes are surgical but span the whole file.

### Why we keep the historical doc references

`docs/journals/2606*.md` (the stale-flag-redesign journal, the cross-reference-fields closeout, the discoverability-p2-handoff, etc.) and `plans/reports/brainstorm-2606*.md` (the brainstorm reports that decided the stale-flag redesign) all reference `expired` as a historical status. These are audit-trail records: they describe decisions made at a specific point in time, and rewriting them would falsify the history. Leave them as-is. The plan's success criterion explicitly excludes these from the grep.

### Why we don't touch the vnstock observations

`records/vnstock/observations/*.yaml` and `records/vnstock/claims/*.yaml` reference "expired" in the domain sense: "auth cache expired", "subscription expired", "marker expired". These are not the meta-state status enum; they're prose about the vendor's auth lifecycle. Leave them alone.

## Related Code Files

### Modify
- `docs/meta-state-lifecycle.md` — full rewrite
- `AGENTS.md` — 2 edits (lines 100, 199)
- `docs/trajectory.md` — 1 edit (line 226)
- `tools/learning-loop-mcp/core/loop-introspect.js` — 3 edits in `DISCOVERABILITY_HINTS` (lines 96, 97, 101)
- `.factory/hooks/loop-surface-inject.cjs` — 3 edits in `LOCAL_DISCOVERABILITY_HINTS` (lines 21, 22, 26)

## Implementation Steps

1. **Read `docs/meta-state-lifecycle.md`** end-to-end to plan the rewrite.
2. **Rewrite `docs/meta-state-lifecycle.md`** with the 6 changes listed in the Functional Requirements. Use a `status: pending → status: active` transition for the file in the registry's change-log sense: a single `meta_state_log_change` entry with `change_target: "docs/meta-state-lifecycle.md"`, `change_dimension: "semantic"`, and a `reason` documenting the rewrite.
3. **Edit `AGENTS.md:100`** (the `meta_state_sweep` row in the `mcp` group table). Change "Auto-resolve expired findings; auto-resolve findings whose file was modified" to the new tool description (which is "Mark past-TTL findings stale; auto-resolve findings whose file was modified" after Phase 1's edit to the tool description in `tools/meta-state-sweep-tool.js`).
4. **Edit `AGENTS.md:199`** (the cross-reference script). Replace the 4-step with the 3-step.
5. **Edit `docs/trajectory.md:226`** (the `reopens_inverse` row). Change `expired finding` to `stale finding`.
6. **Edit `tools/learning-loop-mcp/core/loop-introspect.js`** `DISCOVERABILITY_HINTS` lines 96, 97, 101.
7. **Edit `.factory/hooks/loop-surface-inject.cjs`** `LOCAL_DISCOVERABILITY_HINTS` lines 21, 22, 26.
8. **Run the regression-prevention grep**: `grep -rn 'expired' docs/meta-state-lifecycle.md AGENTS.md docs/trajectory.md tools/learning-loop-mcp/core/loop-introspect.js .factory/hooks/loop-surface-inject.cjs 2>/dev/null` returns 0 matches.
9. **Log a `meta_state_log_change` entry** for each of the 5 modified files (or one entry with all 5 in `change_diff.changed`).
10. **Commit** with message: `docs(meta-state): rewrite lifecycle doc, drop expired from hints (phase 4)`.

## Success Criteria

- [ ] `grep -rn 'expired' docs/meta-state-lifecycle.md AGENTS.md docs/trajectory.md tools/learning-loop-mcp/core/loop-introspect.js .factory/hooks/loop-surface-inject.cjs 2>/dev/null` returns 0 matches.
- [ ] `pnpm test -t 'loop-describe|meta-state-schema|discoverability'` passes.
- [ ] `ck plan status /home/datguy/codingProjects/learning-loop-template/plans/260611-1000-remove-expired-status/plan.md` shows Phase 4 as `completed` after the implementation.
- [ ] The new `meta_state_log_change` entry is in `meta-state.jsonl` with `change_target` matching one of the 5 modified files.

## Risk Assessment

- **Risk**: the `meta-state-lifecycle.md` rewrite is the highest-content-risk edit. A bad rewrite could leave the file inconsistent with the code.
- **Mitigation**: the rewrite is mechanical (drop `expired` from 7 specific places); use the Functional Requirements list as a checklist. The file is ~150 lines, and only ~10 lines change semantically. Compare line-by-line before commit.
- **Risk**: the `DISCOVERABILITY_HINTS` edits in two files (canonical + local copy) must stay in sync. Drift is a known issue (per the stale-flag-redesign closeout journal).
- **Mitigation**: this plan explicitly addresses the drift by editing both files in the same phase. Add a post-edit check: `diff <(grep DISCOVERABILITY_HINTS tools/learning-loop-mcp/core/loop-introspect.js) <(grep LOCAL_DISCOVERABILITY_HINTS .factory/hooks/loop-surface-inject.cjs)` should show identical string content (modulo variable names).
- **Risk**: `meta_state_log_change` requires a valid preflight marker for `meta` writes? No — `meta-state.jsonl` is at the project root, not under `product/**`. No preflight needed. The change-log entry is written via the MCP tool, which is the canonical path.

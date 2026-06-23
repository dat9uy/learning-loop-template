---
phase: 1
title: "Research"
status: complete
priority: P1
dependencies: []
effort: "~20min"
---

# Phase 1: Research

## Overview

Verify-only phase. Confirm canonical paths, validate the 17-hint classification, list the actual mutating tools (Red Team M2 — 16-22, not 11), verify PR #8 merge SHA via `git log --merges` (Red Team M4 — do not assert unverified), and identify the citation-repair target for Phase 2. No code changes.

## Requirements

- Functional: confirm `meta-state.jsonl` is at repo root (not `tools/learning-loop-mcp/.runtime/`).
- Functional: enumerate all mutating MCP tools and their entry-kind/status transitions. Compute the count programmatically (M2).
- Functional: classify each of the 17 hints in `DISCOVERABILITY_HINTS` as meta-surface contract or process rule.
- Functional: identify the 4 candidate targets for the broken `evidence_journal` repair.
- Functional: verify PR #8 merge SHA empirically via `git log --merges` (M4).
- Non-functional: research must be reproducible (cite file:line for every claim).

## Architecture

This phase is a verification gate. The 3 researchers have already returned findings; Phase 1 confirms the findings are still accurate at execution time. Researchers may have missed a file added between research and execution.

## Related Code Files

- Read: `tools/learning-loop-mcp/core/meta-state.js` (registry path constant L7; mutating primitives L346/371/438/465/486)
- Read: `tools/learning-loop-mcp/core/loop-introspect.js` (DISCOVERABILITY_HINTS L90-108)
- Read: `tools/learning-loop-mastra/tools/manifest.json` (32 tool surface)
- Read: `meta-state.jsonl` (rule precedents at L17, L129; source findings at L121, L125)
- Read: `plans/reports/` (verify absence of `review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md`)
- Run: `git log --merges --oneline -20 --first-parent main` to verify PR #8 merge SHA (M4)

## Implementation Steps

1. **Confirm registry path.** `grep REGISTRY_FILENAME tools/learning-loop-mcp/core/meta-state.js`. Verify the path resolver at L314-316 joins `<root> + REGISTRY_FILENAME` and that the on-disk file is at the repo root.

2. **List mutating tools (Red Team M2 fix).** Compute the count programmatically:
   ```bash
   grep -l "writeEntry\|updateEntry\|archiveEntry\|metaStateBatch" tools/learning-loop-mcp/tools/meta-state-*-tool.js | wc -l
   ```
   Cross-reference with `tools/learning-loop-mastra/tools/manifest.json` and the mutating primitives in `core/meta-state.js:346/371/438/465/486`. The actual count is 16-22, not 11. Document each mutating tool's entry-kind/status delta in a markdown table with the actual count.

3. **Validate hint classification.** Read `core/loop-introspect.js:90-108`. For each of the 17 hints, confirm:
   - Indices 0-15: meta-surface contracts (cite registry/code, describe `meta_state_*` tool usage)
   - Index 16: process rule (agent behavior under operational condition)

4. **Identify citation-repair candidates.** `ls plans/reports/` and document the 4 candidate files:
   - `from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` (closest match; if PR #8 review was consolidated here)
   - `journal-260619-2246-phase-d-plan-2-shipped.md` (the plan-journal; documents registry deltas)
   - `code-reviewer-260622-2316-GH-1810-phase-d-plan-1b-red-team-scope-complexity-critic-plan-review-report.md` (Plan 1b review; not PR #8)
   - Re-create the missing `review-260622-1704-GH-2246-phase-d-plan-2-storage-report.md` (only if SHA verified in step 5)

   Report findings to the operator; do NOT pick a default.

5. **Verify PR #8 merge SHA (Red Team M4 fix).** Run `git log --merges --oneline -20 --first-parent main`. Find the PR #8 merge commit. Verify the SHA empirically. If the SHA differs from `e528bab529cfbe6669e5c9c21f18a9ad862bd1d8` (researcher 3's unverified claim), use the actual SHA. Do NOT carry forward the unverified claim.

## Success Criteria

- [ ] Registry path confirmed (or corrected) in `tools/learning-loop-mcp/core/meta-state.js:7`
- [ ] Mutating-tool table complete (actual count, 16-22 rows, file:line for each tool — M2)
- [ ] Hint classification table complete (17 rows, indices 0-16, target table)
- [ ] Citation-repair candidates listed (4 options)
- [ ] PR #8 merge SHA verified empirically via `git log --merges` (M4)
- [ ] No code changes in this phase (verify-only)

## Risk Assessment

- **Registry path may have moved.** Risk: low. Constant at `core/meta-state.js:7` is the source of truth.
- **Hint count may have changed.** Risk: low. `core/loop-introspect.js:90-108` is the source of truth.
- **Mutating-tool count drift (M2).** Risk: low. Programmatic grep produces actual count. Plan no longer asserts "11" — uses the real number.
- **PR #8 merge SHA unverified (M4).** Risk: high. Retrospective review file (option b) is invalidated by wrong SHA. Mitigation: step 5 verifies SHA empirically; option b only proceeds if SHA is verified.
- **Citation-repair target ambiguous.** Risk: medium. Phase 2 cannot proceed without operator decision. Mitigation: Phase 1 explicitly lists 4 candidates; operator picks before Phase 2.

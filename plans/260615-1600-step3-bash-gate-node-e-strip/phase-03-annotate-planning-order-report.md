---
phase: 3
title: "annotate-planning-order-report — mark Step 3 complete with change-log id"
status: pending
priority: P3
effort: "15m"
dependencies: ["phase-01-red-tests", "phase-02-green-impl-and-ship"]
---

# Phase 3: Annotate planning-order report (Step 3)

## Overview

After Phases 1-2 ship, annotate `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` to mark Step 3 as complete. The planning-order report's "How to use this report" section explicitly states:

> When a step is completed, the operator can annotate this report with a checkmark + the change-log id (no separate tracking artifact).

The annotation is the single-source-of-truth mechanism (mirrors Step 2 Phase 5 + Step 1 Phase 4's pattern). The report's "Shipped status" subsection gains a new row for Step 3 (status `shipped` + the change-log id from Phase 2), the TL;DR table's Step 3 row is annotated with a checkmark, and the "Cleanup backlog" section gains any cosmetic findings surfaced during code review of Phases 1-2.

This phase is a **post-ship tracking step**: it does not gate the ship itself, it documents that the ship happened. Run AFTER the Phase 2 ship PR is merged.

## Requirements

Functional:
- The "Shipped status" subsection in `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` gains a new row:
  - Step 3: shipped `<date>` — change-log `<id>` (the `meta_state_log_change` id filed in Phase 2) — link to the PR or commit hash.
  - If no change-log was filed (operator shipped without one), the cell degrades to `—` and a note is added.
- The TL;DR table's Step 3 row gains a trailing `✅` (U+2705) and the change-log id is appended inline, e.g., `✅ shipped — \`meta-260615T<HHMM>Z-...\` — Narrow first-pass fix for the node -e body false positive`.
- The "Cleanup backlog" section gains any new cosmetic findings from Phases 1-2 (per the report's deferred-cleanup convention; cosmetic findings are batched across all 4 steps and processed in a follow-up plan). If no new findings surfaced, skip this step.
- The report's frontmatter `status` stays `in-progress` (3 of 4 steps now shipped; 1 pending).

Non-functional:
- The annotation is appended, not a rewrite. The original TL;DR table cells, the cross-report dependency matrix, the problem-solving techniques, and the existing Step 1/2 shipped rows all stay intact. A future reader can still re-derive the order from the unchanged narrative.
- Diff size: < 30 lines added to the report (1 cell annotation in the TL;DR table + 1 row in Shipped status + ~5-10 cleanup-backlog items, or 0 items if no findings).
- No code changes; no new files; no new tests.
- The change-log id (if any) is in backticks and copy-paste safe.

## Architecture

The annotation is a structured addendum to the existing "Shipped status" subsection (which was added by Step 1 Phase 4 on 2026-06-15, then extended by Step 2 Phase 5 on 2026-06-15). Format:

```md
## Shipped status

| Step | Source | Status | Change-log | Shipped at |
|------|--------|--------|------------|------------|
| 1 | Report 2 P0-1 | ✅ shipped | `meta-260615TNNNNZ-surfaces-helper-and-refactors-shipping` | 2026-06-15 |
| 2 | Report 1 P1 | ✅ shipped | `meta-260615T1459Z-bash-gate-debate-step-2-shipping` | 2026-06-15 |
| 3 | Report 1 P2 | ✅ shipped | `meta-260615T<HHMM>Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody` | 2026-06-15 |
| 4 | Report 2 P2-5 | pending | — | — |

Updated: 2026-06-15 — Step 3 ships the conservative `node -e` body strip + 6 new tests per `plans/260615-1600-step3-bash-gate-node-e-strip/`. Bypass risk (`node -e "require('child_process').exec('npm install')"` no longer matches `package-manager`) documented in finding `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...`; caught by Step 2's `gate_check_recurrence` if the pattern recurs.
<!-- Updated: Validation Session 1 — 6 tests, realistic Node.js bypass example. -->
```

The annotation is appended to the existing "Shipped status" table. No other changes to the report's narrative sections.

## Related Code Files

- Modify: `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` — append 1 row to the "Shipped status" table, annotate 1 cell in the TL;DR table, append any cleanup-backlog items.
- Modify: `plans/260615-1600-step3-bash-gate-node-e-strip/plan.md` — Phase 3 entry in the Phases table (the file is regenerated in this phase's commit; no separate update needed).

No production code, no tests, no MCP tools. Pure tracking artifact.

## Implementation Steps

1. **Verify the change-log id exists.** Open the meta-state registry; confirm the Phase 2 ship PR was followed by a `meta_state_log_change` call that produced a `change-log` entry whose `change_target` references `tools/learning-loop-mcp/core/gate-logic.js#stripNodeEvalBody` (or the broader function set shipped in Phase 2). The expected id is `meta-260615T<HHMM>Z-tools-learning-loop-mcp-core-gate-logic-js-stripnodeevalbody-...` (HHMM = the time Phase 2's `meta_state_log_change` was invoked). If no change-log was filed, skip the id column (leave it as `—`) and note the omission in the Shipped subsection.

2. **Verify the finding id exists (optional reference).** The Phase 2 bypass-risk finding id is `meta-260615T<HHMM>Z-node-e-strip-bypass-risk-...`. If filed, reference it in the "Updated:" note below the Shipped status table (per the example above). If not filed, omit the reference.

3. **Read the current planning-order report frontmatter and TL;DR table.** Confirm the report hasn't been edited by a parallel session; the `status` field is `in-progress` and the table has Step 1 + Step 2 marked shipped, Step 3 + Step 4 pending.

4. **Annotate the TL;DR table.** Find the Step 3 row (the third row of the TL;DR table). The current cell value is `Independent; can ship alongside or after step 2`. Change to: `✅ shipped <date> — \`<change-log-id>\` — Narrow first-pass fix; ships alongside Step 2's catch-net (gate_check_recurrence)`. Use the actual date and id from step 1.

5. **Append a row to the "Shipped status" table.** Per the architecture above. Insert the Step 3 row between Step 2 (shipped) and Step 4 (pending). The "Updated:" note at the bottom of the subsection is updated to include Step 3's ship info.

6. **Append cleanup-backlog items (if any).** Per the planning-order report's § "Cleanup backlog" convention: minor findings from each shipped step are appended with a one-line description + file/line reference. The Step 1 backlog has 5 items (1.1-1.5), the Step 2 backlog has 5 items (2.1-2.5). Step 3 typically produces 2-4 items (one per phase, similar to Step 1 + Step 2's pattern). Common Step 3 candidates: (a) cosmetic JSDoc tweak on `stripNodeEvalBody` if the regex explanation could be tighter, (b) test-quality item if the package-manager bypass guard test was included or needs refinement, (c) any drift between the plan's stated file-line numbers and the actual post-ship state. If Phases 1-2 surfaced no new items, skip this step.

7. **Verify the diff.** `git diff plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` — expect: 1 cell annotation in the TL;DR table, 1 row in the Shipped status table, ~5-10 lines in cleanup-backlog additions (or 0 lines if no items). No other changes.

8. **Whole-plan consistency check.** Confirm the planning-order report's "What IS tracked here" section (around line 178) is still accurate: the report tracks the order + the shipped status + the cleanup backlog. No contradictions. The annotated report is the single source of truth for "is Step 3 done?" — agents reading future sessions can grep for `✅ shipped` and see the status.

## Success Criteria

- [ ] `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md` has a "Shipped status" row for Step 3 with the change-log id (or `—` if none was filed).
- [ ] The TL;DR table's Step 3 row is annotated with `✅ shipped <date> — \`<change-log-id>\``.
- [ ] The cleanup-backlog section (if items were added) has Step 3's findings, numbered `3.1`, `3.2`, ... (continuing from Step 2's `2.1`-`2.5`).
- [ ] No other content in the report is changed (narrative, dependency matrix, problem-solving techniques are intact).
- [ ] `git diff` against the pre-Phase-3 state is < 30 lines (1 cell annotation + 1 row + ~5-10 cleanup lines, or 0 if no findings).

## Risk Assessment

| Risk | Mitigation |
|---|---|
| The change-log id doesn't exist (operator shipped without filing one) | The annotation degrades gracefully: the Shipped subsection lists `change-log: —` and a note "shipped without change-log; file one retroactively if you want full audit trail". The Step 3 row in the TL;DR still gets the `✅`. |
| A parallel session edited the planning-order report between Phase 2 and Phase 3 | The git diff step (7) catches it; abort and reconcile. The annotation is the only addition. |
| The annotation gets out of sync with reality (operator says "shipped" but the PR isn't merged) | Lock the annotation step to AFTER the ship PR is merged: the `git log` shows the merge commit before this phase starts. |
| Cleanup-backlog items duplicate Step 1's or Step 2's items | Review the existing backlog (per the planning-order report's § "Cleanup backlog") before adding new items. The new items are gated to a `3.x` prefix in the table to avoid collision with Step 1's `1.x` and Step 2's `2.x`. |
| Future readers grep for the change-log id and find a typo | The id is in backticks; copy-paste safe. The id is a meta-state entry id (not a free-form string), so typo is unlikely. |
| The "Updated:" note under the Shipped status table grows too long | The note is one line per step ship; if it gets unwieldy, split into per-step notes (e.g., a `## Step 3 shipped` subheading). For Step 3, a single updated line is sufficient. |

## Security Considerations

- The annotation is a markdown edit in a tracked report. No code, no execution, no attack surface.
- The change-log id is a meta-state entry id (e.g., `meta-260615T<HHMM>Z-...`). Linking to it from a markdown report is the standard pattern; the meta-state registry is the source of truth for the id's existence.
- The optional finding id reference is also a meta-state entry id; same pattern.
- No secrets or PII are added; the annotation is a status update.

## Next Steps

This is the last phase of Step 3. After Phase 3 ships:
- The planning-order report shows Steps 1 + 2 + 3 shipped; Step 4 pending.
- The next session reading the report sees 3 of 4 steps done; Step 4 (Report 2 Phases 2-5) is the only remaining work.
- The cleanup backlog accumulates items from Steps 1+2+3. A separate `plans/<date>-CLEANUP-batch-cleanup-after-planning-order/` plan walks all lists (per the planning-order report's convention).
- No other plan depends on this annotation step. Phase 3 is a tracking-only phase.
</content>
</invoke>

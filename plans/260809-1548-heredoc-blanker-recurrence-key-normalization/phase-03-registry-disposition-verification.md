---
phase: 3
title: "Registry disposition + verification"
status: pending
priority: P2
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Registry disposition + verification

## Overview

Close out the open mislabeled finding with the corrected characterization now that the durable fix has shipped, record the change in the change-log, and run the final end-to-end verification.

## Requirements

- Functional:
  - Resolve `meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru` via `meta_state_resolve` with `resolved_by: operator`.
  - Record the semantic change via `meta_state_log_change`.
- Non-functional: resolution text carries the full corrected characterization so the record is self-contained for future debug passes.

## Resolution text (draft — refine at execution)

> Retracted as gate-logic-bug (see `plans/reports/disposition-260809-1536-rule-no-raw-stdout-vitest-false-fire-retraction.md`): the gate evaluated correctly by design; the false-fire was the un-blanked heredoc data class. The recorded "regex anchoring" direction was ruled unsound (regresses the `bash -c` executed-body asymmetry). Durable fix shipped in plan `plans/260809-1548-heredoc-blanker-recurrence-key-normalization`: `stripHeredocBodies` blanks quoted-delimiter heredoc bodies for inert verbs (executor verbs and unquoted heredocs stay visible), and recurrence keys now normalize through the blanker chain so residual classes file one finding per root-cause class. Unquoted-heredoc and `node -e` escaped-quote remain accepted residual classes with the recurrence catch-net.

## Related Code Files

- Registry only: `meta-state.jsonl` + `change-log.jsonl` (via loop CLI tools, never direct writes)

## Implementation Steps

1. `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_resolve '{"id":"meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru","resolution":"<text above>","resolved_by":"operator"}'`
2. `meta_state_log_change` with `change_dimension: "semantic"`, `change_target: "gate-logic stripHeredocBodies + recurrence-key normalization"`, added/removed/changed summary, reason citing the storm rationale.
3. **Re-file burst triage (red-team Finding 14):** after the first post-ship SessionStart, scan for any newly-filed `recurring-false-positive` findings that bypassed the dedup fallback; resolve each as a duplicate of its same-rule predecessor with a link (the fallback should suppress most; this catches the residual). Pre-drafted in Phase 2.
4. Final verification sweep:
   - Re-run the report's 8-shape matrix against live `evaluateBashGate` (repo HEAD); attach the result table to the phase file. Expected: shapes 1–2 escalate; shapes 3–4 `ok`; shape 5 (unquoted) escalates as a visible residual; shapes 6–8 `ok`.
   - Full `legacy-mcp` test suite green.
   - `meta_state_list({id, include_all_versions: true})` shows `status: resolved`.

## Success Criteria

- [ ] Finding status `resolved` in the registry (v2 appended, v0/v1 history intact)
- [ ] Change-log entry present
- [ ] 8-shape matrix result table recorded; no false-fires for quoted-delimiter heredoc shapes
- [ ] Full test suite green

## Risk Assessment

- **Premature resolve** if Phase 1/2 verification is incomplete — gated by `dependencies: [1, 2]`; do not execute while any matrix row or tracker test is red. Signal: suite red. Response: stay in the failing phase; the finding stays open, which is the correct state for an unshipped fix.

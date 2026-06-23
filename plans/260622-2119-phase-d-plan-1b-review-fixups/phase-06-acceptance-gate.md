---
phase: 6
title: "Acceptance Gate"
status: completed
priority: P1
dependencies: ["phase-01-research", "phase-02-critical-fixes", "phase-03-envelope-consolidation", "phase-04-sessionstart-mcp-sdk", "phase-05-cleanup"]
---

# Phase 6: Acceptance Gate

## Overview

Verify Plan 1b's acceptance criteria, log the change, write the journal entry, and prepare the PR body. Closes the loop on all 11 review findings.

## Requirements

- Functional: `pnpm test` exits 0; all 11 findings have documented outcomes (fixed, reverted, or accepted).
- Non-functional: meta-state registry reflects the change; journal entry is self-contained; PR body is honest about C1 outcome.

## Architecture

No code changes. Pure verification + meta-surface updates.

## Related Code Files

- Verify: `pnpm test` output
- Modify: `meta-state.jsonl` (1 `meta_state_log_change` for Plan 1b ship)
- Create: `docs/journals/260622-phase-d-plan-1b-shipped.md`
- Modify: `plans/260622-1819-phase-d-plan-1b-review-fixups/pr-body.md` (if PR body present)

## Implementation Steps

### Step 1 — Verify acceptance criteria

Run:

```bash
pnpm test
```

Expected: 9 globs, ~1140-1143 pass / 0 fail / 1 skipped (depends on Phase 2 + Phase 5 test additions/removals).

Verify each finding:

| ID | Outcome | Evidence |
|----|---------|----------|
| C1 | A: working wrapper / B: reverted + manifest removed / C: cache-only | Phase 2 commits + meta-state |
| I1 | Fixed (envelope consolidated) | Phase 3 commits + invariant test |
| I2 | Fixed (doc corrected) | Phase 5 commits to journal + pr-body |
| I3 | Fixed (SDK handshake) | Phase 4 commits + smoke test |
| I4 | Fixed (version bumped) | `tools/learning-loop-mastra/server.js:150` |
| I5 | Fixed (count updated) | `tools/learning-loop-mastra/server.js:152` |
| M1 | Fixed (6 parameterized tests) | `create-loop-workflow.test.js` |
| M2 | Fixed if Path A or C; N/A if Path B | Phase 2 commits |
| M3 | Fixed (intent documented) | `schema-fingerprint.test.cjs` |
| M4 | Fixed (dead code removed) | `workflow-direct-parity.test.js` |
| M5 | Fixed if Path A or C; N/A if Path B | Phase 2 commits |

### Step 2 — Log Plan 1b change

```bash
# Pre-flight required (gates product/** writes)
OPERATOR_MODE=1

# Log the change
mcp__learning-loop-mastra__meta_state_log_change \
  --change_dimension "semantic" \
  --change_target "plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md" \
  --change_diff '{"added":["C1 fix (per Phase 1 decision)","envelope consolidation to #mcp/core/envelope-stripper.js","SessionStart hook using direct buildDiscoverabilityHints() import (per Red Team Finding 2)","M1-M5 cleanup"],"removed":["stripContentEnvelope local duplicate (moved to core)","legacyToResult dead helper (Phase 5 M4)"],"changed":["server.js version 0.1.0 -> 0.1.1","server.js tool count description"]}' \
  --reason "Plan 1b ships review findings remediation; 1 Critical, 5 Important, 5 Minor items addressed." \
  --evidence_journal "docs/journals/260622-phase-d-plan-1b-shipped.md" \
  --evidence_code_ref "tools/learning-loop-mcp/tools/task-update.js:1"
```

### Step 3 — File new active finding if Path B (per Red Team Finding 3)

> **Revocation mechanism correction:** `meta_state_patch` cannot un-resolve a finding because `resolved_at` and `resolved_by` are in the immutable-field deny-list. The original `meta-260622T1439Z-...` entry stays resolved (per Plan 1a's closure note). Plan 1b files a NEW active finding to track the upstream gap, with cross-reference to the closed entry.

If Phase 2 took Path B (wrapper deleted), file a new active finding:

```bash
mcp__learning-loop-mastra__meta_state_report \
  --id "meta-260622T????Z-claude-code-task-update-interface-still-missing" \
  --category "loop-anti-pattern" \
  --severity "escalate" \
  --affected_system "meta" \
  --description "Plan 1b Phase 2 Path B reverted Plan 1a's wrapper: no working programmatic Claude Code task-update interface found. The original meta-260622T1439Z-... entry stays resolved per Plan 1a's closure note. This new finding tracks the upstream TaskUpdate structural fix separately. Reopens the original's intent without violating meta_state_patch's immutable-field deny-list." \
  --subtype "taskupdate-noop-undetected" \
  --evidence_code_ref "tools/learning-loop-mcp/tools/task-update.js" \
  --evidence_journal "docs/journals/260622-phase-d-plan-1b-shipped.md"
```

### Step 4 — Write journal entry (renumbered from Step 6)

Create `docs/journals/260622-phase-d-plan-1b-shipped.md`:

```markdown
# Phase D Plan 1b — Shipped Journal

**Date:** 2026-06-22
**Branch:** `260622-1810-phase-d-plan-1a-parity-tightening` (continuation)
**Plan:** `plans/260622-2119-phase-d-plan-1b-review-fixups/`
**Change-log entry:** `meta-260622T????Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md`
**Source review:** `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md`

## Summary

Plan 1b ships the 11 review findings from Plan 1a (PR #9) review. Plan 1a's PR review returned 1 Critical defect (TaskUpdate wrapper broken in production), 5 Important defects (envelope duplication, SessionStart deadlock risk, version/count drift, test-count doc drift), and 5 Minor concerns. Plan 1b addresses all 11.

## Outcomes per Finding

(Use the table from Step 1; copy-paste with concrete evidence)

## Decisions

1. **C1 fix path.** [Path A / B / C chosen in Phase 1]. Rationale: ...
2. **Envelope consolidation.** `stripEnvelope` and `stripMcpContentEnvelope` are kept as separate canonical strippers in `#mcp/core/envelope-stripper.js` because they handle genuinely different envelope forms. The factory-level preprocess uses `stripMcpContentEnvelope`; per-field preprocess in legacy workflows uses `stripEnvelope`.
3. **SessionStart hook rewrite.** Adopted direct `buildDiscoverabilityHints()` import from `core/loop-introspect.js` instead of the previous hand-rolled JSON-RPC + MCP server spawn pattern. Hand-rolled JSON-RPC was the documented deadlock root cause in `meta-260621T1743Z`; reusing it in the SessionStart hook was a regression of that lesson. Per Red Team Finding 2, the new approach eliminates the MCP server spawn entirely (the constant is frozen at module load).

## Lessons

### What was hard

1. ...

### What would be different

1. ...

## Forward-looking

- **Plan 3 (agents)** is unblocked. [If Path B: agents must implement their own TaskUpdate workaround or accept the finding as deferred. If Path A: agents use the working wrapper.]
- **Plan 4 (cutover)** continues to own the cold-session discoverability enumeration update.

## Unresolved questions

(0 or list)

## Acceptance gate

> *"pnpm test exits 0; all 11 findings have documented outcomes; meta-state reflects the change; journal entry shipped."*

**Verified:**
- `pnpm test` 9 globs, ___ pass / 0 fail / 1 skipped ✓
- C1 outcome: ___ ✓
- I1-I5 outcomes: ___ ✓
- M1-M5 outcomes: ___ ✓
- Cold-tier regression: pass ✓
```

### Step 7 — Update PR body (if Plan 1b PR is separate from Plan 1a's)

If shipping as additional commits on Plan 1a's PR (recommended for atomicity):

- Update the existing pr-body.md §"Test evidence" with the new test count.
- Add a new §"Plan 1b follow-up" summarizing the 11 finding outcomes.

If shipping as a new PR:

- Create `plans/260622-2119-phase-d-plan-1b-review-fixups/pr-body.md` mirroring the structure of Plan 1a's pr-body.

### Step 8 — Update master tracker (if applicable)

Per Plan 1a's pr-body "Out of scope" section, the master tracker (`plans/reports/productization-260612-1530-master-tracker.md`) is not flipped in Plan 1a or 1b. Plan 1b continues the atomic-fix discipline: no master-tracker flip.

## Success Criteria

- [x] Phase 6.1 — `pnpm test` exits 0
- [x] Phase 6.2 — `meta_state_log_change` filed for Plan 1b
- [x] Phase 6.3 — New active finding filed for upstream TaskUpdate gap (if Path B)
- [x] Phase 6.4 — Journal entry shipped
- [x] Phase 6.5 — PR body updated (or new pr-body.md created)
- [x] Phase 6.6 — All 11 findings have a documented outcome in the journal

> **Steps removed per Red Team Finding 11:** Original Steps 4 (refresh-fingerprints-pre-closeout) and 5 (cold-tier regression) are dropped. Both are already in `pnpm test` (via `run-pnpm-test-namespaced.mjs`) and are not Plan 1b's responsibility (Plan 1a Phase 7 and Plan 4 own them, respectively).

## Risk Assessment

- **`pnpm test` fails after Phase 2-5 changes.** Risk: medium. Refactor or test changes may regress. Mitigation: each phase runs `pnpm test` after its own changes; failures are caught early. If Phase 6 reveals a regression, debug back to the offending phase.
- **New active finding for TaskUpdate (Step 3) duplicates the original.** Risk: low. The new finding cross-references the original `meta-260622T1439Z-...` entry (which stays resolved). Future readers can trace the lineage via the cross-reference; meta_state_query_drift surfaces the new finding if it drifts.
- **Journal entry contradicts Plan 1a's journal.** Risk: low. Plan 1a's journal is preserved unchanged (append-only per Red Team Finding 14); Plan 1b's journal adds new context. If conflict is unavoidable (e.g., Path B's new finding cross-references a closed entry), the journals cross-reference each other.
- **PR body length is unwieldy.** Risk: low. Plan 1a's pr-body is already 87 lines; adding Plan 1b context may exceed 200 lines. Mitigation: split into Plan 1a's pr-body (preserved) and Plan 1b's follow-up section.

## References

- `plans/reports/from-code-reviewer-to-planner-260622-2119-phase-d-plan-1a-review-report.md` (review findings source)
- `plans/260622-2119-phase-d-plan-1b-review-fixups/plan.md` (this plan)
- `plans/260622-1810-phase-d-plan-1a-parity-tightening/plan.md` (parent plan)
- `docs/journals/260622-phase-d-plan-1a-shipped.md` (Plan 1a journal; preserved)
- `tools/scripts/refresh-fingerprints-pre-closeout.mjs` (closeout fingerprint refresh)
- `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` (cold-tier e2e check)

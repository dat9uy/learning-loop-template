---
phase: 6
title: "Docs + verification + closeout"
status: pending
priority: P2
dependencies: [5]
---

# Phase 6: Docs + verification + closeout

## Overview

Final phase: update cross-references (plan 260626-1535 footer, scope report), run the full test suite (13 namespaces), verify the cold-tier regression test still passes, and prepare the ship-ready state. Phase E Registry Drift is complete when:
- All 4 prior review CRITICAL/IMPORTANT items closed
- `pnpm test` GREEN across all 13 namespaces
- `meta_state_consistency_check` is the canonical probe for status/audit-field drift
- Plan 260626-1535 footer points to this plan as the corrective layer
- Phase E scope report updated to reflect the new tool + drift fix

## Requirements

### Functional
- `pnpm test` GREEN across all 13 namespaces
- Cold-tier regression test GREEN (Phase 6 sweep-success assertion still ≤ 1 stale)
- `meta_state_consistency_check` documented in `docs/` or surface-relevant location
- Plan 260626-1535 footer updated to reference this plan
- Phase E scope report updated to record the new tool + 3-orphan fix
- Conventional commit filed (or batched with prior commits per the user's preferred workflow)

### Non-functional
- All edits read-before-write (no accidental overwrites)
- No AI references in commit messages
- Subject lines ≤ 72 chars
- Plan documentation follows the project's `documentation-management.md` rules

## Architecture

Phase 6 is a coordination + verification phase. No new code. Focus on:
1. Verifying everything still works after Phases 1-5
2. Closing the documentation loop (cross-references between plans)
3. Closing the audit trail (review items marked resolved)

The plan-7-fix footer update is the key documentation closure: it explicitly references Plan 8 (this plan) as the corrective layer for the registry drift class.

## Related Code Files

- **Read for verification:**
  - `meta-state.jsonl` (final state)
  - `tools/learning-loop-mastra/tools/legacy/manifest.json` (new tool entry)
  - `tools/learning-loop-mastra/core/consistency-check.js` (new function)
  - `tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js` (new tool)
- **Modify:**
  - `plans/260626-0720-phase-e-stale-sweep/plan.md` (footer reference — Plan 7 → Plan 8)
  - `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (record new tool + drift fix)
  - `docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md` (already updated in Phase 5)

## Implementation Steps

### Step 1: Run full test suite
```bash
pnpm test
```

Expect: all 13 namespaces GREEN, 0 failures. Capture the full output for the journal.

### Step 2: Run cold-tier regression specifically
```bash
node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js
```

Expect: 1/1 GREEN. The Phase 6 sweep-success assertion (added in Plan 7 Fix) must still report ≤ 1 stale.

### Step 3: Run consistency check + record final state
```bash
mcp__learning-loop__mastra_meta_state_consistency_check
```

Expect: `drift_count: 0`, `drift_events: []`. Capture the response.

### Step 4: Update Plan 7 footer
Edit `plans/260626-0720-phase-e-stale-sweep/plan.md` (the original Plan 7 plan that shipped with the broken batch) — add reference to this plan:

```markdown
**Status (extended):** Done — **corrected by Plan 7 Fix (`plans/260626-1535-phase-e-stale-sweep-fix/`) and Plan 8 (`plans/260626-1734-phase-e-registry-drift-fix/`)**. Plan 7 Fix applied the corrective batch + sweep-success assertion. Plan 8 implemented `meta_state_consistency_check` (the canonical probe per active finding `meta-260614T1236Z`) and fixed the 3 audit-trail orphans the probe surfaced, plus backfilled `last_verified_at` on the 10 transitioned entries.
```

### Step 5: Update phase-e scope report
Edit `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (or the latest version in the reports dir):
- Find the "What shipped in Phase E" section (or equivalent)
- Add a new entry for Plan 8: tool name, file paths, drift count fixed (3), cross-references to the journal + diagnostic report
- Bump the report revision number per the report's convention (likely Rev 10 or whatever the next number is)

### Step 6: Verify plan file references
```bash
grep -rn "260626-1734-phase-e-registry-drift-fix\|meta_state_consistency_check" plans/ docs/ 2>/dev/null | head -20
```

Expect: references in plan 260626-0720 footer (just added), phase-e scope report (just added), journal (added in Phase 5), review report (marked resolved in Phase 5).

### Step 7: Conventional commit(s)
Per the project's conventional commit format, file commits. Subject ≤ 72 chars, body 2-3 sentences explaining what + why.

Suggested commits (or one combined commit per operator preference):
1. `feat(meta-state): add consistency_check probe for status/audit-field drift`
   - Tools/learning-loop-mastra/core/consistency-check.js (new)
   - Tools/learning-loop-mastra/tools/legacy/meta-state-consistency-check-tool.js (new)
   - Tools/learning-loop-mastra/tools/legacy/manifest.json (modify)
   - 16 + 8 tests (new)
2. `chore(phase-e): fix 3 audit-trail orphans via supersede/ack`
   - meta-state.jsonl (modify — 2 supersede, 1 ack)
3. `chore(phase-e): backfill last_verified_at on 10 transitioned entries`
   - meta-state.jsonl (modify)
   - docs/journals/260626-phase-e-plan-7-stale-sweep-shipped.md (modify)
4. `docs(phase-e-plan-8): closeout + cross-references`
   - plans/260626-0720-phase-e-stale-sweep/plan.md (modify)
   - plans/reports/phase-e-scope-... (modify)
   - plans/reports/code-review-260626-1704-... (modify)
   - plans/reports/diagnostic-260626-1734-... (new)

Or single combined commit:
- `chore(phase-e): registry consistency-check + orphan fix + review followups`
- Body references all the above + the plan path

The user's preferred commit cadence determines granularity. Default: 4 small commits (each independently revertable) unless operator requests a single combined commit.

### Step 8: Confirm clean working tree
```bash
git status
git log --oneline -1
```

Expect: clean working tree after the commits; `git log` shows the new commits on `phase-e/plan-3-housekeeping` branch.

## Success Criteria

- [ ] `pnpm test` GREEN across all 13 namespaces
- [ ] Cold-tier regression test GREEN
- [ ] `meta_state_consistency_check` returns drift_count = 0
- [ ] Plan 260626-0720 footer references Plan 8
- [ ] Phase E scope report updated
- [ ] Conventional commit(s) filed
- [ ] Working tree clean
- [ ] Review items CRITICAL-1, CRITICAL-2, CRITICAL-3, IMPORTANT-1 all marked RESOLVED
- [ ] Plan 8 status flipped to "done" in the CLI dashboard

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `pnpm test` fails due to test isolation or timing | Run twice; if still flaky, it's not this plan's bug |
| Cold-tier regression fails because some change introduced unexpected drift | Re-run consistency check to diagnose; fix the root cause |
| Scope report revision number conflicts with another concurrent edit | Check git log for the latest revision; bump accordingly |
| Plan 7 footer edit creates conflicting cross-references | Use explicit "Plan 7 → Plan 7 Fix → Plan 8" lineage in the footer text |
| Commit subject exceeds 72 chars | Trim per project conventions; commit body explains what + why |
| Working tree has unrelated changes | `git status` Step 8 catches this; abort and clean before commit |

## TDD Gate

All of the following must be GREEN:
1. `pnpm test` — 13 namespaces, 0 failures
2. `node --test tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` — 1/1 pass
3. `mcp__learning-loop__mastra_meta_state_consistency_check` — drift_count = 0

If any fail, the plan is incomplete — investigate before declaring done.
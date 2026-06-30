---
phase: 5
title: "Verify gate parity end-to-end"
status: pending
priority: P2
dependencies: [phase-04-implement-ci-swap]
---

# Phase 5: Verify gate parity end-to-end

## Overview
Run the full PR-gate flow against the new Action to confirm parity with the hand-rolled step's gate semantics. Capture the Action's `verdict`, `gate`, and SARIF output as evidence. Resolve any meta-state findings opened during the swap.

## Requirements

- **Functional:**
  - Open a PR from a clean branch with no fallow-relevant changes; confirm `verdict=pass`
  - Open a PR with an intentional fallow-relevant change (e.g., add an unused export); confirm `verdict=fail`
  - Open a PR that touches `.fallowrc.json`; confirm config-changed special case triggers (researcher #2 §5: analyze.sh:75-100 auto-disables changed-since for dead-code baseline comparison)
  - Download the SARIF artifact on a failing run; confirm Code Scanning category is `fallow` (single category)
- **Non-functional:**
  - All 1369+ existing tests pass
  - Meta-state registry entries opened during swap are resolved or escalated

## Related Code Files

- Modify: `meta-state.jsonl` (resolve findings opened during Phases 3-4)
- Modify: `docs/journals/260629-fallow-tools-v2-action-swap-shipped.md` (ship journal)
- No production code

## Implementation Steps

### PR gate parity tests

1. **Open "no-change" PR** (clean branch, force-push a commit that only adds a test comment) on the working branch. Verify:
   - Workflow step `Fallow audit (PR gate)` runs and exits 0
   - `verdict` output is `pass`
   - `gate` output is `new-only`
   - Code Scanning receives a SARIF upload under `category: fallow`
   - `changed-files-unavailable` output is `false`

2. **Open "intentional-fail" PR** (add a file that creates an unused export, e.g., a stub `tools/learning-loop-mastra/core/__test-fallow-flag.js` that no other file imports). Verify:
   - `verdict` output is `fail`
   - `gate` output is `new-only`
   - Workflow exits 1; PR checks turn red
   - SARIF artifact `fallow-sarif` (failure upload) contains the new finding

3. **Open "config-touching" PR** (modify `tools/learning-loop-mastra/.fallowrc.json` by adding a comment or reordering keys; do not change semantics). Verify:
   - `verdict` output is `pass`
   - Auto-changed-since auto-disable warning appears in the run log (researcher #2 §5: analyze.sh:75-100)

4. **Local parity check** — run `pnpm exec fallow audit --root tools/learning-loop-mastra --gate new-only --changed-since origin/main --format sarif --output-file /tmp/local-audit.sarif` against the same branch state. Diff against the CI SARIF (`/tmp/ci-audit.sarif` from the no-change PR). Confirm:
   - Both SARIFs have the same `runs[].tool.driver.name`
   - Both have the same rule taxonomy (`code-duplication`, `complex*`, `crap*`, `unused*`, etc.)
   - Findings counts match

### Resolve meta-state findings

5. **Audit registry for new findings** — `meta_state_list({ entry_kinds: ["finding"] })` filtered to recent timestamps. For any finding opened during this swap (e.g., a consult-checklist reminder finding, a missed step warning):
   - If the underlying issue is real: leave active; document in journal
   - If superseded: resolve via `meta_state_resolve` with the swap's PR URL as evidence

6. **Flip the loop-design entry** to inactive:
   ```bash
   meta_state_patch({
     id: "loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall",
     entry_kind: "loop-design",
     patch: {
       status: "inactive",
       shipped_in_plan: "plans/260629-2011-fallow-tools-v2-action-swap/",
       shipped_at: "<iso-now>"
     }
   })
   ```

### Ship journal

7. **Write ship journal** at `docs/journals/260629-fallow-tools-v2-action-swap-shipped.md` with:
   - Summary: 1-paragraph description of what shipped
   - Before/after LoC: ~240 → ~140 (-100 LoC, ~42% reduction)
   - Test count delta: 1369 → 1377 (+8 new workflow-shape cases)
   - Migration decision outcome (D1-D4)
   - PR URLs for the 3 parity-test PRs
   - SARIF evidence (Code Scanning link from no-change PR)
   - Unresolved questions for follow-up (if any)

## Success Criteria

- [ ] No-change PR exits 0 with `verdict=pass`
- [ ] Intentional-fail PR exits 1 with `verdict=fail` and SARIF artifact uploaded
- [ ] Config-touching PR runs the config-changed special case (warning visible in logs)
- [ ] Local and CI SARIFs match in structure and finding counts
- [ ] Loop-design entry flipped to `status: inactive` with `shipped_in_plan` set
- [ ] Change-log entry recorded (Phase 3's was for the rule; this is for the CI swap)
- [ ] Ship journal exists

## Risk Assessment

- **Risk:** Local `fallow` is 2.102.0; CI uses the same (per `version:` input). If the SARIF formats diverge, the parity test fails. **Mitigation:** both use the same binary version; format divergence would be a fallow bug, not our integration.
- **Risk:** Code Scanning category change (3 → 1) breaks a saved Code Scanning dashboard query. **Mitigation:** post a one-time note in #engineering-announcements or equivalent; the `command` field in SARIF results preserves the analyzer identity for new queries.
- **Risk:** Future fallow versions (3.x) break the `gate: new-only` semantics. **Mitigation:** Action pins `version: "2.102.0"`; bumping requires an explicit decision and baseline regeneration.

## TDD Note

This phase is integration verification, not unit-test TDD. The "test" is the PR-gate parity evidence. Each PR is a controlled experiment; the SARIF diff is the assertion.

## Open Follow-ups (post-shipping)

- (Optional) Enable `comment: true` on Action for PR-body summary; defer until operators request.
- (Optional) Relocate baselines from `plans/.../reports/fallow/` to `tools/learning-loop-mastra/.fallow-baselines/` for cleaner ergonomics; defer until Action ergonomics become a complaint.
- (Optional) Bump `fallow` to 2.103.x in a follow-up plan; regenerate baselines; verify `audit.gate` config-honoring.
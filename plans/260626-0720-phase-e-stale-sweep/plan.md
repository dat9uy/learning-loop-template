---
title: "Phase E Stale Sweep: Re-verify 16+ stale mechanism_check=true entries"
description: "STUB PLAN — sweep the 16+ meta-state entries with status=stale + mechanism_check=true that Plan 3 (phase-e-housekeeping) could not address. Each entry needs meta_state_check_grounding + meta_state_re_verify (or meta_state_patch) to transition stale → active. Scope to be determined when this plan is authored."
status: pending
priority: P3
branch: ""
tags: [phase-e, housekeeping, registry-lifecycle, stale-sweep]
blockedBy: [260626-0607-phase-e-housekeeping]
blocks: []
created: "2026-06-26T07:20:00.000Z"
createdBy: "ck:plan"
source: skill
---

# Phase E Stale Sweep (STUB)

> **Status:** Placeholder plan created on 2026-06-26 as a follow-up to `plans/260626-0607-phase-e-housekeeping/plan.md`. Not yet authored.
> **Trigger:** Red-team review of Plan 3 flagged that Plan 3 only addresses 1 of 16+ stale `mechanism_check=true` entries (entry `meta-260618T0558Z-...`). Operator decision: create a separate plan stub to avoid scope creep in Plan 3.

## What this plan will ship (TBD)

The full plan will sweep all `meta-state.jsonl` entries where `status: "stale"` AND `mechanism_check: true` AND age > 30 days. For each entry:
1. Verify the `evidence_code_ref` path still exists
2. Run `meta_state_check_grounding` to confirm the fingerprint is grounded
3. If grounded: transition `stale → active` via `meta_state_re_verify` (if `verification.steps` exist) OR `meta_state_patch` (if not, per Plan 3's D7 redesign)
4. If ungrounded: refresh fingerprint via `meta_state_refresh_fingerprint` first, then transition
5. File a `meta_state_log_change` at plan completion

## Open questions (resolve before authoring)

1. **How many entries are actually stale + mechanism_check=true today?** Plan 3 estimated 16+ based on red-team Unresolved Q5; need a precise count via `meta_state_list --filter "status=stale,mechanism_check=true"`.
2. **What is the oldest entry's age?** Affects whether the 30-day window is appropriate.
3. **How many entries lack `verification.steps`?** Plan 3's D7 redesigned the Phase 5 mechanism because entry #9 lacks `verification.steps`; if most entries lack them too, the meta_state_patch approach may be more efficient than re-verify.
4. **Should this plan batch the operations?** Per Plan 1's `meta_state_batch` precedent (one atomic call for 7 entries in PR #15), a batch op would be safer than N individual patches.
5. **Does the cold-tier regression test (`cold-tier-regression.test.cjs`) need updating?** It currently iterates `mechanism_check=true` findings; after the sweep, all should be `active` + grounded. The test should still pass but the cold-cache may need regeneration.

## Cross-references

- Plan 3 (DONE): `plans/260626-0607-phase-e-housekeeping/plan.md` — established the meta_state_patch mechanism for entries without `verification.steps`
- Red-team review: `plans/reports/general-purpose-260626-0616-phase-e-plan-3-housekeeping-red-team-review-report.md` (Unresolved Q5: 16+ stale mechanism_check=true entries)
- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (Rev 6 § I-2; entry #9 specifically)

## Recommended next move

When ready to author:
1. Run `meta_state_list --filter "status=stale,mechanism_check=true"` to get the exact count + entry ids
2. For each entry, run `meta_state_check_grounding` to determine which are grounded vs drifted
3. Author the plan with a `meta_state_batch` op that handles all entries in 1 atomic call (per Plan 1 D10 precedent)
4. Set `_expected_version` per entry (CAS) to prevent race with concurrent writers
5. File `meta_state_log_change` at plan completion referencing this plan

Do NOT use `meta_state_re_verify` for entries that lack `verification.steps` (returns `no_verification_steps` error per Plan 3 red-team C1).

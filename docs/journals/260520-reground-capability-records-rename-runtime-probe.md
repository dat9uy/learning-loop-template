# Re-ground capability records on index entries + rename "capability script" to "runtime probe"

**Date**: 2026-05-20 17:00
**Severity**: Low
**Component**: `records/capabilities/`, `docs/`, editorial terminology
**Status**: Resolved

## What Happened

Completed two-phase plan to fix Layer-1/Layer-2 terminology drift in capability records.

**Phase 1 — Re-ground on live index entries:**
`capability-fastapi-reference-rest` and `capability-tanstack-reference-render` were anchored on frozen claims. Switched both to index entry `assertion-vnstock-data-runtime-live-api-surfaces-verified`. Restored agent-orientation chain: capability → assertion → evidence → experiment → runtime probe.

**Phase 2 — Rename across 12 active docs:**
"capability script" → "runtime probe", "Capability Runtime Experiment" → "Runtime Probe Experiment" in docs/READMEs/skill-references. Journals and historical plans left untouched by policy.

## The Brutal Truth

This was pure editorial hygiene. No functional change, no schema change, no code change. But the drift mattered because "capability script" was ambiguous — it sounded like a Layer-2 ledger artifact when it is actually a Layer-1 executable. The renaming disambiguates that. The re-grounding restores the chain of trust from capability record down to the live runtime probe. Simple, tedious, necessary.

## Technical Details

- `records/capabilities/capability-fastapi-reference-rest.yaml` — switched `reference` from frozen claims to live assertion entry.
- `records/capabilities/capability-tanstack-reference-render.yaml` — same.
- 12 docs/READMEs/skill-references updated (see file list in plan report).
- Validation: `pnpm validate:records` — 78 records, 0 errors.
- Validation: `pnpm check` — 144 tests, 0 failures.

## What We Tried

Straightforward find-and-replace with policy guardrails (no journals, no historical plans). Two-phase execution per plan. No blockers.

## Root Cause Analysis

Terminology drift accumulated during rapid bootstrap. "Capability script" emerged as shorthand and stuck. It conflated the executable artifact (Layer 1) with the ledger record (Layer 2). The frozen-claim anchoring was a holdover from pre-index-first architecture.

## Lessons Learned

- Name things by their layer. "Script" is too generic in a system with three layers.
- Live index entries are the ground truth; frozen claims are historical context, not primary anchors.
- Editorial-only changes still need full validation runs — good habit, no exceptions.

## Next Steps

- None. Plan closed. No follow-up tasks.

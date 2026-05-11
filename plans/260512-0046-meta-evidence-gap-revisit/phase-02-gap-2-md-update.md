---
phase: 2
title: "Gap 2 MD Update"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 2: Gap 2 MD Update

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`
- Gap MD: `records/evidence/meta/capability-schema-gap.md`
- Existing schema: `schemas/capability.schema.json`
- Approved capability records (current N=2):
  - `records/capabilities/capability-fastapi-reference-rest.yaml`
  - `records/capabilities/capability-tanstack-reference-render.yaml`
- Loop policy: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`

## Overview

Gap 2's original observation ("`capabilities.yaml` has no schema, and the current template permits an empty array") is **stale** — `schemas/capability.schema.json` now exists in a minimal map-oriented form. The trigger (`N>=3 packs verified`) is **not yet met** — 2 approved capabilities + 1 verified install path. Phase records partial supersession + re-pins the trigger; no schema edits.

## Key Insights From Brainstorm

Field disposition table (gap-proposed vs current schema):

| Gap-proposed field | Status in current schema | Disposition |
|---|---|---|
| id | present | superseded |
| description | absent | hold for N>=3 |
| method | absent (replaced by `maps[].source` etc.) | hold; revisit when another stack lands |
| prerequisites | absent | hold for N>=3 |
| verified_by | partial via `source_refs[]` | partially superseded |
| scope | absent (schema uses `stack` + `surface` instead) | structurally replaced by different axis |
| publication status | present as `status` enum | superseded |

Schema took a *map-oriented* shape (`stack` + `surface` + `maps[]`) rather than the *predicate-oriented* shape (id/description/method/prerequisites) the gap proposed. This is an axis change, not just field absence. Drift origin: `decision-20260510T160000Z-capabilities-stack-migration`.

## Requirements

### Functional
- Gap 2 MD gains a `## Partial Supersession` section with field disposition table + structural-drift note.
- Gap 2 MD `## Trigger` re-pinned with current population count and explicit gap-to-trigger arithmetic.
- Original Observation / Evidence / Proposed Improvement / Deferral Note text preserved (history is not rewritten).

### Non-Functional
- No schema edits.
- No new capability records.
- No edits to the two existing approved capability records.
- No new fields proposed in this phase (deferred until N>=3 trigger fires).

## Architecture

### Edit shape

Add two sections to `records/evidence/meta/capability-schema-gap.md`:

1. `## Partial Supersession` — table + structural-drift note + citation to `decision-20260510T160000Z-capabilities-stack-migration`.
2. Update `## Trigger` block: state current count (1 verified install + 2 approved capabilities = N=2 surrogate); explicit "one more verified pack required"; preserve event-class semantics.

Existing sections preserved verbatim:
- Observation
- Evidence
- Proposed Improvement
- Deferral Note

## Related Code Files

- Modify: `records/evidence/meta/capability-schema-gap.md`

## Implementation Steps

1. Re-read `records/evidence/meta/capability-schema-gap.md` and `schemas/capability.schema.json` to confirm the field-disposition table is still accurate at edit time.
2. Insert `## Partial Supersession` section after `## Proposed Improvement`:
   - Table: gap-proposed field | status in current schema | disposition.
   - Structural-drift paragraph: explain map-oriented vs predicate-oriented axis change; cite `decision-20260510T160000Z-capabilities-stack-migration`.
3. Update `## Trigger` block:
   - Add: "Current population (2026-05-12): 1 verified install path (sandbox-1) + 2 approved capability records (fastapi-reference-rest, tanstack-reference-render). N=2 surrogate. Threshold N>=3 not yet met."
   - Preserve event class + threshold + action semantics.
4. Do not edit `schemas/capability.schema.json`.
5. Do not edit `records/capabilities/capability-fastapi-reference-rest.yaml` or `records/capabilities/capability-tanstack-reference-render.yaml`.

## Todo List

- [ ] Re-read Gap 2 MD + capability schema (confirm field disposition)
- [ ] Insert `## Partial Supersession` section
- [ ] Update `## Trigger` block with current count

## Success Criteria

- [ ] `## Partial Supersession` section present with field-disposition table
- [ ] Structural-drift paragraph cites `decision-20260510T160000Z-capabilities-stack-migration`
- [ ] `## Trigger` block states current population count + N>=3 gap
- [ ] Schema file unchanged
- [ ] Approved capability records unchanged
- [ ] File passes `pnpm validate:records` (deferred to Phase 3)

## Risk Assessment

- **Risk:** Adding sections to an existing meta-evidence file may look like history rewriting.
  **Mitigation:** Append new sections only; do not edit Observation / Evidence / Proposed Improvement / Deferral Note text. State explicitly that the original observation is stale-but-preserved.
- **Risk:** Operator may prefer to mark the original `scope` field as "deferred-and-now-replaced-axis" rather than "structurally replaced".
  **Mitigation:** Use the brainstorm-recommended phrasing ("structurally replaced by stack/surface"); operator can refine wording during review.

## Security Considerations

- No credentials, raw external data, or private artifacts touched.
- All edits are in a meta-evidence file under `records/evidence/meta/`.

## Next Steps

- Phase 3 runs validation gates that cover edits from Phases 1 + 2.
- If operator wants a pinned meta-decision for the partial-supersession state, Phase 3 produces it.

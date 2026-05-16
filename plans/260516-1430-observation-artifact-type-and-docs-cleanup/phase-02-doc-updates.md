---
phase: 2
title: Doc Updates
status: completed
priority: P1
effort: 30m
dependencies:
  - 1
---

# Phase 2: Doc Updates

## Overview

Update `artifact-reference.md`, `charter.md`, and `operator-guide.md` to reflect observation as a typed record. Merge glossary from `handoff.md` into `artifact-reference.md`.

## Requirements

- Functional: all 3 docs mention observations; artifact-reference has full schema section; glossary preserved
- Non-functional: no redundant content across docs

## Related Code Files

- Modify: `docs/artifact-reference.md`
- Modify: `docs/charter.md`
- Modify: `docs/operator-guide.md`

## Implementation Steps

1. Update `docs/artifact-reference.md`:
   - Add `observation` to the `type` enum in Common Fields table (line ~112): `claim`, `experiment`, `decision`, `risk`, `capability`, `observation`
   - Add "Observation" section after "Capability" section (~line 213):
     | Field | Type | Required | Allowed Values |
     |---|---|---|---|
     | `schema_version` | string | yes | free |
     | `type` | const | yes | `observation` |
     | `status` | enum | yes | `active`, `archived` |
     | `created_at` | string | yes | ISO-8601 pattern |
     | `updated_at` | string | yes | ISO-8601 pattern |
     | `source_refs` | array | yes | items: `^(local\|record\|legacy):.+` |
     | `notes` | string | no | free |
   - Remove observations from "Unschematized Record Types" table (line ~300-302)
   - Add "Capability Term Glossary" section at end (merged from handoff.md lines 12-22)

2. Update `docs/charter.md`:
   - Line 10: change "claims, risks, experiments, decisions, capability records" → "claims, risks, experiments, decisions, capability records, observations"
   - Line 29: change "claims, risks, experiments, decisions, capability records" → "claims, risks, experiments, decisions, capability records, observations"

3. Update `docs/operator-guide.md`:
   - Add to "Artifact Patterns" table (after Capability row, ~line 42):
     | Observation | `records/observations/` | `observation-<scope>-<slug>.yaml` | No |
   - Add to "Agent Intake Flow" step 1 classifications (~line 144): "observation capture"
   - Add to "Adding Or Updating Records" (~line 72): step for observation records
   - Add to "Agent Anti-Confusion Checklist" (~line 376): "Am I recording factual state as observations, not claims?"

## Success Criteria

- [ ] `artifact-reference.md` has observation schema section + glossary
- [ ] `artifact-reference.md` no longer lists observations as unschematized
- [ ] `charter.md` mentions observations in scope
- [ ] `operator-guide.md` has observation naming convention, intake flow, and checklist entries
- [ ] Glossary from handoff.md is preserved in artifact-reference.md

## Risk Assessment

- Low risk: documentation changes only
- Glossary merge: verify no content lost from handoff.md

---
title: Observation Artifact Type & Docs Cleanup
description: >-
  Formalize observation as a typed record with schema, migrate existing files,
  update docs, delete redundant handoff.md
status: completed
priority: P2
branch: main
tags:
  - schema
  - docs
  - observation
blockedBy: []
blocks: []
created: '2026-05-16T09:24:39.038Z'
createdBy: 'ck:plan'
source: skill
brainstorm: >-
  plans/reports/brainstorm-20260516-observation-artifact-type-and-docs-cleanup.md
---

# Observation Artifact Type & Docs Cleanup

## Problem

The state-machine plan created observation files under `records/observations/` but never formalized "observation" as a typed record. Observations are unschematized, undocumented, and `handoff.md` is redundant.

## Solution

1. Create `observation.schema.json` (loose common envelope, no `additionalProperties: false`)
2. Migrate 3 existing observation files to add envelope fields
3. Update `artifact-reference.md`, `charter.md`, `operator-guide.md`
4. Delete `handoff.md`, merge glossary into `artifact-reference.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema + Migration](./phase-01-schema-migration.md) | Completed |
| 2 | [Doc Updates](./phase-02-doc-updates.md) | Completed |
| 3 | [Delete handoff.md](./phase-03-delete-handoff-md.md) | Completed |
| 4 | [Validation](./phase-04-validation.md) | Completed |

## Key Decisions

- Observation status: `active` / `archived` (no review/approval — factual state captures)
- Loose schema: common envelope + freeform body fields
- Validation tool auto-discovers schemas from `schemas/{type}.schema.json` — no tool changes needed

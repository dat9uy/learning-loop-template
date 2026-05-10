---
title: "Capabilities Stack Migration"
description: "Relocate capability scripts under per-stack homes. Extend validator allowlist to permit capability records to cite local capability code via a glob pattern. Land before any product-build plan."
status: pending
priority: P1
branch: "main"
tags: [capabilities, stack, migration, schema, validator]
blockedBy: []
blocks: [plans/260510-1600-fastapi-reference-build]
created: "2026-05-10T08:25:30.824Z"
createdBy: "ck:plan"
source: skill
---

# Capabilities Stack Migration

## Overview

Current layout pins all capabilities under `product/capabilities/<scope>/`. This worked for the mono-stack era (one Python venv, vnstock-data only). It breaks the moment the product becomes polyglot:

- Python capability scripts live in `product/capabilities/vnstock-data/*.py`.
- Future TypeScript probes would need a different runtime, different test runner, different deps. They cannot share a directory tree with Python probes.
- The validator's current allowlist hard-blocks `local:product/...` in `source_refs` of any record. So capability records cannot machine-link to their probe code at all today.

This plan scopes the standalone migration: relocate capabilities, name the per-stack subdirectory convention, design the validator widening as a glob, and harmonize docs/skill — landing before any FastAPI/TanStack code is written.

## Phases

| Phase | Name | Status | Type |
|-------|------|--------|------|
| 1 | [Pre-Migration Records](./phase-01-pre-migration-records.md) | Pending | loop |
| 2 | [Validator and Schema](./phase-02-validator-and-schema.md) | Pending | code |
| 3 | [Fixture Tests](./phase-03-fixture-tests.md) | Pending | code |
| 4 | [Filesystem Migration](./phase-04-filesystem-migration.md) | Pending | code + shell |
| 5 | [Doc and Skill Harmonize](./phase-05-doc-and-skill-harmonize.md) | Pending | loop + code |
| 6 | [Post-Migration Records](./phase-06-post-migration-records.md) | Pending | loop |

## Dependencies

- `pnpm validate:records` passes on current tree (green baseline verified).
- Operator approval before phase 02 (schema field shape + per-record-type allowlist table).
- Operator approval before phase 04 (filesystem migration: git mv, venv recreate).
- Sibling plan `plans/260510-1600-fastapi-reference-build` is blocked by this plan.

## Key Constraints

- **Frozen records:** No edits to `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`.
- **Qualified terminology:** Never bare "capability". Always **capability script**, **capability record**, or **Capability Runtime Experiment**.
- **No product code:** No FastAPI source (`product/api/src/*.py`) or TanStack code (`product/web/src/*.tsx`).
- **No user/feature language:** No "user" or feature-story language anywhere.
- **Stack manifest convention:** Every `product/<stack>/` MUST contain a stack manifest (`pyproject.toml`, `package.json`, `go.mod`, ...). Reviewers gate in PR; validator does not enforce.

## Success Criteria

- `pnpm validate:records` passes against the live tree.
- `pnpm check` passes.
- New capability fixture (positive case) validates green.
- Three new negative fixtures fail with expected error strings.
- `product/api/capabilities/vnstock-data/capability-00-discovery.py` runs successfully against `product/api/.venv`.
- `git ls-files product/` shows no entries under old `product/capabilities/` path.
- `claim-loop-capabilities-stack-allowlist.verification.runtime` flipped to `verified`.
- `decision-<ts>-capabilities-stack-migration` approved.
- All living docs reference `product/<stack>/capabilities/`. No living doc references `product/capabilities/`.
- Frozen records untouched (zero changes in `git diff`).

---
title: "Migration Execution — Machine-Extracted Index Prototype Seeds"
description: "Execute two prototype seed migrations (runtime-403 and install-sandbox claims) into machine-extracted index entries. Validates extraction pipeline on real claims with N counting and supersession."
status: completed
priority: P1
branch: "main"
tags: ["machine-extracted-index", "migration", "records", "claims"]
blockedBy:
  - project:260519-1400-schema-scaffolding-machine-extracted-index
  - project:260519-1710-extraction-tool-machine-extracted-index
blocks: []
created: "2026-05-19T15:58:55.621Z"
createdBy: "ck:plan"
source: skill
---

# Migration Execution — Machine-Extracted Index Prototype Seeds

## Overview

Plan 3 of 4 from the machine-extracted index redesign. Executes two prototype seed migrations to validate the full extraction pipeline on real frozen claims:

1. **Seed 1 — `claim-vnstock-runtime-403-root-cause`**: Stress-tests N counting and supersession. The claim bundles five assertions across install and runtime dimensions from two time-points. After migration, the old `device-id-injection-required` assertion must be `superseded` by the new `device-id-injection-not-required` assertion.

2. **Seed 2 — `claim-vnstock-install-sandbox`**: Stress-tests multi-dimensional assertion separation. The claim touches install, runtime, and product dimensions with medium confidence and many limitations.

Each seed requires: (a) writing `## Findings` sections into existing evidence files (plus frontmatter backfill where missing), (b) creating new per-dimension evidence files for assertions that don't fit their source file's declared dimension, (c) running `pnpm extract:index`, (d) verifying the parity check table from the brainstorm.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Seed 1 Runtime 403 Migration](./phase-01-seed-1-runtime-403-migration.md) | Complete |
| 2 | [Seed 2 Install Sandbox Migration](./phase-02-seed-2-install-sandbox-migration.md) | Complete |
| 3 | [Validation Parity Check](./phase-03-validation-parity-check.md) | Complete |
| 4 | [Commit Review](./phase-04-commit-review.md) | Complete |

## Dependencies

- **Blocked by** Plan 1 (`260519-1400-schema-scaffolding-machine-extracted-index`): needs `schemas/index-entry.schema.json`, `records/index/` directory, and validator plumbing.
- **Blocked by** Plan 2 (`260519-1710-extraction-tool-machine-extracted-index`): needs `tools/extract-index/` and `pnpm extract:index` script.
- **Blocks** Plan 4 (Deprecation + Docs Canonicalization): docs update depends on prototype seeds passing parity check.
- **Source design**: `plans/reports/brainstorm-20260518-machine-extracted-index.md` — contains the worked example, parity table, and three open gotchas resolved by the extraction tool.

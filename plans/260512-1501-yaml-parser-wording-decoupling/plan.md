---
title: "YAML Parser Wording Decoupling"
description: ""
status: complete
priority: P2
branch: "main"
tags: []
blockedBy: []
blocks: []
created: "2026-05-12T08:05:23.513Z"
createdBy: "ck:plan"
source: skill
---

# YAML Parser Wording Decoupling

## Overview

Close the two unresolved questions from `docs/journals/260512-yaml-parser-library-swap.md`. The journal already established the principle (project owns the contract; library wording is incidental) and applied it to `verify-claim`. This plan applies the same principle to the negative-fixture runner and pins the `verify-claim` scalar contract with a committed test.

**Principle:** Wherever a project surface (CLI text, fixture expectations, test assertions) depends on `yaml@2.x` wording, the next library bump rewrites it. Eliminate that coupling.

**Sequencing matters:** Phase 1 lands the wrapper first so Phase 2's test can assert against project-owned errors instead of re-creating the leak inside the test layer.

**Scope is small:** ~2 new files, ~3 modified files, no public API changes. No new runtime dependencies.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Project-owned parse-error wrapper](./phase-01-project-owned-parse-error-wrapper.md) | Complete |
| 2 | [verify-claim scalar regression test](./phase-02-verify-claim-scalar-regression-test.md) | Complete |

## Dependencies

- **Predecessor (completed):** `plans/260512-1410-yaml-parser-library-swap/` — established the `yaml@^2.8.4` dependency and the `verify-claim` parse-exception wrap pattern this plan generalizes.
- **No cross-plan blockers.**

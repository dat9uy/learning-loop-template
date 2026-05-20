---
title: "Plan 5: Mechanical Enforcement Gap Closure (Supersession Write-Back + Frozen-Claim Drift)"
description: ""
status: completed
priority: P2
branch: "main"
tags: []
blockedBy: []
blocks: []
created: "2026-05-19T21:17:53.576Z"
createdBy: "ck:plan"
source: skill
---

# Plan 5: Mechanical Enforcement Gap Closure (Supersession Write-Back + Frozen-Claim Drift)

## Overview

Closes two mechanical-enforcement gaps surfaced during the 2026-05-20 post-implementation review of `brainstorm-20260518-machine-extracted-index.md`. Without these fixes, the index drifts back into a human-edited artifact, undermining the redesign.

- **G1 — Supersession write-back is not implemented.** `tools/extract-index/index-entry-builder.js:45-46` hard-codes `superseded_by: null` and `supersedes: []`. `checkSupersession()` in `extract-index.js:159` emits errors but never patches entries. The active pair carries linked fields only because they were hand-edited, violating item 9 ("agent-derived, never hand-edited") and Mechanism 1.
- **G2 — Mechanism 2 Scope A (frozen-claim drift) is not enforced.** No code in `tools/` references `records/claims/`. Contradictions between new extracted assertions and frozen claims do not hard-stop.

TDD structure: each gap gets a failing-tests phase, then an implementation phase that makes them pass. Final phase regenerates the full corpus and confirms no regression.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Supersession Write-Back Tests](./phase-01-supersession-write-back-tests.md) | Completed |
| 2 | [Supersession Write-Back Implementation](./phase-02-supersession-write-back-implementation.md) | Completed |
| 3 | [Frozen-Claim Drift Tests](./phase-03-frozen-claim-drift-tests.md) | Completed |
| 4 | [Frozen-Claim Drift Implementation](./phase-04-frozen-claim-drift-implementation.md) | Completed |
| 5 | [Corpus Regression + Acceptance](./phase-05-corpus-regression-acceptance.md) | Completed |

## Dependencies

- Blocks: none. Plan 6 (docs canonicalization residue) can run in parallel — it does not touch `tools/`.
- Blocked by: none. Plans 1–4 of the brainstorm are complete.

## Context

- Brainstorm: `plans/reports/brainstorm-20260518-machine-extracted-index.md` (Plan 5 section names the gaps and acceptance criteria).
- Trajectory dependency: an autonomous loop (`docs/trajectory.md`) cannot start from a hand-edited index. Closing G1 + G2 is a precondition for any future bridge work.

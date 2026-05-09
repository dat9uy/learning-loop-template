---
title: "vnstock device-limit investigation + record-layer migration"
description: "Post-mortem record-layer fixes for the vnstock install resume plan (per-run experiment YAMLs, claim updates) plus the device-limit mechanism investigation (operator claim, clearance decision, 2-sandbox falsification). Follows the review report's Recommended Next Steps 2-9."
status: completed
priority: P1
branch: "main"
tags: [vnstock, install, record-layer, device-limit, investigation]
blockedBy: []
blocks: []
created: "2026-05-09T06:53:14.152Z"
createdBy: "ck:plan"
source: skill
---

# vnstock device-limit investigation + record-layer migration

## Overview

Post-mortem record-layer fixes (O4, O5, O6) plus the device-limit mechanism investigation (O2, O13, O14). Scope excludes meta self-improvement items (O7, O8, O10, O15) which land in a separate plan. Per the review report, the predecessor resume plan is already closed out; this plan does not bolt new work onto it.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Record-layer migration](./phase-01-record-layer-migration.md) | Completed |
| 2 | [Investigation setup](./phase-02-investigation-setup.md) | Completed |
| 3 | [2-sandbox falsification](./phase-03-2-sandbox-falsification.md) | Completed |

## Dependencies

```
Phase 1 (Record-layer migration)
  └──→ Phase 2 (Investigation setup)

Phase 2 (Investigation setup)
  └──→ Phase 3 (2-sandbox falsification)
```

Phase 3 has a hard manual gate: operator-confirmed external device clearance on `vnstocks.com/account?section=devices`. Do not start Phase 3 until clearance is confirmed.

## Predecessor

Closed plan: `plans/260508-2030-vnstock-install-resume/` (status: completed). Do not edit. Its evidence files are read-only inputs.

## Source

- Review report: `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (gaps, decisions, resolutions R-Q1 through R-Q6)
- Predecessor plan: `plans/260508-2030-vnstock-install-resume/`
- Run-1 evidence: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`
- Run-2 evidence: `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md`

## Success Criteria

- [x] Per-run experiment YAMLs exist for runs 1 and 2 (O4)
- [x] Existing experiment YAML renamed to timestamped form, scoped to run-1 (O5)
- [x] Claim `evidence_refs` includes run-2 evidence (O6)
- [x] Device-clearance decision YAML authored (O2)
- [x] Operator claim (device-limit mechanism) authored (O13)
- [x] Operator-confirmed external clearance completed
- [x] 2-sandbox falsification executed with evidence captured (O14)
- [x] Branch outcome documented (7a, 7b, or 7c)

## Current Status

- Phase 1 completed 2026-05-09.
- Phase 2 completed after operator confirmed external clearance in-band.
- Phase 3 completed 2026-05-09 after `VNSTOCK_API_KEY` became present in the inherited agent environment.
- Outcome branch: 7b. Sandbox 1 registered and installed under the reported bronze tier with 1/1 Linux devices used; sandbox 2 immediately hit the account+OS-global device limit.
- Latest validation: `pnpm validate:records` passed for record syntax/reference integrity.

## Reviews

- Review report: `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`

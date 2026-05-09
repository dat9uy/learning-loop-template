---
title: "vnstock device-limit investigation + record-layer migration"
description: "Post-mortem record-layer fixes for the vnstock install resume plan (per-run experiment YAMLs, claim updates) plus the device-limit mechanism investigation (operator claim, clearance decision, 2-sandbox falsification). Follows the review report's Recommended Next Steps 2-9."
status: pending
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
| 1 | [Record-layer migration](./phase-01-record-layer-migration.md) | Pending |
| 2 | [Investigation setup](./phase-02-investigation-setup.md) | Pending |
| 3 | [2-sandbox falsification](./phase-03-2-sandbox-falsification.md) | Pending |

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

- [ ] Per-run experiment YAMLs exist for runs 1 and 2 (O4)
- [ ] Existing experiment YAML renamed to timestamped form, scoped to run-1 (O5)
- [ ] Claim `evidence_refs` includes run-2 evidence (O6)
- [ ] Device-clearance decision YAML authored (O2)
- [ ] Operator claim (device-limit mechanism) authored (O13)
- [ ] Operator-confirmed external clearance completed
- [ ] 2-sandbox falsification executed with evidence captured (O14)
- [ ] Branch outcome documented (7a, 7b, or 7c)

## Reviews

- Review report: `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`

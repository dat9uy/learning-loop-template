---
title: "vnstock Installer Bootstrap"
description: "Replace the non-resolvable vnstock_data vendor extra with a reproducible two-stage bootstrap for product/api before product code is written."
status: in-progress
priority: P1
branch: "main"
tags: [vnstock, installer, bootstrap, api, reproducibility]
blockedBy: []
blocks: []
created: "2026-05-10T10:44:19.467Z"
createdBy: "ck:plan"
source: skill
---

# vnstock Installer Bootstrap

## Overview

Plan the implementation for `plans/reports/brainstorm-260510-1706-vnstock-installer-bootstrap.md`. The current `product/api/pyproject.toml` advertises `vnstock_data==3.1.7` as a uv-resolvable `vendor` extra, but the observed artifact is a vendor Makeself installer, not a public wheel.

Progress: phases 1-3 complete, phase 4 static validation complete, runtime bootstrap proof and decision approval still pending operator approval plus `VNSTOCK_API_KEY`.

The target is a two-stage operator bootstrap: public dependencies via `uv sync`, then a SHA-pinned `product/api/scripts/install-vnstock.sh` run through `pnpm bootstrap:api`. No FastAPI, TanStack, route, database, or product app code belongs in this plan.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Record Preflight](./phase-01-record-preflight.md) | Completed |
| 2 | [Bootstrap Script And Manifest Wiring](./phase-02-bootstrap-script-and-manifest-wiring.md) | Completed |
| 3 | [Docs Harmonize](./phase-03-docs-harmonize.md) | Completed |
| 4 | [Validation And Approval Evidence](./phase-04-validation-and-approval-evidence.md) | In Progress |

## Dependencies

- Input report: `plans/reports/brainstorm-260510-1706-vnstock-installer-bootstrap.md`.
- Predecessor context: `plans/260510-1600-capabilities-stack-migration/` is completed but exposed the registry miss.
- Historical blocked context: `plans/260508-1545-vnstock-install-knowledge-encoding/` remains blocked/closed as evidence of the earlier broken path; do not reopen it.
- Human gate: executing stage 2 requires explicit operator approval because it downloads a vendor installer, requires `VNSTOCK_API_KEY`, and may consume a device slot.

## Key Constraints

- Do not edit frozen records: `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`.
- Do not create product application code. Capability scripts may stay as probes only.
- Do not run the vendor installer from package manager postinstall hooks or other implicit commands.
- Do not capture credentials, local config contents, private package files, installer logs, raw provider data, or vendor account device-list contents.
- Keep shell script under 200 lines; shell scripts are exempt from modularization pressure.

## Success Criteria

- `product/api/pyproject.toml` has public dependencies only; no `[project.optional-dependencies] vendor` promise remains.
- `product/api/scripts/install-vnstock.sh` is idempotent, SHA-pinned, fail-closed on hash mismatch, and uses `HOME="$(realpath product/api)"`.
- Root `package.json` exposes `bootstrap:api` for `cd product/api && uv sync && bash scripts/install-vnstock.sh`.
- Living docs reference `pnpm bootstrap:api` and no living doc recommends `uv sync --extra vendor`.
- Fresh clean-venv validation is recorded after operator-approved execution.
- `pnpm validate:records` and `pnpm check` pass.

## Cook Handoff

Run after plan approval:

```bash
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260510-1744-vnstock-installer-bootstrap/plan.md
```

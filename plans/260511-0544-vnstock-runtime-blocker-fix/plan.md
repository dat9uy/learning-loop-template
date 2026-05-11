---
title: "vnstock Runtime Blocker Fix — Env-var + Device-Id Monkey-patch"
description: "Apply the wrapper config-path fix and the Device-Id compat patch identified by the 2026-05-11 source-read. Unblocks FastAPI Reference Build runtime close-out."
status: completed
priority: P1
branch: "main"
tags: [vnstock, runtime-fix, monkey-patch, blocker-resolution]
blockedBy: []
blocks: [260511-0030-fastapi-reference-build]
created: "2026-05-11T05:44:00+07:00"
createdBy: "ck:plan"
source: skill
---

# vnstock Runtime Blocker Fix — Env-var + Device-Id Monkey-patch

## Overview

Two independent root causes block `import vnstock_data` and live VCI calls (source-read 2026-05-11):

1. **Wrapper bug A** — `install-vnstock.sh:75` sets `VNSTOCK_CONFIG_PATH=${API_HOME}/.vnstock/user.json`; installer treats it as the dir to write into, so `.vnstock/user.json/` becomes a directory while runtime expects a file. Fix: drop the `/user.json` suffix.
2. **Vendor bug C'** — `vnstock_data.core.utils.user_agent.get_headers` does not inject `Device-Id` for VCI; `vnstock.core.utils.user_agent.get_headers` does. Forked header builders; VietCap now enforces. Fix: monkey-patch `vnstock_data`'s function with `vnstock`'s at app/script startup, gated by feature-detection so vendor updates self-heal.

Plan applies both fixes, adds a regression-detector smoke test, and promotes the existing claim record on successful runtime experiment.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Apply wrapper env-var fix](./phase-01-apply-wrapper-env-var-fix.md) | Completed |
| 2 | [Implement vendor compat patch](./phase-02-implement-vendor-compat-patch.md) | Completed |
| 3 | [Add VCI smoke test](./phase-03-add-vci-smoke-test.md) | Completed |
| 4 | [Runtime experiment and claim promotion](./phase-04-runtime-experiment-and-claim-promotion.md) | Completed |

## Dependencies

- `records/claims/claim-vnstock-runtime-403-root-cause.yaml` — source-of-truth claim; promotes draft → reviewed at phase 4.
- `docs/vendor-vnstock-installer.md` — env-var contract + Device-Id behavior reference.
- `plans/reports/pm-260511-0341-vnstock-source-read-findings.md` — source-read findings driving both fixes.
- `plans/260510-1744-vnstock-installer-bootstrap/` (completed) — original installer wrapper plan.

## Blocks

- `plans/260511-0030-fastapi-reference-build/` phase 3 (Post-Build Records API) + phase 5 (Post-Build Records Web). Both blocked on live `vnstock_data.Reference().equity.list()` returning JSON. This plan's phase 4 unblocks them.

## Key Constraints

- Do not run `install-vnstock.sh` more times than necessary (slot accounting observed non-strict, but treat as 1 slot/run).
- Patch must land BEFORE any `vnstock_data.explorer.*` import; verify via runtime header dump, not just static patching.
- Feature-detection required — version-pin alone is brittle. If vendor ships Device-Id, our patch must self-disable.
- Do not edit venv source (reinstall friction). Patch lives in `product/api/src/vendor_compat/`.

## Success Criteria

- `install-vnstock.sh` exits 0 with no normalize-log line; `import vnstock_data` succeeds without `IsADirectoryError`.
- `Reference().equity.list()` returns DataFrame (not 403 HTML).
- Smoke test `tests/test_vci_smoke.py` passes against live VietCap API.
- Claim `claim-vnstock-runtime-403-root-cause` has `verification.install` and `verification.runtime` flipped to `verified`; `approval.status` → `reviewed`.
- `pnpm validate:records` passes.
- `260511-0030-fastapi-reference-build` plan phase 3/5 marked ready to resume.

## Red Team Review

### Session — 2026-05-11
**Findings:** 15 (15 accepted, 0 rejected)  
**Severity breakdown:** 4 Critical, 5 High, 6 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Claim promotion requires matching experiment record | Critical | Accept | Phase 4 |
| 2 | Runtime output field must flip metadata-only → runtime-captured | Critical | Accept | Phase 4 |
| 3 | Human approval gate missing on experiment | Critical | Accept | Phase 4 |
| 4 | Import-order race in main.py — patch too late | Critical | Accept | Phase 2 |
| 5 | Belt-and-braces misses 4 of 7 VCI modules | Critical | Accept | Phase 2 |
| 6 | Capability scripts unwired — no sys.path to reach vendor_compat | Critical | Accept | Phase 2 |
| 7 | api_key.json exposed in evidence artifacts | Critical | Accept | Phase 4 |
| 8 | Monkey-patch delegates to vendor code — supply-chain trust violation | Critical | Accept | Phase 2 |
| 9 | Smoke test hits live API without CI/Device-Id gate | High | Accept | Phase 3 |
| 10 | Smoke test too narrow — only equity.list | High | Accept | Phase 3 |
| 11 | No rollback for signature mismatch | High | Accept | Phase 2 |
| 12 | Claim promotion circular proof reference | High | Accept | Phase 4 |
| 13 | Staging deletion loses audit trail | Medium | Accept | Phase 4 |
| 14 | Pytest marker unregistered in pyproject.toml | Medium | Accept | Phase 3 |
| 15 | Downstream unblock premature — product dimension stays claimed | Medium | Accept | Phase 4 |

**Key changes applied:**
- Phase 2: inlined Device-Id logic (no `vnstock` module dependency); expanded belt-and-braces to all 7 VCI modules + dynamic iteration; added self-check for pre-loaded VCI modules; added `TypeError` guard; explicit `sys.path` bootstrap for capability scripts; compat import moved to absolute first line in `main.py`.
- Phase 3: added `VNSTOCK_SMOKE_TEST_ALLOW_LIVE` env-var gate; expanded tests to cover `company.info`; registered pytest marker in `pyproject.toml`.
- Phase 4: added experiment record creation with human approval; `runtime.output` flip; evidence sanitization; raw output as primary proof; archive grep manifest before staging cleanup; end-to-end FastAPI gate before downstream unblock; incremental `pnpm validate:records`.
- Phase 1: added migration step for orphaned `api_key.json` / `device.id` from backup dirs.

## Cook Handoff

```bash
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260511-0544-vnstock-runtime-blocker-fix/plan.md
```

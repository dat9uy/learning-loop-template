---
phase: 4
title: "Validation And Approval Evidence"
status: in-progress
priority: P1
effort: "1.5h plus operator gate"
dependencies: [2, 3]
---

# Phase 4: Validation And Approval Evidence

## Context Links

- `docs/operator-guide.md` Runtime Validation Request Protocol
- `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml`
- `records/evidence/loop/vnstock-installer-bootstrap.md`
- `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md`

## Overview

Static validation is complete. The clean bootstrap, runtime evidence capture, and decision approval remain gated on explicit operator approval plus `VNSTOCK_API_KEY`. Capture durable evidence without credentials, private artifacts, raw data, local config contents, or install logs.

## Requirements

- Functional: prove normal validation passes.
- Functional: with approval, delete/recreate only `product/api/.venv` path needed for clean proof.
- Functional: record the fresh bootstrap outcome and approve the draft decision only when proof succeeds.
- Non-functional: no secret capture, no raw vendor output capture, no implicit device-clearance work.

## Architecture

Phase 4 has two gates:

```text
static gate:
  pnpm validate:records
  pnpm check
  bash -n script

human runtime gate:
  operator approves exact bootstrap command class
  operator provides VNSTOCK_API_KEY in shell
  pnpm bootstrap:api
  metadata-only evidence envelope
  decision status draft -> approved if proof supports
```

## Related Code Files

- Modify: `records/evidence/loop/vnstock-installer-bootstrap-runtime.md` or similarly named evidence file.
- Modify: `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml`
- Modify: `plans/260510-1744-vnstock-installer-bootstrap/plan.md` only for phase status updates through `ck plan check` when executing.
- Read: `product/api/scripts/install-vnstock.sh`

## Implementation Steps

1. Run non-network validation: `bash -n product/api/scripts/install-vnstock.sh`, `pnpm validate:records`, and `pnpm check`.
2. Ask operator approval before any clean-venv bootstrap run. Request scope: install/runtime sandbox, metadata-only output, explicit `VNSTOCK_API_KEY` env, no credential/config/log capture.
3. If approved, run the exact command class: clean `product/api/.venv` only if approved, then `pnpm bootstrap:api`.
4. Capture only metadata: command class, installer SHA expected/observed match, package import result, package metadata version if safe, cleanup/temp status, blocked outputs.
5. Write a new evidence MD under `records/evidence/loop/` for the runtime proof.
6. If proof supports the decision, update `decision-20260510T170623Z-vnstock-installer-bootstrap.yaml` from `draft` to `approved` with updated timestamp and proof reference.
7. Re-run `pnpm validate:records` and `pnpm check`.

## Success Criteria

- [x] Static validation passes before runtime gate.
- [ ] Runtime proof is skipped unless explicit operator approval is granted.
- [ ] Evidence captures metadata only and excludes secrets, config contents, installer logs, private package files, and raw provider data.
- [ ] Draft decision is approved only after successful clean bootstrap proof.
- [ ] Final `pnpm validate:records` and `pnpm check` pass.

## Risk Assessment

Risk: clean bootstrap consumes a device slot or fails due to vendor-side slot state.
Mitigation: approval request must name device-slot risk and defer device clearance to the operator UI path already covered by `decision-20260509T070411Z-vnstock-vendor-device-limit-clearance`.

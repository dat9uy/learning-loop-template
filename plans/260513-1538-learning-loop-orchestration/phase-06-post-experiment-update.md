---
phase: 6
title: "Post-Experiment Claim Update and Validation"
status: completed
priority: P1
effort: "1h"
dependencies: [5]
---

# Phase 5: Post-Experiment Claim Update and Validation

## Overview

Apply the Post-Experiment Claim Update blueprint to update `claim-vnstock-install-sandbox` based on the experiment results. Use `pnpm verify:claim` for the mechanical update, then validate all records.

## Requirements

- Functional: Update claim verification block. Update bootstrap script if venv hypothesis confirmed.
- Non-functional: All changes must pass `pnpm validate:records && pnpm check`.

## Related Code Files

- Modify: `records/claims/claim-vnstock-install-sandbox.yaml`
- Modify: `records/experiments/experiment-vnstock-install-vendor-one-liner-20260513T213042Z.yaml`
- Modify (conditional): `product/api/scripts/install-vnstock.sh`

## Implementation Steps

1. **Claim-Evidence Alignment Review**:
   - Read `claim-vnstock-install-sandbox` verification block.
   - Read experiment record `verification.proves`.
   - Confirm dimension (`install`), scope (`sandbox`), and output_level (`metadata-only`) match.
   - Confirm evidence envelope supports the hypothesis.
2. **Determine promotion** using promotion rules:
   - If `result: supports` → `install` dimension status: `verified`
   - If `result: does-not-support` → `install` dimension status: `rejected` (or stay `claimed` if inconclusive)
   - If `result: inconclusive` → stay `claimed`, add limitation
3. **Update claim** via `pnpm verify:claim`:
   ```bash
   pnpm verify:claim -- \
     --claim claim-vnstock-install-sandbox \
     --dimension install \
     --status verified \
     --reason "Vendor one-liner confirmed in sandbox; pre-created venv behavior determined." \
     --proof-ref experiment-vnstock-install-vendor-one-liner-20260513T213042Z \
     --apply
   ```
   - Adjust `--status` and `--reason` based on actual result.
   - If claim limitations need removal, edit the YAML directly after verify:claim.
4. **Update experiment record**:
   - Ensure `status` is `reviewed` or `approved`.
   - Ensure `verification.approval_status` is `approved`.
5. **Conditional bootstrap script update**:
   - If pre-created `/opt/venv` is respected by installer: update `install-vnstock.sh` to pre-create venv before running installer.
   - If one-liner syntax is confirmed superior: consider adopting `--quiet --accept -- --api-key` pattern.
   - If neither hypothesis confirmed: do not modify bootstrap script.
6. **Validation**:
   - Run `pnpm validate:records`.
   - Run `pnpm check`.
   - Fix any errors before marking phase complete.

## Success Criteria

- [ ] Claim updated with correct verification status and proof refs.
- [ ] Experiment record status promoted to `reviewed` or `approved`.
- [ ] `pnpm validate:records` passes.
- [ ] `pnpm check` passes.
- [ ] Bootstrap script updated only if experiment supports the change.

## Risk Assessment

- **Risk:** `verify:claim` fails due to cross-record semantic mismatch.
  - Mitigation: Run dry-run first (without `--apply`), inspect output, then apply.
- **Risk:** Claim YAML edited manually in a way that breaks schema.
  - Mitigation: Run `pnpm validate:records` after every edit.

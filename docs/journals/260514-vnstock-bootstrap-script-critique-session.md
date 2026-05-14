# 260514 — Vnstock Bootstrap Script Critique Session

## Context

Meta-feedback from operator: `product/api/scripts/install-vnstock.sh` was treated as an authority rather than a trial-and-error hypothesis. The script was written before sandbox ground truth existed (pre-May-13). It should follow experiment results, not vice versa. This session inverted that assumption and used the sandbox to critique the script.

**Critical revelation from operator**: The earlier backup/delete/restore operations on the product venv (renaming `vnstock_data` to force installer re-run) **consumed a device slot without being tracked**. This explains the unexplained device-limit hits during subsequent sandbox runs. The script was trusted while in a bad state, and the side effects were not visible until later.

## Changes

### Experiment Executed
- **Sandbox critique experiment** — ran the actual `install-vnstock.sh` in a clean Docker sandbox mimicking a fresh clone (`requests` + `pandas` in venv, system Python has `requests`).
- **Result**: Installer downloaded, SHA-256 verified, 31 dependencies installed into venv successfully, API key authenticated, then **failed at device registration** (device limit exceeded).

### Bootstrap Script Updated
- **Updated** `product/api/scripts/install-vnstock.sh` — SHA-256 pin updated from stale `1982f7f9...` to current `fad4bb7b...`.

### Meta-Journal Written
- **Created** `docs/journals/260514-vnstock-experiment-meta-reflection.md` — comprehensive six-day arc from mystery to ground truth.

## Key Findings

### Script Deficiencies (Validated by Sandbox)

| Deficiency | Evidence | Severity |
|------------|----------|----------|
| **Non-atomic install** | 31 packages installed before device-limit failure; venv left partially modified | High |
| **No stale-device detection** | Idempotency check (`import vnstock_data`) passes even if device ID is invalidated | High |
| **No system Python check** | Script checks `pandas` in venv, but installer wrapper uses system Python and needs `requests` | Medium |
| **SHA-256 pin is brittle** | Vendor rotated installer without notice; script fails closed but has no drift detection | Medium |
| **No force/re-register mode** | No way to re-register when device becomes invalid; requires manual package deletion | Medium |
| **No actionable error messages** | Passes through raw Vietnamese vendor errors; operator gets no guidance on slot management | Medium |

### What the Script Does Correctly

- `HOME` override works — installer uses `$HOME/.venv` (confirmed in sandbox)
- Idempotency works — skips when `vnstock_data` is importable (confirmed)
- SHA-256 verification prevents executing a tampered installer (confirmed)

### The Hidden Device Slot Consumption

Earlier in this session, the product venv was manipulated (renaming `vnstock_data` to `_old`, running bootstrap, restoring from `_old`) in an attempt to force re-registration. This sequence **consumed a device slot silently** because:
1. The bootstrap script ran the vendor installer
2. The installer reached device registration
3. A new device ID was generated and registered
4. The installer then timed out, but the device registration persisted on the vendor server
5. The product was restored from `_old`, masking that a new device had been registered

This consumed one of the 2 Golden-tier slots, leaving no room for the sandbox critique experiment.

## Impact

- The bootstrap script is **not production-ready** as-is. It is a hypothesis that has been partially validated but has critical gaps in atomicity, error handling, and stale-state detection.
- Device slot accounting is **manual and opaque**. The vendor provides no API to query slot usage, and the script does not track or report device registrations.
- The `vendor_compat` runtime patch remains validated and necessary, but the install path that delivers it is fragile.

## Remaining Work

1. **Rewrite `install-vnstock.sh`** as a defensive wrapper with:
   - Pre-flight system Python `requests` check
   - Post-flight API ping (not just import check)
   - Atomicity guard (mark venv before install, rollback on failure)
   - Stale-device detection and `--force` re-register option
   - Actionable error messages for device-limit failures

2. **Device slot audit** — Operator must check the vnstocks web UI and clear any unexpected devices created during this session.

3. **Re-run sandbox critique** — After clearing slots, run the improved script in a clean sandbox to validate the fixes.

## Operator Actions Needed

1. Clear any unexpected device registrations at https://vnstocks.com/account?section=devices
2. Verify how many slots are actually consumed
3. Confirm whether the product's current device ID (`45fcf9df9c0110ee27f1367f0165a8fb`) is still valid or was invalidated

## Verification

- `pnpm check` passes
- `pnpm validate:records` passes
- No API key material retained in repo

## Source

- Meta-reflection: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Sandbox critique output: background task `bash-ekhi10np`
- Prior journals: `docs/journals/260513-vnstock-bootstrap-substrate-experiment.md`

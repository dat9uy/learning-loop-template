# 260514 — Vnstock Bootstrap Script Critique Session

## Context

Meta-feedback from operator: `product/api/scripts/install-vnstock.sh` was treated as an authority rather than a trial-and-error hypothesis. The script was written before sandbox ground truth existed (pre-May-13). It should follow experiment results, not vice versa. This session inverted that assumption and used the sandbox to critique the script.

**Critical revelation from operator**: The earlier backup/delete/restore operations on the product venv (renaming `vnstock_data` to force installer re-run) **consumed a device slot without being tracked**. This explains the unexplained device-limit hits during subsequent sandbox runs. The script was trusted while in a bad state, and the side effects were not visible until later.

**CRITICAL UPDATE (2026-05-15)**: The vendor installer's device-limit message claims "Gói Golden... 2 thiết bị" (Golden package, 2 devices per OS). This message is **false**. The actual account tier is **Bronze with a 1-device limit**. See `claim-vnstock-device-limit-ui-inconsistency` for the verified claim. The hidden slot consumption in this session was consuming the **only** available slot, not one of two.

---

## Changes

### Experiment Executed
- **Sandbox critique experiment** — ran the actual `install-vnstock.sh` in a clean Docker sandbox mimicking a fresh clone (`requests` + `pandas` in venv, system Python has `requests`).
- **Result**: Installer downloaded, SHA-256 verified, 31 dependencies installed into venv successfully, API key authenticated, then **failed at sponsor package download** with device limit exceeded. Device registration **succeeded** (device.id created and visible in vendor UI).

### Bootstrap Script Updated
- **Updated** `product/api/scripts/install-vnstock.sh` — SHA-256 pin updated from stale `1982f7f9...` to current `fad4bb7b...`.

### Meta-Journal Written
- **Created** `docs/journals/260514-vnstock-experiment-meta-reflection.md` — comprehensive six-day arc from mystery to ground truth.

### Experiment Re-run (2026-05-15)
- **Re-ran** sandbox critique with cleared device slots (`experiment-vnstock-bootstrap-critique-rerun-20260514T171316Z`)
- **Result**: Same failure pattern. 31 dependencies installed, API auth succeeded, device registered (visible in UI), then sponsor package download blocked by "device limit exceeded".
- **Key finding**: With only **1 device** visible in the web UI, the limit was still exceeded. Actual tier is Bronze (limit 1), not Golden (limit 2).
- **Asymmetric failure semantics**: Device registration succeeds and consumes a slot BEFORE the sponsor package download is attempted. A "failed" install still costs 1 slot.

---

## Key Findings

### Script Deficiencies (Validated by Sandbox)

| Deficiency | Evidence | Severity |
|---|---|---|
| **Non-atomic install** | 31 packages installed before device-limit failure; venv left partially modified | High |
| **No stale-device detection** | Idempotency check (`import vnstock_data`) passes even if device ID is invalidated | High |
| **No system Python check** | Script checks `pandas` in venv, but installer wrapper uses system Python and needs `requests` | Medium |
| **SHA-256 pin is brittle** | Vendor rotated installer without notice; script fails closed but has no drift detection | Medium |
| **No force/re-register mode** | No way to re-register when device becomes invalid; requires manual package deletion | Medium |
| **No actionable error messages** | Passes through raw Vietnamese vendor errors; operator gets no guidance on slot management | Medium |
| **No slot consumption warning** | Script does not warn that every run reaching step 6 consumes a device slot, even on failure | High |

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

This consumed the **only** Bronze-tier slot, leaving no room for the sandbox critique experiment.

> **Update**: We now know the actual limit is 1 (Bronze), not 2 (Golden). The vendor message has always been false. Every hidden registration like this immediately blocks all future installs.

---

## Impact

- The bootstrap script's critical gaps (non-atomic install, stale-device detection, system Python check, slot awareness, and error messages) were identified in this session and **addressed in the 2026-05-15 rewrite**.
- Device slot accounting remains **manual and opaque** — the vendor provides no API to query slot usage, and the web UI shows registered devices with an actual limit of 1 (not 2 as the installer claims). The rewritten script now warns about slot consumption and provides actionable error messages.
- **Every install attempt that reaches device registration consumes a slot**, even if the final exit code is 1. The rewritten script includes a slot-consumption warning and `--yes-i-know` for non-interactive use.
- The `vendor_compat` runtime patch remains validated and necessary. The install path that delivers it is now guarded by atomicity checks and post-flight verification.

---

## Completed Work

1. **Rewrote `install-vnstock.sh`** as a defensive wrapper (2026-05-15) with:
   - Pre-flight system Python `requests` check
   - Post-flight API ping test (not just import check)
   - Atomicity guard (snapshot, sentinel, cleanup trap)
   - `--force`, `--yes-i-know`, and `--check-device` flags
   - Actionable error messages for device-limit failures
   - **Slot consumption warning**: warns that every run reaching step 6 costs 1 slot

2. **Device slot audit** — Operator cleared all unexpected devices. **Actual limit is 1 (Bronze), not 2 (Golden).**

3. **Sandbox critique of rewritten script** remains future work; the original deficiencies are addressed.

---

## Operator Actions Needed

1. Clear any unexpected device registrations at https://vnstocks.com/account?section=devices
2. **Remember: actual limit is 1 device (Bronze tier), not 2 (Golden tier)**
3. Confirm whether the product's current device ID is still valid

---

## Verification

- `pnpm check` passes
- `pnpm validate:records` passes
- No API key material retained in repo

---

## Source

- Meta-reflection: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Sandbox critique output: background task `bash-ekhi10np`
- Re-run experiment: `records/experiments/experiment-vnstock-bootstrap-critique-rerun-20260514T171316Z.yaml`
- Prior journals: `docs/journals/260513-vnstock-bootstrap-substrate-experiment.md`

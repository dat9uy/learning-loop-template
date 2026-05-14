# Vnstock Bootstrap Script Defensive Rewrite

**Date:** 2026-05-15  
**Context:** Continuation from `docs/journals/260514-vnstock-bootstrap-script-critique-session.md`  
**Goal:** Rewrite `product/api/scripts/install-vnstock.sh` as a defensive wrapper that handles the vendor's asymmetric failure semantics, mislabeled tier messaging, and non-atomic install behavior.

**Key constraint:** Actual device limit is **1** (Bronze tier). Vendor installer falsely claims "Golden, 2 devices". Every run reaching step 6 consumes a slot regardless of exit code. See `claim-vnstock-device-limit-ui-inconsistency`.

---

## Phase 1: Rewrite (No Slot Consumed)

*Prerequisite: None. No vendor installer execution in this phase.*

### Step 1.1 — Pre-flight Checks
- [ ] Add `requests` import check from **system Python** (not venv Python)
  - The vendor installer's wrapper uses system Python and needs `requests`
  - Current script only checks `pandas` in venv
- [ ] Verify `VNSTOCK_API_KEY` is present and non-empty
- [ ] Verify `curl`, `sha256sum`, `realpath` are available
- [ ] Verify venv exists and `pandas` is importable (keep existing check)

### Step 1.2 — Slot-Aware Warning
- [ ] Add prominent warning before installer execution:
  ```
  WARNING: This will register a new device with the vendor.
  Actual device limit: 1 (Bronze tier).
  If a device is already registered, this install will FAIL
  and still consume your only device slot.
  ```
- [ ] Add `--yes-i-know` flag or interactive prompt to bypass warning
- [ ] In `--force` mode, warn that re-registration will INVALIDATE the previous device

### Step 1.3 — Atomicity Guard
- [ ] Before running installer, snapshot venv state:
  - Save list of currently installed packages to temp file
  - Save `.vnstock/` directory listing
- [ ] Mark venv with a `.vnstock-install-in-progress` sentinel file
- [ ] On script exit (success or failure), run cleanup trap:
  - Remove sentinel file
  - If installer failed, report which packages were ADDED (diff pre vs post)
  - Do NOT auto-rollback (vendor packages may be partially installed; manual inspection needed)

### Step 1.4 — Stale-Device Detection + `--force`
- [ ] Add `--force` flag that bypasses idempotency check
- [ ] When `--force` is used:
  - Warn that previous device will be invalidated
  - Remove existing `.vnstock/device.id` before running installer
  - Do NOT back up old device.id (keeping it causes confusion about which is active)
- [ ] Add `--check-device` flag that only queries vendor API for device validity
  - This may not be possible if vendor has no query API; document if unavailable

### Step 1.5 — Actionable Error Messages
- [ ] Intercept vendor's Vietnamese error output and wrap with English guidance:
  - `Vượt quá giới hạn thiết bị!` -> "Device limit exceeded (actual limit: 1 Bronze device). Clear devices at https://vnstocks.com/account?section=devices"
  - Timeout errors -> "Vendor installer timed out. This often happens in existing venvs. Try in a fresh clone."
  - SHA-256 mismatch -> "Vendor updated the installer. Check https://vnstocks.com for the latest version."
- [ ] On failure, print a "Next steps" block with actionable commands

### Step 1.6 — Post-flight Verification
- [ ] After installer exits, verify `vnstock_data` is importable (existing check)
- [ ] Add API ping test: call a lightweight endpoint (e.g., `vnstock_data.listing.all_symbols()`) to verify the device is actually authorized
- [ ] If import succeeds but API ping fails, warn about stale device ID

### Step 1.7 — Code Review
- [ ] Self-review for bash safety (`set -euo pipefail`, quote variables, temp file cleanup)
- [ ] Test idempotency path locally (does not consume slots):
  ```bash
  cd product/api && bash scripts/install-vnstock.sh
  # Should print "already imports; skipping" and exit 0
  ```

---

## Phase 2: Validation (Requires 1 Cleared Slot)

*Prerequisite: Operator clears the device at https://vnstocks.com/account?section=devices*  
*Slot budget: 1 validation run. If it fails, operator must clear again before retry.*

### Step 2.1 — Happy Path Sandbox Test
- [ ] Run rewritten script in clean Docker sandbox (same substrate as prior experiments)
- [ ] Verify: script exits 0, `vnstock_data` importable, API ping succeeds
- [ ] Verify: venv is clean (no `.vnstock-install-in-progress` sentinel left behind)
- [ ] Verify: exactly 1 device appears in vendor UI after run
- [ ] Capture evidence to `records/evidence/vnstock-data/experiment-installer-rewrite-validation-*.md`

### Step 2.2 — Error Path Test (If Slot Budget Allows)
- [ ] Test idempotency in sandbox: run script twice, second run should skip
- [ ] Test `--force` path: after successful install, run with `--force`, verify re-registration
  - *Warning: this consumes a 2nd slot if the vendor counts the re-register as new. Skip if slot budget is tight.*
- [ ] Test missing `requests` pre-flight: temporarily hide system requests, verify script fails early with clear message

### Step 2.3 — Artifact Update
- [ ] Create experiment record for validation run
- [ ] Update `claim-vnstock-install-sandbox` with new evidence
- [ ] Update risk record if new vendor behavior is observed
- [ ] Update meta-reflection journal with rewrite results

### Step 2.4 — Operator Sign-off
- [ ] Operator reviews script changes
- [ ] Operator confirms device slot state after validation
- [ ] Decide whether to promote script to production-ready

---

## Slot Accounting Log

| Event | Date | Slot Change | Cumulative |
|---|---|---|---|
| Operator cleared all | 2026-05-14 | -N → 0 | 0/1 |
| Bootstrap critique re-run | 2026-05-15 | +1 | 1/1 (consumed) |
| **Phase 2 validation** | TBD | +1 if successful | TBD |

**Rule:** No installer execution without explicit operator clearance. Treat every run as slot-consuming.

---

## Source

- Driving journal: `docs/journals/260514-vnstock-bootstrap-script-critique-session.md`
- Meta-reflection: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Latest experiment: `records/experiments/experiment-vnstock-bootstrap-critique-rerun-20260514T171316Z.yaml`
- Tier/limit claim: `records/claims/claim-vnstock-device-limit-ui-inconsistency.yaml`

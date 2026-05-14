---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: failed
claim_support: rejects
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-14T17:13:16Z"
substrate: bootstrap-script-direct-docker-container-python-3-11-slim-requests-pandas-only
---

# Install Experiment - vnstock-data - Bootstrap Script Critique Re-run - 20260514T171316Z

## Summary

Re-ran `product/api/scripts/install-vnstock.sh` in a clean Docker sandbox after operator cleared all device slots. **Hypothesis rejected.** The installer still failed at step 6/6 with device limit exceeded, despite:
- Operator confirming 0 devices before the experiment
- Only **1 device** visible in the vendor web UI after the experiment (the one this run created)
- The vendor message claiming a 2-device-per-OS limit

This reveals a critical discrepancy: the vendor's device limit enforcement does not align with the visible device count in the web UI.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp` (no external temp root created)
- pre-created venv: `/workspace/.venv` with **only** `requests` and `pandas`
- environment:
  - `HOME=/workspace` (set by bootstrap script via `API_HOME`)
  - `PATH=/workspace/.venv/bin:$PATH`
  - `VIRTUAL_ENV=/workspace/.venv`
  - `VNSTOCK_CONFIG_PATH=/workspace/.vnstock`
  - `VNSTOCK_VENV_TYPE=venv`
  - `VNSTOCK_LANGUAGE=python`
- installer SHA-256 observed: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- cleanup status: container removed manually via `docker rm`

## Envelope

- `run_id`: run-20260514-171316-bootstrap-critique-rerun
- `temp_root_class`: os-temp-outside-repo (container-local)
- `approval_gate`: install-import
- `command_class`: temp-docker-bootstrap-script-direct-run
- `allowed_outputs`: metadata, installer-exit-code, dependency-failure-class, venv-path-observation, device-registration-result, device-limit-discrepancy
- `blocked_outputs`: api-credentials, config-contents, raw-install-logs, private-artifacts, temp-dirs, venvs, live-api-calls
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: failed

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in inherited environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container.
3. Installed system dependencies: `wget`, `build-essential`, `curl`, `ca-certificates`, `coreutils`.
4. Created `/workspace` and pre-installed **only** `requests` and `pandas` into `/workspace/.venv`.
5. Verified `vnstock_data` is correctly absent from `/workspace/.venv`.
6. Ran `product/api/scripts/install-vnstock.sh` from `/workspace` directory.
7. Observed installer proceed through steps 2-5 successfully.
8. Observed device-limit failure at step 6/6 (unexpected; operator had cleared all slots).
9. Captured post-flight checks: vnstock_data not importable, but vnai/vnii/vnstock installed.
10. Confirmed `.vnstock/device.id` was created despite device-limit failure.
11. Operator checked web UI and found **only 1 device** registered (this run's device).
12. Removed container manually.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- installer SHA-256: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2` (unchanged)
- pre-installed package verification: passed (`requests`, `pandas` importable; `vnai`, `vnstock`, `vnstock_data` correctly absent)
- bootstrap script startup: reached vendor installer download and verification
- inner installer startup: reached Python entrypoint without `ModuleNotFoundError`
- python version selection: `python3.11` auto-selected
- venv creation behavior: **installer used existing `/workspace/.venv`**
- dependency installation: 31 packages installed via uv into `/workspace/.venv` successfully
- vnai installation: succeeded (`vnai 2.4.8`)
- vnii installation: succeeded (`vnii 0.2.1`)
- vnstock installation: succeeded (`vnstock 4.0.2`)
- API authentication: **succeeded** (API key from environment verified)
- device registration: **reached but failed with device-limit message**
- device.id file: **created** at `/workspace/.vnstock/device.id`
- post-install vnstock_data importable: **NO**
- sponsor packages blocked: yes, by device limit

## Critical Discrepancy

**Operator device slot audit (post-run):**
- Web UI shows **exactly 1 device**: `Linux-7.0.5-2-cachyos-x86_64-with-glibc2.41`
- Registration time: `15/5/2026 00:29:51`
- Activity time: `15/5/2026 00:30:11`
- This matches the experiment container's runtime

**Vendor claim:** "Gói Golden chỉ cho phép 2 thiết bị mỗi hệ điều hành" (Golden package allows 2 devices per OS)

**Actual behavior (operator insight):** With only 1 device registered, the installer claims limit exceeded because the **actual tier is Bronze (limit 1)**, not Golden (limit 2). The vendor mislabels the tier in the installer message.

**Refined understanding — asymmetric failure semantics:**
1. Device **registration succeeded** — the vendor server accepted the new device (visible in UI).
2. What "failed" was only the **sponsor package download** (vnstock_data).
3. From the vendor's perspective, this is a successful registration that hit a package-install block.
4. **Every run that reaches step 6 consumes a slot**, regardless of final exit code.
5. The web UI correctly shows the registered device but does NOT reveal the true limit or warn that a "failed" install consumed a slot.

## Sanitized Installer Status Lines

```text
installer_exit=1
[Bước 2/6] Chọn phiên bản Python: python3.11 selected
[Bước 3/6] Tạo môi trường ảo: Using existing /workspace/.venv
[Bước 4/6] Cài đặt các gói phụ thuộc: 31 packages installed successfully
[Bước 5/6] Xác thực API: API key from environment verified
[Bước 6/6] Chạy chương trình cài đặt VNStock: device limit exceeded
❌ Vượt quá giới hạn thiết bị!
Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành.
Hướng dẫn giải quyết:
  1. Vào trang: https://vnstocks.com/account?section=devices
  2. Xóa các thiết bị không còn sử dụng
  3. Chạy lại installer
```

## Post-Flight State

- Script exit code: **1**
- vnstock_data importable: **no**
- vn-packages present in `/workspace/.venv`:
  - `vnai` (2.4.8)
  - `vnii` (0.2.1)
  - `vnstock` (4.0.2)
  - `vnstock_chart` (1.0.1)
  - `vnstock_ezchart` (0.0.3)
  - `vnstock-installer` (3.1.2)
- Config directory `/workspace/.vnstock` exists with:
  - `api_key.json`
  - `cli_installer.log`
  - `data/usage_metrics.json`
  - `device.id`
  - `user.json`
  - `user_install.json`
  - `vnstock_installer.log`

## Confirmation / Disproof Notes

- **Rejects** hypothesis: device limit was NOT the sole blocker. Even with operator-cleared slots, the installer fails with device limit exceeded.
- **Confirms** the bootstrap script is non-atomic: 31 packages + config files + device.id are left in the venv after failure.
- **Confirms** the script has no stale-device detection: it proceeds to registration even though a new device ID will be created.
- **Reveals** vendor misrepresents tier (claims Golden, actual Bronze) and limit (claims 2, actual 1).
- **Reveals** asymmetric failure semantics: device registration succeeds before package-install block, consuming a slot even on "failure".

## Source

- Operator: local
- Plan: continuation of `docs/journals/260514-vnstock-bootstrap-script-critique-session.md`
- Background task: `bash-mwk3v66i`

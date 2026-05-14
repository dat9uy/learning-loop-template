---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: partially-supports
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-13T17:31:04Z"
substrate: prepared-docker-container-python-3-11-slim-opt-venv
---

# Install Experiment - vnstock-data - Prepared Substrate - 20260513T173104Z

## Summary

Tested the vendor-documented one-liner install command in a prepared Docker substrate matching the vendor Dockerfile pattern. The installer successfully proceeds past dependency checks, creates a venv, installs packages, and reaches device registration when `requests`, `vnai`, `pandas`, and `numpy` are pre-installed. However, the installer **unconditionally creates `/root/.venv`** and completely ignores a pre-created `/opt/venv` even when `PATH=/opt/venv/bin:$PATH` is set.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp` (no external temp root created)
- pre-created venv: `/opt/venv` with `requests>=2.31.0`, `vnai>=2.2.3`, `pandas>=1.5.3`, `numpy>=1.26.4`, `vnstock>=3.3.0`
- environment: `PATH=/opt/venv/bin:$PATH`, `VIRTUAL_ENV=/opt/venv`
- installer SHA-256 observed: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- cleanup status: container removed via `--rm`; temp root deleted with container

## Envelope

- `run_id`: run-20260513-173104-prepared-substrate
- `temp_root_class`: os-temp-outside-repo (container-local)
- `approval_gate`: install-import
- `command_class`: temp-docker-vendor-one-liner-prepared-substrate
- `allowed_outputs`: metadata, installer-exit-code, dependency-failure-class, venv-path-observation
- `blocked_outputs`: api-credentials, config-contents, raw-install-logs, private-artifacts, temp-dirs, venvs, live-api-calls
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in inherited environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container.
3. Installed system dependencies: `wget`, `build-essential`, `curl`, `ca-certificates`.
4. Created `/opt/venv` and pre-installed `requests>=2.31.0`, `vnai>=2.2.3`, `pandas>=1.5.3`, `numpy>=1.26.4`, `vnstock>=3.3.0`.
5. Set `PATH=/opt/venv/bin:$PATH` and `VIRTUAL_ENV=/opt/venv`.
6. Verified pre-installed packages import successfully.
7. Downloaded `vnstock-cli-installer.run` from official vendor URL.
8. Ran the vendor one-liner: `echo "2" | ./installer.run --quiet --accept -- --api-key "$VNSTOCK_API_KEY"`.
9. Observed installer proceed through all 6 steps, create `/root/.venv`, install dependencies, and reach device registration.
10. Observed device-limit failure (expected; do not clear host registration).
11. Confirmed `/opt/venv` does NOT contain `vnstock_data` (sponsor packages blocked by device limit).
12. Confirmed `/root/.venv` does NOT contain `vnstock_data` (same reason).
13. Audited temp files for literal API key material; only `/root/.vnstock/api_key.json` contained the key (expected config path, removed with container).
14. Removed the container via `--rm`.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- installer SHA-256: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2` (unchanged from prior experiment)
- pre-installed package verification: passed (`requests`, `vnai`, `pandas`, `numpy`, `vnstock` all importable)
- Makeself flag passthrough: confirmed working (`-- --api-key` reaches inner installer)
- inner installer startup: reached Python entrypoint without `ModuleNotFoundError`
- python version selection: `python3.11` auto-selected
- venv creation behavior: **installer unconditionally created `/root/.venv`** despite pre-created `/opt/venv` and PATH
- uv installation: installed into `/root/.venv` (standalone)
- dependency installation: 35 packages installed via uv into `/root/.venv`
- vnii installation: succeeded (`vnii>=0.2.1`)
- device registration: reached but failed with device-limit message
- package install summary: core dependencies installed; sponsor packages (`vnstock_data`) blocked by device limit
- pre-created `/opt/venv` behavior: **completely ignored**; no packages added to `/opt/venv` by installer
- `/opt/venv` after install: still only `vnstock 4.0.2`, `vnstock_ezchart 0.0.3` (pre-installed)
- `/root/.venv` after install: contains `vnstock`, `vnstock_ezchart`, `vnai`, `vnii`, `requests`, `pandas`, `numpy`, etc.
- temp-file secret audit: no API key material retained in `/tmp`; container removed

## Sanitized Installer Status Lines

```text
installer_exit=1
[Bước 2/6] Chọn phiên bản Python: python3.11 selected
[Bước 3/6] Tạo môi trường ảo: /root/.venv created
[Bước 4/6] Cài đặt các gói phụ thuộc: 35 packages installed
[Bước 5/6] Xác thực API: API key from environment verified
[Bước 6/6] Chạy chương trình cài đặt VNStock: device limit exceeded
❌ Vượt quá giới hạn thiết bị!
Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành.
```

> **Retrospective note (2026-05-15)**: The "Golden... 2 devices" message is false. Actual limit is 1 (Bronze). See `claim-vnstock-device-limit-ui-inconsistency`.

## Confirmation / Disproof Notes

- **Confirms** hypothesis 1: pre-installing `requests`, `vnai`, `pandas`, `numpy` allows the one-liner to proceed past dependency checks all the way to device registration.
- **Contradicts** hypothesis 2: the installer does NOT respect a pre-created `/opt/venv` or `PATH` setting; it unconditionally creates `/root/.venv`.
- **Confirms** the vendor Dockerfile has a runtime mismatch: it pre-creates `/opt/venv` and sets `PATH`, but the installer ignores this and creates `/root/.venv`.
- The venv-path discrepancy is now **resolved** (not merely unresolved): the installer's venv path is hardcoded to `/root/.venv`.
- `VNSTOCK_VENV_PATH` is not honored (consistent with prior sandbox observations).
- Device-limit gate behavior is consistent with prior observations.

## Source

- Operator: local
- Plan: `plans/260513-1538-learning-loop-orchestration/`
- Phase: 5 follow-up

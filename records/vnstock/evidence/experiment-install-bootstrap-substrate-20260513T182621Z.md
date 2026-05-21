---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: supports
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-13T18:26:21Z"
substrate: bootstrap-equivalent-docker-container-python-3-11-slim-requests-pandas-only
---

# Install Experiment - vnstock-data - Bootstrap-Equivalent Substrate - 20260513T182621Z

## Summary

Tested the vendor installer in a bootstrap-equivalent Docker substrate: only `requests>=2.31.0` and `pandas>=1.5.3` pre-installed in a venv, with `HOME=/tmp/fake-home` override (simulating the bootstrap script's `HOME="${API_HOME}"`). Both critical hypotheses are **confirmed**:

1. The installer proceeds past dependency checks without pre-installed `vnai`, installing `vnai`, `vnii`, and `typing_extensions` itself, then reaches device registration.
2. The installer respects `HOME` and creates `.venv` at `$HOME/.venv` (`/tmp/fake-home/.venv`), not at hardcoded `/root/.venv`.

The bootstrap script `product/api/scripts/install-vnstock.sh` is validated as viable.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp` (no external temp root created)
- pre-created venv: `/opt/test-venv` with **only** `requests>=2.31.0` and `pandas>=1.5.3`
- environment:
  - `HOME=/tmp/fake-home`
  - `PATH=/opt/test-venv/bin:$PATH`
  - `VIRTUAL_ENV=/opt/test-venv`
  - `VNSTOCK_CONFIG_PATH=/tmp/fake-home/.vnstock`
  - `VNSTOCK_VENV_TYPE=venv`
  - `VNSTOCK_LANGUAGE=python`
- installer SHA-256 observed: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- cleanup status: container removed via `--rm`; temp root deleted with container

## Envelope

- `run_id`: run-20260513-182621-bootstrap-substrate
- `temp_root_class`: os-temp-outside-repo (container-local)
- `approval_gate`: install-import
- `command_class`: temp-docker-bootstrap-equivalent-substrate-home-override
- `allowed_outputs`: metadata, installer-exit-code, dependency-failure-class, venv-path-observation
- `blocked_outputs`: api-credentials, config-contents, raw-install-logs, private-artifacts, temp-dirs, venvs, live-api-calls
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in inherited environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container with `--rm`.
3. Installed system dependencies: `wget`, `build-essential`, `curl`, `ca-certificates`.
4. Created `/opt/test-venv` and pre-installed **only** `requests>=2.31.0` and `pandas>=1.5.3`.
5. Verified `vnai`, `vnstock`, and `vnstock_data` are correctly absent from `/opt/test-venv`.
6. Set `HOME=/tmp/fake-home`, `PATH=/opt/test-venv/bin:$PATH`, `VIRTUAL_ENV=/opt/test-venv`, and other bootstrap-equivalent env vars.
7. Downloaded `vnstock-cli-installer.run` from official vendor URL.
8. Ran the vendor one-liner: `echo "2" | ./installer.run --quiet --accept -- --api-key "$VNSTOCK_API_KEY"`.
9. Observed installer proceed through all 6 steps, create `/tmp/fake-home/.venv`, install dependencies, and reach device registration.
10. Observed device-limit failure (expected; do not clear host registration).
11. Confirmed `/tmp/fake-home/.venv` exists and `/root/.venv` does NOT exist.
12. Confirmed `/opt/test-venv` was completely unmodified (no new packages).
13. Audited temp files for literal API key material; only `/tmp/fake-home/.vnstock/api_key.json` contained the key (expected config path, removed with container).
14. Removed the container via `--rm`.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- installer SHA-256: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2` (unchanged from prior experiment)
- pre-installed package verification: passed (`requests`, `pandas` importable; `vnai`, `vnstock`, `vnstock_data` correctly absent)
- Makeself flag passthrough: confirmed working (`-- --api-key` reaches inner installer)
- inner installer startup: reached Python entrypoint without `ModuleNotFoundError`
- python version selection: `python3.11` auto-selected
- venv creation behavior: **installer created `/tmp/fake-home/.venv`** (respecting `HOME` override)
- `/root/.venv` creation: **NOT created**
- `/opt/test-venv` modification: **completely unmodified**; no packages added
- uv installation: installed into `/tmp/fake-home/.venv` (standalone)
- dependency installation: 35 packages installed via uv into `/tmp/fake-home/.venv`
- vnai installation: succeeded (`vnai>=2.4.8`)
- vnii installation: succeeded (`vnii>=0.2.1`)
- typing_extensions installation: succeeded (`typing_extensions>=4.6.0`)
- device registration: reached but failed with device-limit message
- package install summary: core dependencies and system packages installed; sponsor packages (`vnstock_data`) blocked by device limit
- `/tmp/fake-home/.venv` after install: contains `vnstock`, `vnstock_ezchart`, `vnai`, `vnii`, `requests`, `pandas`, `numpy`, `typing_extensions`, etc.
- temp-file secret audit: API key material confined to `/tmp/fake-home/.vnstock/api_key.json` (expected, removed with container)

## Sanitized Installer Status Lines

```text
installer_exit=1
[Bước 2/6] Chọn phiên bản Python: python3.11 selected
[Bước 3/6] Tạo môi trường ảo: /tmp/fake-home/.venv created
[Bước 4/6] Cài đặt các gói phụ thuộc: 35 packages installed
[Bước 5/6] Xác thực API: API key from environment verified
[Bước 6/6] Chạy chương trình cài đặt VNStock: device limit exceeded
❌ Vượt quá giới hạn thiết bị!
Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành.
```

> **Retrospective note (2026-05-15)**: The "Golden... 2 devices" message is false. Actual limit is 1 (Bronze). See `claim-vnstock-device-limit-ui-inconsistency`.

## Confirmation / Disproof Notes

- **Confirms** hypothesis 1: pre-installing only `requests` and `pandas` is sufficient for the installer to proceed. The installer itself installs `vnai`, `vnii`, and `typing_extensions`.
- **Confirms** hypothesis 2: the installer respects `HOME` and creates `.venv` at `$HOME/.venv`. The bootstrap script's `HOME="${API_HOME}"` strategy is validated.
- **Confirms** the substrate venv (`/opt/test-venv`, analog to `product/api/.venv`) is left completely unmodified.
- The bootstrap script's `pandas` import check is a valid minimal proxy for substrate readiness.
- The product `pyproject.toml` includes `requests`, so `uv sync` produces a compatible substrate.
- `VNSTOCK_CONFIG_PATH` is respected; config files written to `/tmp/fake-home/.vnstock`.
- Device-limit gate behavior is consistent with prior observations.

## Findings

- [bootstrap-script-validated] The `product/api/scripts/install-vnstock.sh` bootstrap script is validated: the product `.venv` with `requests` and `pandas` is a sufficient substrate, and the `HOME` override works as intended.
  - Context: Verified in bootstrap-equivalent Docker substrate on 2026-05-13.
- [vnai-no-preinstall-needed] vnai does NOT need to be pre-installed in the substrate; the installer handles vnai, vnii, and typing_extensions installation itself.
  - Context: Confirmed in bootstrap-equivalent substrate with only `requests` and `pandas` pre-installed on 2026-05-13.
- [substrate-venv-unmodified] The substrate venv (analogous to `product/api/.venv`) is left completely unmodified by the installer.
  - Context: Verified that `/opt/test-venv` contained no new packages after installer run on 2026-05-13.

## Source

- Operator: local
- Plan: `plans/260513-1538-learning-loop-orchestration/`
- Phase: 5 follow-up (bootstrap substrate)

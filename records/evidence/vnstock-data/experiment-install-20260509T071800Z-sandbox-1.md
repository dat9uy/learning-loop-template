---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed-with-warning
claim_support: supports
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-09T07:18:00Z"
substrate: fresh-docker-container-python-3-11-slim
---

# Install Experiment - vnstock-data - 20260509T071800Z - Sandbox 1

## Summary

Fresh Docker sandbox 1 registered as a new Linux device and installed `vnstock_data`.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp/learning-loop-vnstock-<random>`
- runner venv: disposable venv with `requests`, `uv`, and `pandas`
- installer-created venv: `$HOME/.venv` inside the container
- installer SHA-256: `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`
- cleanup status: container removed; temp root deleted with container

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in the inherited process environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container.
3. Downloaded `vnstock-cli-installer.run` from the official vendor URL class.
4. Extracted the Makeself archive.
5. Created a disposable runner venv and installed installer prerequisites: `requests`, `uv`, and `pandas`.
6. Ran the extracted vendor installer with temp-local `HOME`, `VNSTOCK_CONFIG_PATH`, `VNSTOCK_VENV_PATH`, `VNSTOCK_VENV_TYPE=venv`, and `VNSTOCK_LANGUAGE=python`.
7. Audited temp files for the literal API key value by substring match.
8. Removed the fresh container.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- archive extraction: exit 0
- first attempted substrate without `uv`: failed before vendor authentication
- second attempted substrate with `uv` but without preinstalled `pandas`: failed before vendor authentication during `vnai`/`vnii` verification
- final fresh substrate with preinstalled `pandas`: installer exit 0
- vendor registration: succeeded
- reported plan tier: `bronze`
- reported device usage after registration: `1/1`
- package install summary: `vnstock_data` success
- installer-created venv path observed: `$HOME/.venv`
- expected `VNSTOCK_VENV_PATH` was not used by installer for the package venv
- temp-file secret audit: API key material was present in temp-local substrate and deleted with the container

## Sanitized Installer Status Lines

```text
installer_exit=0
WARNING: vnstock core not found, installing...
WARNING: vnstock_data import check failed (may work in practice):
WARNING: Error output:
Không tìm thấy thông tin người dùng hợp lệ. Vui lòng liên hệ Vnstock để được hỗ trợ!

✅ Python 3.11 is supported
✅ Virtual environment created successfully

🔧 Checking device identification packages...
✅ Device packages ready
🔍 Mã thiết bị: [REDACTED_TOKEN]
💻 Hệ thống: Linux [REDACTED_KERNEL]

📋 Đang đăng ký thiết bị...
✅ Device registered successfully!
   Tier: bronze
   Devices used: 1/1

📦 Verifying vnstock core installation...
📦 Installing vnstock core...
✅ vnstock core installed

📋 Re-registering device after vnstock installation...
✅ Device registered successfully!
   Tier: bronze
   Devices used: 1/1
✅ Device re-registered successfully

📦 Đang lấy danh sách thư viện...
✅ Tìm thấy 1 thư viện khả dụng
📦 Tự động cài đặt tất cả 1 thư viện...
Installation order: vnstock_data

📦 vnstock_data...
📦 Downloading vnstock_data...
📁 Extracting vnstock_data...
✅ vnstock_data ready

✅ Thành công: 1
   • vnstock_data

📦 Môi trường Python:
   Version: 3.11.15
   Thực thi: /tmp/[REDACTED_TOKEN]/home/.venv/bin/python
```

## Disproof / Confirmation Notes

- Confirms the operator clearance propagated enough for one fresh Linux container to register.
- Confirms this subscription state had one available Linux device slot at sandbox-1 run time.
- Shows current installer substrate prerequisites include `uv` and import-verifiable dependencies for `vnai`/`vnii`; preinstalling `pandas` was required in this Docker substrate.
- Supports branch 7b when paired with sandbox 2: a second fresh Linux container hit an account+OS device limit after sandbox 1 registered.

## Source

- Operator: local
- Plan: `plans/260509-1353-vnstock-device-limit-investigation/`
- Phase: 3

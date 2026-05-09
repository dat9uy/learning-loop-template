---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: failed
claim_support: does-not-support
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-09T07:19:00Z"
substrate: fresh-docker-container-python-3-11-slim
---

# Install Experiment - vnstock-data - 20260509T071900Z - Sandbox 2

## Summary

Fresh Docker sandbox 2 ran immediately after sandbox 1 and hit the vendor device limit before `vnstock_data` could be installed.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp/learning-loop-vnstock-<random>`
- runner venv: disposable venv with `requests`, `uv`, and `pandas`
- installer-created venv: `$HOME/.venv` inside the container
- installer SHA-256: `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`
- cleanup status: container removed; temp root deleted with container

## Steps Executed

1. Started a second fresh `python:3.11-slim` Docker container immediately after sandbox 1 completed.
2. Downloaded `vnstock-cli-installer.run` from the official vendor URL class.
3. Extracted the Makeself archive.
4. Created a disposable runner venv and installed installer prerequisites: `requests`, `uv`, and `pandas`.
5. Ran the extracted vendor installer with temp-local `HOME`, `VNSTOCK_CONFIG_PATH`, `VNSTOCK_VENV_PATH`, `VNSTOCK_VENV_TYPE=venv`, and `VNSTOCK_LANGUAGE=python`.
6. Ran an import smoke test from the actual installer-created `$HOME/.venv`.
7. Audited temp files for the literal API key value by substring match.
8. Removed the fresh container.

## Observations

- no other intentional vnstock activity occurred between sandbox 1 and sandbox 2
- pre-flight env var check: inherited from same agent environment
- curl/download installer: exit 0
- archive extraction: exit 0
- installer exit: 0 despite package failure summary
- vendor registration: failed
- vendor block: device limit exceeded
- reported plan tier: `bronze`
- reported device usage before sandbox-2 registration: `1 registered`
- package install summary: `vnstock_data` failed with `Device not registered`
- import `vnstock_data`: failed
- import failure type: `ModuleNotFoundError`
- temp-file secret audit: API key material was present in temp-local substrate and deleted with the container

## Sanitized Installer Status Lines

```text
installer_exit=0
ERROR: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.
ERROR: Device registration failed: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.
ERROR: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.
ERROR: Re-registration failed: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.
ERROR: Failed to get download URL for vnstock_data: Device not registered

✅ Python 3.11 is supported
✅ Virtual environment created successfully

🔧 Checking device identification packages...
✅ Device packages ready
🔍 Mã thiết bị: [REDACTED_TOKEN]
💻 Hệ thống: Linux [REDACTED_KERNEL]

📋 Đang đăng ký thiết bị...
❌ Đăng ký thất bại: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.

⚠️  Note: Device registration failed, but installation will continue.
   User profile may be saved locally for next time.

📦 Verifying vnstock core installation...
📦 Installing vnstock core...
✅ vnstock core installed

📋 Re-registering device after vnstock installation...
❌ Đăng ký thất bại: Device limit exceeded: Your bronze plan allows 1 device(s) per OS. You have 1 registered.

📦 vnstock_data...
❌ vnstock_data failed: Device not registered

✅ Thành công: 0

❌ Thất bại: 1
   • vnstock_data: Device not registered

import_exit=1
ModuleNotFoundError: No module named 'vnstock_data'
```

## Disproof / Confirmation Notes

- Supports branch 7b: account+OS-global device metering, not per-fingerprint unlimited metering.
- Refines the phase expectation from "global at 2" to the observed current subscription state: Linux global limit was `1/1` for the bronze tier.
- Does not support the install claim for sandbox 2 because the device-limit gate prevented package download.

## Source

- Operator: local
- Plan: `plans/260509-1353-vnstock-device-limit-investigation/`
- Phase: 3

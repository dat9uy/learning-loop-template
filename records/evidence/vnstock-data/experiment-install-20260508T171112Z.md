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
created: "2026-05-08T17:13:03Z"
substrate: ephemeral-temp-dir-plus-runner-venv-plus-installer-venv
---

# Install Experiment - vnstock-data - 20260508T171112Z

## Summary

The env-var API key path worked, but the vendor installer stopped at device-limit enforcement before installing `vnstock_data`.

## Substrate

- temp root class: `os-temp-outside-repo`
- temp root path class: `/tmp/learning-loop-vnstock-<timestamp>-<random>`
- runner venv: disposable Python venv used only to provide `requests` for the extracted installer entrypoint
- installer-created venv path class: temp-root-local `.vnstock-venv`
- installer-created venv Python: `Python 3.14.4`
- installer SHA-256: `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`
- cleanup status: succeeded
- temp root deleted: true

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in the inherited process environment without printing the value.
2. Downloaded `vnstock-cli-installer.run` from the official vendor URL class.
3. Inspected archive-level help; old disproved flags were not exposed.
4. Extracted the Makeself archive and confirmed entrypoint files: `vnstock_cli.py`, `vnstock-installer.py`, and `setup.sh`.
5. Ran the archive wrapper; it failed before installer logic because system Python lacked `requests`.
6. Created a disposable runner venv, installed `requests`, set temp-local `HOME`, `VNSTOCK_CONFIG_PATH`, `VNSTOCK_VENV_PATH`, `VNSTOCK_VENV_TYPE=venv`, and `VNSTOCK_LANGUAGE=python`.
7. Ran the extracted vendor installer with the operator-injected `VNSTOCK_API_KEY`.
8. Ran import smoke test from the installer-created venv.
9. Audited temp files for the literal API key value by substring match.
10. Deleted the temp root.

## Observations

- pre-flight env var check: passed
- curl `vnstock-cli-installer.run`: exit 0
- installer `--help` flag set: old disproved flags `--api-key`, `--non-interactive`, `--venv-path`, and `--language` were not present
- archive extraction: exit 0
- wrapper execution: exit 1 because `requests` was missing from system Python
- extracted installer execution via disposable runner venv: exit 1
- venv created at `VNSTOCK_VENV_PATH`: true
- installer API-key source: environment variable, confirmed by sanitized installer output
- vendor block: device limit exceeded for the subscribed package
- import `vnstock_data`: failed
- import failure type: `ModuleNotFoundError`
- env var presence verified inside venv Python: yes, value never printed
- temp-file secret audit: two temp-local config files contained the API key; both were inside deleted substrate

## Exact Sanitized Run Output

The vendor device-limit finding is backed by the sanitized installer output captured during the experiment:

```text
[Bước 5/6] Xác thực API
✓ Đang sử dụng API key từ biến môi trường

[Bước 6/6] Chạy chương trình cài đặt VNStock

❌ Vượt quá giới hạn thiết bị!
Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành.
Hướng dẫn giải quyết:
  1. Vào trang: https://vnstocks.com/account?section=devices
  2. Xóa các thiết bị không còn sử dụng
  3. Chạy lại installer

Sau khi xóa thiết bị, chạy lại lệnh cài đặt.
```

The URL above came from installer output, not from external documentation or inference.

## Static Dimension Consistency

- Reference snapshot: `local:records/evidence/vnstock-data/unified-ui-snapshot/01-reference-layer.md` at upstream commit `6adcd80`
- Runtime shape: not evaluable
- Divergences: installer did not complete, so `Reference`, `Market`, `Fundamental`, `Macro`, `Analytics`, and `Insights` could not be inspected in `vnstock_data`

## Process-Side Findings

- Env-var inheritance from operator's shell: succeeded.
- The installer writes API-key material to temp-local config files even when the key is injected via environment variable.
- `VNSTOCK_CONFIG_PATH` and temp-local `HOME` kept those files inside disposable substrate.
- Wrapper execution depends on `requests` being importable by the Python selected by `setup.sh`; on this host, a disposable runner venv was required to reach the installer logic.

## Disproof / Confirmation Notes

- Confirms the prior flag disproof: archive-level `--api-key`, `--non-interactive`, `--venv-path`, and `--language` are still not exposed.
- Confirms `VNSTOCK_API_KEY` is read from environment.
- Does not support the install claim because the vendor device-limit gate blocked package installation before `vnstock_data` could be imported.

## Supersedes

- `local:records/evidence/vnstock-data/installer-prior-notes.md` - prior claim that installer reads `~/.vnstock/user.json` was empirically superseded. Installer reads `VNSTOCK_API_KEY` env var; this run additionally showed it may persist the key into temp-local config files during installation. Package import shape remains unverified in this run because the device-limit gate stopped installation.

## Source

- Operator: local
- Plan: `plans/260508-2030-vnstock-install-resume/`
- Phase: 3

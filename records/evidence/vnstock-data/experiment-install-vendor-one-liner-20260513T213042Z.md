---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: passed
claim_support: does-not-support
secret_injection_class: api-key-via-shell-env-var
installer_url_class: vnstocks-official-download
static_dimension_consistency: not-evaluable
created: "2026-05-13T21:30:42Z"
substrate: fresh-docker-container-python-3-11-slim
---

# Install Experiment - vnstock-data - Vendor One-Liner - 20260513T213042Z

## Summary

Tested the vendor-documented one-liner install command in fresh Docker sandboxes. The Makeself wrapper correctly passes `-- --api-key` to the inner installer, but the inner installer fails immediately with `ModuleNotFoundError: No module named 'requests'` because `python:3.11-slim` does not include `requests`. The vendor one-liner documentation does not mention this prerequisite.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp/learning-loop-vnstock-<random>` (not created; installer failed before temp usage)
- runner venv: none (one-liner does not create one)
- installer-created venv: none (installer failed before venv creation)
- installer SHA-256 observed: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- cleanup status: container removed; temp root deleted with container

## Envelope

- `run_id`: run-20260513-154653-7d2a8f1e
- `temp_root_class`: os-temp-outside-repo (container-local)
- `approval_gate`: install-import
- `command_class`: temp-docker-vendor-one-liner
- `allowed_outputs`: metadata, installer-exit-code, installer-sha-mismatch, dependency-failure-class
- `blocked_outputs`: api-credentials, config-contents, raw-install-logs, private-artifacts, temp-dirs, venvs, live-api-calls
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in inherited environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container (Sandbox 1).
3. Downloaded `vnstock-cli-installer.run` from the official vendor URL class.
4. Ran the vendor one-liner: `echo "2" | ./installer.run --quiet --accept -- --api-key "$VNSTOCK_API_KEY"`.
5. Observed exit code 1 and `ModuleNotFoundError: No module named 'requests'`.
6. Audited temp files for literal API key material; no key retention detected (log contained only a Python traceback).
7. Removed the fresh container.
8. Started a second fresh container (Sandbox 2) with pre-created `/opt/venv` and `PATH` set.
9. Ran the same one-liner in Sandbox 2.
10. Observed identical failure (`ModuleNotFoundError: No module named 'requests'`).
11. Confirmed no `/root/.venv` was created.
12. Removed the second container.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- installer SHA-256 mismatch: expected `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`, observed `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- Makeself flag passthrough: confirmed working (`-- --api-key` reaches inner installer)
- inner installer startup: reached Python entrypoint
- dependency failure class: `ModuleNotFoundError: No module named 'requests'`
- vendor registration: not reached
- package install summary: no packages installed
- installer-created venv path: none (failed before venv creation)
- pre-created `/opt/venv` behavior: inconclusive (installer failed before venv stage)
- temp-file secret audit: no API key material retained in container after removal

## Sanitized Installer Status Lines

```text
installer_exit=1
Traceback (most recent call last):
  File "/.build_cli_package/[REDACTED]cli.py", line 32, in <module>
    import requests
ModuleNotFoundError: No module named 'requests'
```

## Disproof / Confirmation Notes

- Confirms the `-- --api-key` Makeself passthrough syntax works (inner installer receives the flag).
- Contradicts the vendor one-liner claim that it works in a fresh environment; `requests` is a hidden prerequisite.
- Vendor Dockerfile sample corroborates that `requests>=2.31.0` must be pre-installed before the installer runs.
- Does not resolve the venv-path discrepancy because the installer fails before venv creation.
- Installer SHA-256 changed since 2026-05-09; vendor does not publish checksums.

## Source

- Operator: local
- Plan: `plans/260513-1538-learning-loop-orchestration/`
- Phase: 5

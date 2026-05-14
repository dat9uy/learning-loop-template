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
created: "2026-05-14T14:08:11Z"
substrate: bootstrap-equivalent-docker-container-python-3-11-slim-requests-pandas-only
---

# Install Experiment - vnstock-data - Full Install with Cleared Slot - 20260514T140811Z

## Summary

Completed a full vendor installer run after the operator cleared all device slots.
The installer exited 0, registered a new device, and successfully installed `vnstock_data`.
Both critical substrate hypotheses from the prior experiment remain confirmed,
and new findings about version drift and device ID stability are documented.

## Substrate

- container image class: `python:3.11-slim`
- temp root class: container-local `/tmp` (no external temp root created)
- system Python packages: `requests`, `pandas` (installer wrapper requires these)
- pre-created venv: `/opt/substrate` with **only** `requests` and `pandas`
- environment:
  - `HOME=/tmp/fake-home`
  - `PATH=/opt/substrate/bin:$PATH`
  - `VIRTUAL_ENV=/opt/substrate`
  - `VNSTOCK_CONFIG_PATH=/tmp/fake-home/.vnstock`
  - `VNSTOCK_VENV_TYPE=venv`
  - `VNSTOCK_LANGUAGE=python`
- installer SHA-256 observed: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- cleanup status: container removed via `--rm`; temp root deleted with container

## Envelope

- `run_id`: run-20260514-140811-full-install
- `temp_root_class`: os-temp-outside-repo (container-local)
- `approval_gate`: install-import
- `command_class`: temp-docker-full-install-cleared-slot
- `allowed_outputs`: metadata, installer-exit-code, dependency-failure-class, venv-path-observation, version-capture
- `blocked_outputs`: api-credentials, config-contents, raw-install-logs, private-artifacts, temp-dirs, venvs
- `cleanup_status`: succeeded
- `temp_root_deleted`: true
- `validation_status`: passed

## Steps Executed

1. Verified `VNSTOCK_API_KEY` was present in inherited environment without printing the value.
2. Started a fresh `python:3.11-slim` Docker container with `--rm`.
3. Installed `requests` and `pandas` into system Python (required by installer wrapper).
4. Created `/opt/substrate` venv and pre-installed **only** `requests` and `pandas`.
5. Verified `vnai`, `vnstock`, and `vnstock_data` are correctly absent from substrate.
6. Set `HOME=/tmp/fake-home`, `PATH=/opt/substrate/bin:$PATH`, `VIRTUAL_ENV=/opt/substrate`.
7. Downloaded `vnstock-cli-installer.run` from official vendor URL.
8. Ran the vendor one-liner: `echo "2" | ./installer.run --quiet --accept -- --api-key "$VNSTOCK_API_KEY"`.
9. Observed installer complete all steps, create `/tmp/fake-home/.venv`, install dependencies,
   register device, and install `vnstock_data` successfully.
10. Confirmed installer exit code 0.
11. Verified `vnstock_data` importable with `__version__='3.0.0'`.
12. Noted dist-info metadata shows `3.1.3` while source `__version__` shows `3.0.0`.
13. Verified `/tmp/fake-home/.venv` exists and `/root/.venv` does NOT exist.
14. Confirmed `/opt/substrate` was completely unmodified.
15. Audited temp files for literal API key material; only `/tmp/fake-home/.vnstock/api_key.json`
    contained the key (expected config path, removed with container).
16. Removed the container via `--rm`.

## Observations

- pre-flight env var check: passed
- curl/download installer: exit 0
- installer SHA-256: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2` (unchanged)
- installer exit code: **0**
- device registration: **success**
  - Tier: bronze
  - Devices used: 1/1
  - Device ID: `69815221e3116a37be42887b36d0c937`
- python version selection: `python3.11` auto-selected
- venv creation behavior: **installer created `/tmp/fake-home/.venv`** (respecting `HOME` override)
- `/root/.venv` creation: **NOT created**
- `/opt/substrate` modification: **completely unmodified**; no packages added
- uv installation: installed into `/tmp/fake-home/.venv` (standalone)
- dependency installation: 35 packages installed via uv into `/tmp/fake-home/.venv`
- vnai installation: succeeded (`vnai>=2.4.8`)
- vnii installation: succeeded (`vnii>=0.2.1`)
- typing_extensions installation: succeeded (`typing_extensions>=4.6.0`)
- sponsor package installation: **vnstock_data installed successfully**
- `vnstock_data.__version__`: **3.0.0**
- `vnstock_data` dist-info version: **3.1.3** (drift observed)
- `vnstock` importable: yes (prints sponsor warning, no `__version__` attribute)
- `vnstock.get_headers`: **NOT FOUND**
- `vnstock_data.get_headers`: **NOT FOUND**
- temp-file secret audit: API key material confined to `/tmp/fake-home/.vnstock/api_key.json` (expected, removed with container)

## Device ID Stability Test

A second container run on the same host was attempted to inspect the venv more deeply.
This second run generated a **different device ID** and hit the device-limit gate:

```text
❌ Vượt quá giới hạn thiết bị!
Gói Golden của bạn chỉ cho phép 2 thiết bị mỗi hệ điều hành.
```

> **Retrospective note (2026-05-15)**: The "Golden... 2 devices" message is false. Actual limit is 1 (Bronze). The second container hit the 1-device ceiling. See `claim-vnstock-device-limit-ui-inconsistency`.

**Conclusion**: Device IDs are **not deterministic** across container instances.
Each fresh container consumes a distinct device slot.

## Confirmation / Disproof Notes

- **Confirms** the vendor installer completes successfully when a device slot is available.
- **Confirms** `vnstock_data` version is 3.0.0 (source) with 3.1.3 dist-info metadata.
- **Confirms** the substrate venv is left completely unmodified.
- **Confirms** the bootstrap script's `HOME` override strategy works.
- **Confirms** `vnai` does NOT need to be pre-installed; the installer handles it.
- **Confirms** the runtime patch (`vendor_compat`) is necessary:
  the clean vendor install does NOT provide `get_headers` or `Device-Id` injection.
- **New finding**: Device IDs are not stable across containers; each instance consumes a slot.
- **New finding**: Version drift exists between `vnstock_data` source `__version__` and dist-info.

## Source

- Operator: local
- Plan: `docs/journals/260513-vnstock-bootstrap-substrate-experiment.md`
- Phase: A (full install with cleared slot)

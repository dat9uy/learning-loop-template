---
phase: 5
title: "Execute Vnstock One-Liner Experiment"
status: completed
priority: P1
effort: "2h"
dependencies: [4]
---

# Phase 4: Execute Vnstock One-Liner Experiment

## Overview

Execute the draft experiment `experiment-vnstock-install-vendor-one-liner-20260513T213042Z` using the full-lifecycle orchestration pattern. Test the vendor-documented one-liner install command and the pre-created `/opt/venv` behavior in fresh Docker sandboxes.

## Requirements

- Functional: Run the vendor one-liner in a fresh container. Run a second test with pre-created `/opt/venv`. Capture metadata.
- Non-functional: Metadata-only output. No credential retention. Cleanup confirmed.

## Architecture

```
Sandbox 1: One-liner test
  - Fresh python:3.11-slim container
  - wget + chmod +x + echo "2" | ./installer.run --quiet --accept -- --api-key $VNSTOCK_API_KEY
  - Capture: exit code, registration status, vnstock_data import result

Sandbox 2: Pre-created venv test
  - Fresh python:3.11-slim container
  - Pre-create /opt/venv, set PATH
  - Run same one-liner
  - Capture: venv path used by installer
```

## Related Code Files

- Read: `records/experiments/experiment-vnstock-install-vendor-one-liner-20260513T213042Z.yaml`
- Read: `records/claims/claim-vnstock-install-sandbox.yaml`
- Read: `records/evidence/vnstock-data/vendor-installation-troubleshooting-guide.md`
- Read: `product/api/scripts/install-vnstock.sh`
- Create/Update: `records/evidence/vnstock-data/experiment-install-vendor-one-liner-20260513T213042Z.md`

## Implementation Steps

1. **Pre-flight**:
   - Verify `VNSTOCK_API_KEY` is present in environment without printing.
   - Check operator device clearance status (1 Linux device slot must be available).
   - Read draft experiment record for exact hypothesis and success metrics.
2. **Sandbox 1 — One-liner**:
   - Start fresh `python:3.11-slim` Docker container.
   - Run vendor one-liner exactly as documented in troubleshooting guide.
   - Capture exit code, registration status, tier, device usage, vnstock_data import result.
   - Audit temp files for API key material.
   - Remove container. Confirm deletion.
3. **Sandbox 2 — Pre-created venv**:
   - Start second fresh container.
   - Create `/opt/venv`, activate it, set `PATH`.
   - Run same one-liner.
   - Inspect whether `vnstock_data` is in `/opt/venv` or `$HOME/.venv`.
   - Audit temp files. Remove container. Confirm deletion.
4. **Evidence capture**:
   - Write evidence MD with envelope fields (`run_id`, `temp_root_class`, `approval_gate`, `command_class`, `allowed_outputs`, `blocked_outputs`, `cleanup_status`, `temp_root_deleted`, `validation_status`).
   - Sanitize all output (no API keys, no literal device IDs, no temp paths).
5. **Experiment record update**:
   - Update `records/experiments/experiment-vnstock-install-vendor-one-liner-20260513T213042Z.yaml` with `result`, `result_reason`, `agent_outcome`, `observations`.

## Success Criteria

- [ ] Sandbox 1 executed and outcome captured.
- [ ] Sandbox 2 executed and venv path determined.
- [ ] Evidence MD written with required envelope fields.
- [ ] Experiment YAML updated with result.
- [ ] Cleanup confirmed for both containers.
- [ ] No credentials or raw data retained.

## Risk Assessment

- **Risk:** Device limit still enforced (1 Linux device on bronze). Sandbox 2 may fail to register.
  - Mitigation: Sandbox 2 is testing venv path, not registration. If registration fails, note it and test venv behavior with a mock or by reusing sandbox 1 after clearing.
- **Risk:** One-liner syntax differs from documented and fails.
  - Mitigation: Document exact failure mode in evidence. Retain current limitations in claim.
- **Risk:** Cleanup failure.
  - Mitigation: Fail-closed. Block dimension verification if cleanup not confirmed.

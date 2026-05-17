---
phase: 3
title: "Validation Run"
status: pending
priority: P1
effort: "1h"
dependencies: [1, 2]
---

# Phase 3: Validation Run

## Overview

Single-slot Docker validation of the install script. Fresh container, no reused state. ANY check failure = STOP. This is the budget-consuming phase.

**Critical rules (from resource-budget-rules.md):**
- Rule 3: ANY check failure on budget-consuming action = STOP (not fix-and-retry)
- Rule 8: PASS = ALL checks pass. FAIL = ANY check fails. No partial credit.
- Rule 9: Fresh environment per validation attempt. No reused containers.
- Rule 10: After budget-consuming action, report and wait for operator.

**Important distinction:** Bootstrap failures (apt-get, pip, uv) are infrastructure, not validation. Agent may retry bootstrap. Only the install script execution is budget-consuming and triggers Rule 3.

## Requirements

- Functional: install script exits 0, vnstock_data importable, API ping succeeds
- Functional: exactly 1 device appears in vendor UI after run
- Non-functional: fresh Docker container (not reused), no host-side imports during window, no host filesystem mutation

## Architecture

Docker execution model (Finding #1): Agent has no PTY. Use single `bash -c` batch command, not interactive shell.

Volume isolation (Finding #6): Use named Docker volume for `.venv` to prevent `uv sync` from mutating host filesystem through bind mount.

```
docker run --rm \
  -e VNSTOCK_API_KEY="${VNSTOCK_API_KEY}" \
  -v "$(pwd)/product/api:/workspace:ro" \        # read-only source
  -v vnstock-venv:/workspace/.venv \              # isolated venv
  -w /workspace \
  python:3.12-slim \
  bash -c "apt-get update && ... && bash scripts/install-vnstock.sh --yes-i-know && ..."
```

## Related Code Files

- Execute: `product/api/scripts/install-vnstock.sh`

## Implementation Steps

### Step 1: Pre-flight confirmation

Before starting Docker:
```bash
pnpm check:budget -- --system vnstock_vendor --resource device_slots
```
- Expect: exit 0, `remaining: 1`, `validation_window_active: true`
- If exit 1 and `validation_window_active: false`: STOP — window was closed since Phase 1
- If exit 1 and `current >= budget`: STOP — budget exhausted

### Step 2: Create fresh Docker container and run validation

Single batch command — no interactive shell (Finding #1):

```bash
docker run --rm \
  -e VNSTOCK_API_KEY="${VNSTOCK_API_KEY}" \
  -v "$(pwd)/product/api:/workspace:ro" \
  -v vnstock-venv:/workspace/.venv \
  -w /workspace \
  python:3.12-slim \
  bash -c '
    set -euo pipefail

    # Bootstrap (infrastructure — retryable, not budget-consuming)
    apt-get update && apt-get install -y curl
    pip install uv
    uv sync

    # Verify bootstrap succeeded
    python -c "import pandas; import requests; print("deps OK")" || {
      echo "BOOTSTRAP FAIL: deps not installed"
      exit 1
    }
    test -x .venv/bin/python || {
      echo "BOOTSTRAP FAIL: .venv/bin/python missing"
      exit 1
    }

    # Validation (budget-consuming — Rule 3 applies)
    bash scripts/install-vnstock.sh --yes-i-know

    # Post-flight verification
    HOME=$(pwd) VNSTOCK_CONFIG_PATH=$(pwd)/.vnstock .venv/bin/python -c "
    import vnstock_data
    print(f"version: {vnstock_data.__version__}")
    try:
        syms = vnstock_data.listing.all_symbols()
        print(f"API OK: {len(syms)} symbols")
    except Exception as e:
        print(f"API FAILED: {e}")
        raise SystemExit(1)
    "
  '
```

**If ANY validation step fails → STOP. Do NOT:**
- Fix the script and re-run in the same container
- Run `import vnstock_data` on the host to debug
- Create a second Docker container without operator clearance
- Rationalize partial success

**On failure:** Report the exact error to operator. Fix script in Phase 1 mode (zero slots). Get new operator clearance before retry.

### Step 3: Clean up named volume

```bash
docker volume rm vnstock-venv 2>/dev/null || true
```

### Step 4: Report to operator

Report:
- Install script exit code
- vnstock_data version installed
- API ping result
- Any warnings or errors

**Then STOP.** Do not proceed to Phase 4 until operator confirms.

## Success Criteria

- [ ] Budget checker returned green with `validation_window_active: true` before Docker creation
- [ ] Fresh Docker container used (not reused)
- [ ] Bootstrap succeeded (deps installed, venv ready)
- [ ] Install script exited 0
- [ ] vnstock_data import check passed
- [ ] API ping test passed
- [ ] Exactly 1 device in vendor UI (operator confirms)
- [ ] No host-side `import vnstock_data` during validation window
- [ ] No host filesystem mutation (named volume for .venv)
- [ ] Results reported to operator

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Docker shares host kernel (fingerprint collision) | Known constraint; operator confirms 0 devices before Phase 3 (Phase 1 Step 7) |
| Vendor installer SHA-256 drift | Checked in Phase 1; install script also checks at runtime |
| Single slot — no retry without operator | By design; operator clearance required |
| Container reuse by agent | `--rm` flag + plan rule (Rule 9) |
| Host-side import during window | Plan rule (no host imports); Docker isolation |
| Host filesystem mutation via bind mount | Read-only source mount + named volume for .venv |
| Bootstrap failure (network, apt-get) | Retryable — not budget-consuming; only install script triggers Rule 3 |

## Security Considerations

- VNSTOCK_API_KEY passed via environment variable (not hardcoded)
- Container is destroyed after use (`--rm`)
- Named volume destroyed after validation
- Source mount is read-only (`:ro`)
- No credentials written to host filesystem

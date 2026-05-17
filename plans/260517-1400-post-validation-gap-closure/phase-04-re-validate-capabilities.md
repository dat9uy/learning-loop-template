---
phase: 4
title: "Re-validate Capabilities"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 4: Re-validate Capabilities

## Overview

Re-run all 5 vnstock_data capability scripts after cleanup to verify they still work. This confirms the library layer is functional after the install-vnstock.sh rewrite and stale-container guard addition.

## Context

- Previous validation: `experiment-vnstock-capabilities-20260509T174957Z` (result: supports)
- Recent changes: install-vnstock.sh rewrite with stale-container guard, HOME override, idempotency check
- Device budget: 1/1 — installer idempotency must skip registration when `.vnstock` exists
- Capability scripts: `product/api/capabilities/vnstock-data/capability-0[0-4]-*.py`
- vnstock_data is vendor-only (not in pyproject.toml) — `uv sync` alone cannot install it

## Prerequisites

- Phase 2 completed (cleanup script ran, transient root-owned artifacts removed)
- `.vnstock` preserved (device registration intact)

## Blocked State (2026-05-17)

**Root cause:** Docker HOME leak created root-owned `.venv`. Cleanup script preserved it (stale-container guard). Manual `sudo rm -rf .venv` completed, but `pnpm bootstrap:api` hits stale guard (`.vnstock` exists, `vnstock_data` not importable). Bypassing stale guard by removing `.vnstock` causes installer to attempt new registration, hitting device limit (budget 1/1).

**Attempted:**
1. `pnpm bootstrap:api` → stale guard fired
2. Renamed `.vnstock` to `.vnstock.bak`, ran installer → device limit exceeded
3. Restored `.vnstock` from backup

**Observation:** `observation-sandbox-cleanup-sudo-requirement.yaml` documents full constraint chain.

**To unblock:**
1. Clear device at https://vnstocks.com/account?section=devices
2. Run `pnpm bootstrap:api` (will register new device, consume slot)
3. Update `observation-vnstock-resource-budget.yaml` if device ID changes

## Related Code Files

- Run: `product/api/capabilities/vnstock-data/capability-00-discovery.py`
- Run: `product/api/capabilities/vnstock-data/capability-01-reference.py`
- Run: `product/api/capabilities/vnstock-data/capability-02-market.py`
- Run: `product/api/capabilities/vnstock-data/capability-03-fundamental.py`
- Run: `product/api/capabilities/vnstock-data/capability-04-insights-macro.py`

## Implementation Steps

1. Check if `.venv` exists and vnstock_data is importable:
   - `cd product/api && .venv/bin/python -c "import vnstock_data" 2>/dev/null`
   - If yes: skip to step 3 (environment is ready)
2. If vnstock_data is NOT importable, run `pnpm bootstrap:api` (runs `uv sync` + `install-vnstock.sh`). The installer's idempotency check detects `.vnstock` exists and skips registration.
3. Run each capability script sequentially:
   - `cd product/api && .venv/bin/python capabilities/vnstock-data/capability-00-discovery.py`
   - `cd product/api && .venv/bin/python capabilities/vnstock-data/capability-01-reference.py`
   - `cd product/api && .venv/bin/python capabilities/vnstock-data/capability-02-market.py`
   - `cd product/api && .venv/bin/python capabilities/vnstock-data/capability-03-fundamental.py`
   - `cd product/api && .venv/bin/python capabilities/vnstock-data/capability-04-insights-macro.py`
4. Capture output for each script (pass/fail + key metadata: row count, column names)
5. If all pass, create evidence file at `records/evidence/vnstock-data/capability-revalidation-20260517.md` with: which scripts ran, pass/fail per script, key metadata, vnstock_data version
6. Run `pnpm check`

## Success Criteria

- [ ] All 5 capability scripts execute without error
- [ ] Each script returns a non-empty DataFrame (`len(df) > 0`)
- [ ] Evidence file created with run results
- [ ] `pnpm check` passes

## Risk Assessment

- **Risk:** `uv sync` doesn't install vnstock_data. **Mitigation:** `pnpm bootstrap:api` handles both `uv sync` and vendor installer. Step 1 checks import state first.
- **Risk:** Device slot already consumed, installer fails. **Mitigation:** `.vnstock` preserved, idempotency check skips registration when vnstock_data imports.
- **Risk:** Vendor API returns 403 (stale device ID). **Mitigation:** Check vendor device list if this happens; out of scope for this plan.

## Experiment Outcome

- Outcome: `supports` if all 5 scripts return non-empty DataFrames
- Outcome: `does-not-support` if any script fails or returns empty data
- Outcome: `inconclusive` if environment issue prevents execution

## Troubleshooting

- **Single script fails:** Check vendor API status at vnstocks.com. The endpoint may have changed. Check vnstock_data version: `product/api/.venv/bin/python -c "import vnstock_data; print(vnstock_data.__version__)"`.
- **All scripts fail:** Verify vnstock_data is importable and device ID is valid: `product/api/scripts/install-vnstock.sh --check-device`.
- **Bootstrap fails at stale guard:** `.vnstock` exists but vnstock_data not importable. This means cleanup removed `.venv` while preserving `.vnstock`. Run `pnpm bootstrap:api -- --force` (consumes device slot, update budget record).
- **Bootstrap fails at device limit:** Budget exhausted. Operator must clear device at vnstocks.com/account?section=devices before retrying.

---
phase: 1
title: "Pre-Validation Check"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Pre-Validation Check

## Overview

Verify all prerequisites before opening the validation window. Zero slots consumed. If any check fails, fix before proceeding.

## Requirements

- Functional: install script is current, host state is clean, budget is available
- Non-functional: all checks are read-only (no state mutations)

## Related Code Files

- Read: `product/api/scripts/install-vnstock.sh`
- Read: `records/observations/observation-vnstock-resource-budget.yaml`
- Read: `product/api/pyproject.toml`
- Modify: `tools/check-budget/check-budget.js` (add validation_window_active gate)

## Implementation Steps

1. **Budget checker: add validation_window_active gate (Finding #4):**
   In `check-budget.js`, before the final `process.exit(0)` (line 96), add:
   ```javascript
   if (budget.validation_window?.active) {
     process.exit(1);
   }
   ```
   This makes the budget checker return exit 1 when a validation window is already active, preventing concurrent validations.

2. **Verify budget checker returns green:**
   ```bash
   pnpm check:budget -- --system vnstock_vendor --resource device_slots
   ```
   - Expect: exit 0, JSON with `remaining: 1`, `stale: false`, `validation_window_active: false`
   - If exit 1: budget exhausted or validation window already active — STOP

3. **Verify host state is clean (two locations):**
   ```bash
   test ! -d ~/.vnstock || echo "HAZARD: ~/.vnstock exists on host"
   test ! -d product/api/.vnstock || echo "HAZARD: product/api/.vnstock exists on host"
   ```
   - If `~/.vnstock` exists: ask operator to remove (stale auth cache, reactivation hazard)
   - If `product/api/.vnstock` exists: ask operator to remove (bind-mount target, will trigger stale-container guard in Docker)
   - Rationale: Docker bind mount makes `product/api/.vnstock` visible inside container at `/workspace/.vnstock`

4. **Verify install script is current (Finding #13 — full block):**
   - Read `product/api/scripts/install-vnstock.sh`
   - Confirm: `HOME="${API_HOME}"` override present (lines 94, 169, 276)
   - Confirm: `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock"` set (line 97)
   - Confirm: idempotency check present (**lines 168-178** — covers both `FORCE=0` import check AND `FORCE=1` device.id removal)
   - Confirm: slot-aware warning present (line 181-199)
   - Confirm: post-flight import check + API ping present (lines 276-294)
   - If any check fails: note the gap, fix in Phase 2

5. **Verify VNSTOCK_API_KEY is available:**
   - Check environment or `.env` for the key
   - If missing: STOP — operator must provide before validation

6. **Verify Docker is available:**
   ```bash
   docker --version && docker info --format '{{.ServerVersion}}'
   ```
   - If missing: STOP — Docker required for validation

7. **Open validation window:**
   - Ask operator to confirm vendor UI shows 0 devices
   - Set `validation_window.active = true` in budget YAML (operator writes)
   - Set `validation_window.opened_at` to current timestamp

## Success Criteria

- [ ] Budget checker exits 1 when `validation_window_active: true` (gate added)
- [ ] Budget checker returns exit 0 with remaining >= 1
- [ ] No `~/.vnstock` on host
- [ ] No `product/api/.vnstock` on host
- [ ] Install script has HOME override, idempotency check (lines 168-178), slot warning, post-flight checks
- [ ] VNSTOCK_API_KEY available in environment
- [ ] Docker available and running
- [ ] Validation window opened in budget YAML (operator confirmed)

## Risk Assessment

- Low risk: all checks are read-only, no slots consumed
- If host `.vnstock` exists (either location): must resolve before proceeding
- Budget checker gate change is a code change but trivial (~3 lines)

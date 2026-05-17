---
phase: 2
title: "Create Cleanup Script"
status: pending
priority: P2
effort: "30m"
dependencies: []
---

# Phase 2: Create Cleanup Script

## Overview

Create a reusable cleanup mechanism for root-owned Docker artifacts in `product/api/`. Uses an allowlist approach with dry-run default to prevent accidental deletion of device registration state.

## Context

Docker runs using `product/api/` as HOME have leaked root-owned artifacts:
- `.vnstock` (root-owned) — MUST PRESERVE (device registration, budget 1/1)
- `.venv` (root-owned) — remove only if `.vnstock` does NOT exist; otherwise preserve (stale-container guard deadlock)
- `.cache` (root-owned) — remove, transient
- `.config` (root-owned) — remove, transient
- `product/api/product/` (root-owned) — remove, Docker HOME leak artifact (nested `product/api/product/api/`)

**Deadlock constraint:** Removing `.venv` while preserving `.vnstock` creates an unrecoverable state: `uv sync` rebuilds `.venv` without vnstock_data (vendor-only), then `install-vnstock.sh` stale-container guard fires because `.vnstock` exists but vnstock_data doesn't import. No flag bypasses this without consuming a device slot. Therefore: if `.vnstock` exists, skip `.venv` cleanup entirely.

## Related Code Files

- Create: `product/api/scripts/cleanup-sandbox.sh`
- Modify: `package.json` (add `clean:sandbox` script)

## Implementation Steps

1. Create `product/api/scripts/cleanup-sandbox.sh`:
   - `set -euo pipefail`
   - Define `API_ROOT` as the directory where the script lives (relative to `product/api/scripts/`)
   - **Sudo check first:** `if [[ $(id -u) -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then echo "sudo required for root-owned cleanup"; exit 1; fi`
   - **Dry-run by default:** Support `--confirm` flag for actual deletion
   - **Allowlist approach** (not blocklist): target ONLY `.cache`, `.config`, and `product/` (the nested Docker artifact at `product/api/product/`)
   - **Conditional `.venv` removal:** only if `.vnstock` does NOT exist
   - **Never touch `.vnstock`**
   - Use `rm -rf` if running as root (UID 0), otherwise `sudo rm -rf`
   - Verify cleanup: check no root-owned artifacts remain (except `.vnstock` and `.venv` if preserved)
   - Report what was cleaned (or what would be cleaned in dry-run mode)
2. Add to `package.json` scripts: `"clean:sandbox": "bash product/api/scripts/cleanup-sandbox.sh"`
3. Run `pnpm clean:sandbox` (dry-run) to preview
4. Run `pnpm clean:sandbox --confirm` to clean current state
5. Run `pnpm check` to verify no validation regressions

## Success Criteria

- [ ] `product/api/scripts/cleanup-sandbox.sh` exists and is executable
- [ ] `pnpm clean:sandbox` is in package.json
- [ ] Script defaults to dry-run (lists targets without removing)
- [ ] Script uses allowlist: only `.cache`, `.config`, `product/` (and `.venv` if no `.vnstock`)
- [ ] Script never touches `.vnstock`
- [ ] Script checks sudo before attempting removal
- [ ] Running the script cleans current root-owned artifacts
- [ ] `pnpm check` passes

## Risk Assessment

- **Risk:** Accidentally removing `.vnstock` loses device registration. **Mitigation:** Allowlist approach — `.vnstock` is never in the target list.
- **Risk:** Removing `.venv` with `.vnstock` present causes stale-container deadlock. **Mitigation:** Conditional logic — skip `.venv` if `.vnstock` exists.
- **Risk:** `sudo` not available or requires password. **Mitigation:** Check `id -u` first (root doesn't need sudo). Check `command -v sudo` before use. Fail fast.
- **Risk:** Deleting files not in allowlist. **Mitigation:** Allowlist is hardcoded, not computed from `find`.

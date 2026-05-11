---
phase: 1
title: "Apply wrapper env-var fix"
status: completed
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Apply wrapper env-var fix

## Overview

Single-line fix in `product/api/scripts/install-vnstock.sh`: change `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock/user.json"` to `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock"`. Delete the `normalize_vnstock_config()` workaround helper (committed in `f4cbd5a`). Re-run installer and verify import works without backup-directory churn.

## Requirements

- Functional: `import vnstock_data` succeeds in `product/api/.venv` after installer run.
- Non-functional: no backup directory created; installer log shows no normalization line; idempotent on re-run.

## Architecture

Per source-read (`docs/vendor-vnstock-installer.md`):
- Installer treats `VNSTOCK_CONFIG_PATH` as the **directory** to write `api_key.json`, `device.id`, `user.json`, `user_install.json` into.
- Runtime (`vnstock_data.core.utils.const.py`) hard-codes `PROJECT_DIR = Path.home() / '.vnstock'` — env-var is never read.
- Our wrapper sets `HOME=${API_HOME}`, so runtime resolves config from `${API_HOME}/.vnstock/`.
- Setting `VNSTOCK_CONFIG_PATH=${API_HOME}/.vnstock` makes installer write FILES at the same path runtime reads.

## Related Code Files

- Modify: `product/api/scripts/install-vnstock.sh` (line 75 env var; delete lines 19–27 helper; delete two invocations)
- Cleanup test state: `product/api/.vnstock/user.json/` (if exists as a directory) and `product/api/.vnstock/user-json-dir.backup.*` (if exists from prior runs)

## Implementation Steps

1. Edit `install-vnstock.sh`:
   - Change `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock/user.json"` → `VNSTOCK_CONFIG_PATH="${API_HOME}/.vnstock"`
   - Delete the `normalize_vnstock_config()` function definition (8 lines)
   - Delete both call sites of `normalize_vnstock_config`
2. **Migrate orphaned files from backup directories**: if `user-json-dir.backup.*/` exists and contains `api_key.json` or `device.id` that are missing from `.vnstock/`, copy them to `.vnstock/` before deleting the backup.
3. Delete any stale `${API_ROOT}/.vnstock/user.json/` directory (the nested installer artifact) and `user-json-dir.backup.*` directories.
4. Run `bash product/api/scripts/install-vnstock.sh` → expect exit 0, no normalization line, ~9s runtime.
5. Verify: `product/api/.venv/bin/python -c "import vnstock_data; print(vnstock_data.__version__)"` → expect `3.0.0` printed.
6. Inspect `${API_ROOT}/.vnstock/` layout: `user.json` (file), `api_key.json`, `device.id`, `user_install.json` should all live at top level — no nested dir.

## Todo List

- [x] Edit env var in install-vnstock.sh
- [x] Delete normalize_vnstock_config helper + invocations
- [x] Migrate api_key.json / device.id from backup dirs if missing at top level
- [x] Clean any stale `.vnstock/user.json/` directory state
- [x] Re-run installer, expect clean exit
- [x] Verify `import vnstock_data` succeeds with no normalization log line

## Success Criteria

- [ ] `VNSTOCK_CONFIG_PATH` points at the dir, no `/user.json` suffix
- [ ] `normalize_vnstock_config` helper and both call sites removed
- [ ] `import vnstock_data` exits 0 from the installer's final check
- [ ] No `user-json-dir.backup.*` directory produced this run
- [ ] `.vnstock/user.json` is a FILE, not a directory

## Risk Assessment

- **Slot consumption per re-install**: bronze tier nominally 1/device; observation shows non-strict enforcement. Risk low. Mitigation: only run once unless cleanup needed.
- **Env-var fix doesn't fully resolve IsADirectoryError**: low probability given source-read evidence. Mitigation: if it fails, revert the helper deletion and keep the workaround as belt-and-braces.
- **Co-dependent vendor packages** (`vnai`, `vnii`): vnai also reads `Path.home()/.vnstock/api_key.json`. Fix puts file at correct path — no breakage expected. Verify via `vnai`-touching path at phase 4.
- **Orphaned files in backup**: if `api_key.json` or `device.id` were left in a backup directory, `vnai` telemetry may break after cleanup. Mitigation: migrate step (step 2) handles this before deletion.

## Security Considerations

- `api_key.json` and `device.id` retain 0o600 permissions (installer-set).
- No new files or secrets introduced.

## Next Steps

- Phase 2 (vendor compat patch) — independent of this phase but required for the 403 fix; can be implemented in parallel.
- Phase 3 (smoke test) — depends on both 1 and 2.

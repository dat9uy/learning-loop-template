---
phase: 2
title: "Library Installation"
status: pending
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Library Installation

## Overview

Install `vnstock_data` into the shared environment. This requires credentials, device registration, and respects the account-and-OS-global device limit.

## Requirements

- Functional: `vnstock_data` is importable from the shared environment.
- Non-functional: Credentials are handled securely (env var, not committed). Device limit is checked before install attempt.

## Architecture

The vendor installer is a Makeself `.run` archive downloaded from `vnstocks.com`. It expects:
- `VNSTOCK_API_KEY` environment variable
- A writable `HOME` directory for device registration
- Internet access to verify the subscription

## Related Code Files

- Modify: `product/pyproject.toml` (add vnstock_data dependency if install succeeds)
- No code files created; this is environment mutation.

## Implementation Steps

1. **Credential check**: Verify `VNSTOCK_API_KEY` is available as an environment variable. If not, ask operator.
2. **Device limit check**: Ask the operator to check the vendor device management UI (`https://vnstocks.com/account?section=devices`) and confirm a Linux device slot is available. The agent cannot access authenticated vendor UIs.
3. **Download installer**: Download the official Makeself `.run` installer to a temp directory.
4. **Execute installer**: Run the installer with the API key env var, targeting `product/.venv/`.
5. **Verify import**: Run `product/.venv/bin/python -c "import vnstock_data; print(vnstock_data.__version__)"`.
6. **Update manifest**: If install succeeds, note the installed version in `product/pyproject.toml` (manual or via `uv add`).
7. **Cleanup**: Delete the installer archive and any temp files.

## Success Criteria

- [ ] `vnstock_data` imports successfully from `product/.venv/bin/python`.
- [ ] Version string prints without error.
- [ ] No credentials or install logs remain in the repo.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Device limit reached (1/1 Linux slots used) | High | Check vendor UI before install. If full, ask operator to clear a device. |
| Invalid/expired API key | Medium | Verify key format and test via vendor portal before install. |
| Installer fails due to missing system deps | Medium | Ensure `uv`, `pandas`, and standard build tools are available. |
| Credential leak into repo | Critical | Use env var only; never write key to disk inside repo. |

## Blocked Actions

- Do not capture the API key in any record or evidence file.
- Do not commit install logs or `.run` installer to git.

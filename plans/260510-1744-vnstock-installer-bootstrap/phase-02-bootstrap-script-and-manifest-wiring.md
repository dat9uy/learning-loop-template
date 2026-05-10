---
phase: 2
title: "Bootstrap Script And Manifest Wiring"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Bootstrap Script And Manifest Wiring

## Context Links

- `product/api/pyproject.toml`
- `package.json`
- `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md`
- `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml`

## Overview

Implement the reproducible bootstrap surface without running the vendor installer. Stage 1 remains declarative uv dependency sync; stage 2 becomes an explicit, idempotent, SHA-pinned shell script.

## Requirements

- Functional: remove the non-resolvable `vendor` extra from `product/api/pyproject.toml`.
- Functional: add `product/api/scripts/install-vnstock.sh`.
- Functional: add root `bootstrap:api` command that runs `uv sync` then the script.
- Non-functional: fail closed on hash mismatch, missing venv, missing `VNSTOCK_API_KEY`, or missing post-install module.
- Non-functional: never auto-run from install hooks.

## Architecture

```text
pnpm bootstrap:api
  -> cd product/api
  -> uv sync                    # public deps only
  -> bash scripts/install-vnstock.sh
       -> import gate short-circuit
       -> download installer to temp dir
       -> verify SHA-256
       -> HOME=product/api bash installer
       -> post-flight import check
```

## Related Code Files

- Modify: `product/api/pyproject.toml`
- Create: `product/api/scripts/install-vnstock.sh`
- Modify: `package.json`
- Create or update: `product/api/uv.lock` if `uv sync` updates lock state.

## Implementation Steps

1. Remove `[project.optional-dependencies] vendor` and keep `pandas`, `requests`, and `uv` as public dependencies.
2. Create `product/api/scripts/install-vnstock.sh` with `set -euo pipefail`, temp-dir cleanup trap, and clear error messages.
3. Add defaults:
   - `VNSTOCK_INSTALLER_URL=https://vnstocks.com/files/vnstock-cli-installer.run`
   - `VNSTOCK_INSTALLER_SHA256=1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`
4. Require `VNSTOCK_API_KEY`; do not print it.
5. Short-circuit when `product/api/.venv/bin/python -c "import vnstock_data"` succeeds.
6. Preflight that `.venv/bin/python` exists and `pandas` imports before download.
7. Download with `curl -fsSL`, verify with `sha256sum`, then execute with `HOME="$(realpath product/api)"`, `VNSTOCK_CONFIG_PATH="$HOME/.vnstock/user.json"`, `VNSTOCK_VENV_TYPE=venv`, and `VNSTOCK_LANGUAGE=python`.
8. Post-flight with an import-oriented check. Treat missing module as fatal; distinguish known config warnings when possible.
9. Add `"bootstrap:api": "cd product/api && uv sync && bash scripts/install-vnstock.sh"` to root `package.json`.
10. Run syntax checks that do not hit the network or vendor installer, e.g. `bash -n product/api/scripts/install-vnstock.sh`.

## Success Criteria

- [x] `uv sync --extra vendor` is no longer part of the API manifest contract.
- [x] Script is executable or documented to run via `bash`.
- [x] Script does not leak env var values in output.
- [x] `bash -n product/api/scripts/install-vnstock.sh` passes.
- [x] `pnpm bootstrap:api` exists and is explicit operator action.

## Risk Assessment

Risk: post-flight import may fail because vendor config is incomplete even when package files installed.
Mitigation: use the narrowest import check that proves package presence, and document any known recoverable config warning in Phase 4 evidence.

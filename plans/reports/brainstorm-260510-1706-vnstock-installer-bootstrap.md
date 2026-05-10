# Brainstorm: vnstock_data Installer Bootstrap Separation

Date: 2026-05-10
Scope: Separate the `vnstock_data` install path from the public-deps `uv sync` flow under `product/api/`. Replace the misleading `[project.optional-dependencies] vendor` extra and the hand-copied-`.venv` workaround with a reproducible two-stage bootstrap. Land before any FastAPI/TanStack code is written; sibling to `decision-20260510T160000Z-capabilities-stack-migration`.

## Problem

`decision-20260510T160000Z-capabilities-stack-migration` carries a tradeoff bullet asserting:

> Recreating `product/api/.venv` requires running `uv sync` against PyPI. The vnstock_data wheel is on PyPI (`INSTALLER: uv` per current dist-info), so this works without re-triggering the Makeself installer or vendor device-clearance flow.

Phase 04 of that plan disproved this. `records/evidence/loop/capabilities-stack-migration.md` records the actual observation:

> `uv sync --extra vendor` could not resolve the private `vnstock_data` distribution from the current registry. The stack virtualenv was recreated, public dependencies were installed from the package index, and private vendor packages were copied from the old local virtualenv after the registry miss.

The `INSTALLER: uv` field in dist-info indicates the local tool that performed the install, not that the artifact came from a public index. No `vnstock_data==3.1.7` wheel exists on PyPI or in any registry uv can see. The current `pyproject.toml` `vendor` extra is non-resolvable; today's venv stands only because someone hand-copied `vnstock_data` from a pre-migration `.venv`.

That state is not reproducible. A fresh clone, a CI run, or any operator deleting `product/api/.venv` cannot rebuild the venv from the repo alone.

## Reading Context

Records consulted while drafting this brainstorm:

- `records/claims/claim-vnstock-install-sandbox.yaml` — confirms the artifact class is a Makeself `.run` installer at `https://vnstocks.com/files/vnstock-cli-installer.run`, env-var-driven.
- `records/claims/claim-vnstock-device-limit-mechanism.yaml` — confirms each fresh install consumes one Linux device slot under the bronze-tier subscription.
- `records/decisions/decision-20260510T160000Z-capabilities-stack-migration.yaml` — the prior decision whose tradeoff bullet about "wheel on PyPI" is the broken assumption.
- `records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml` — referenced via the install-sandbox claim's `notes`.
- `records/evidence/loop/capabilities-stack-migration.md` — phase 04 evidence of the registry miss.
- `records/evidence/vnstock-data/installer-prior-notes.md` — installer URL class + option names (`--non-interactive`, `--api-key`, `--venv-path`, `--language`).
- `records/evidence/vnstock-data/experiment-install-20260509T071800Z-sandbox-1.md` — verified env-var-driven install, installer SHA `1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`, installer-created venv at `$HOME/.venv`, device registration consumed one bronze slot.
- `product/api/pyproject.toml` — current shape with non-resolvable `vendor` extra.

Frozen records (referenced, not edited): `experiment-vnstock-capabilities-20260509T174957Z`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`.

## Approach Evaluation

### A — Vendor a wheel under `[tool.uv.sources]` (rejected)

Drop `vnstock_data-X.Y.Z-py3-none-any.whl` into `product/api/vendor/`, point uv at the path. Single `uv sync --extra vendor` rebuilds the venv.

Rejected: **no wheel exists.** Vendor distributes a Makeself archive that creates its own venv, registers the device, then downloads + extracts the package internally. The artifact is not a wheel; it cannot become one without vendor cooperation. uv cache shows only `vnstock_data-3.1.3` from a path-install — older than the pinned `3.1.7`, and even that 3.1.3 was not produced by PyPI.

### B — Private PyPI index via `[[tool.uv.index]]` (rejected)

Operator stands up a private mirror, publishes `vnstock_data` to it, uv resolves alongside public deps.

Rejected: requires hosting infra the project does not have, and would require extracting/repackaging the vendor's installer-wrapped artifact — likely a license violation.

### C — Keep `[project.optional-dependencies] vendor` + manual venv copy (rejected)

Status quo. Hand-copy `vnstock_data` from a pre-existing `.venv` after `uv sync` fails the extra.

Rejected: not reproducible from the repo. Breaks on fresh clone, in CI, after any `rm -rf .venv`. The `vendor` extra is misleading config — it advertises a resolution path uv cannot satisfy.

### D — Two-stage bootstrap (chosen)

Stage 1, declarative: `uv sync` installs only public deps (`pandas`, `requests`, `uv`). `pyproject.toml` `vendor` extra removed. uv.lock pins everything reproducibly.

Stage 2, imperative: `product/api/scripts/install-vnstock.sh` downloads `vnstock-cli-installer.run`, verifies SHA-256 against the value pinned from `experiment-install-20260509T071800Z-sandbox-1.md` (`1982f7f93386daa57e1a1c0b18a87c8a299b9ad1d331f4123ab534656fa4c7ed`), runs it with `HOME=$(realpath product/api)`, `VNSTOCK_VENV_TYPE=venv`, `VNSTOCK_LANGUAGE=python`, `VNSTOCK_API_KEY` from the environment. Idempotent: a pre-flight `python -c "import vnstock_data"` short-circuits the run if the package already imports.

Pros: each stage is reproducible within its own contract. Public deps via uv.lock, vendor via SHA-pinned installer. The `vendor` extra is removed instead of misleading. `pnpm bootstrap:vnstock` (or `make bootstrap`) wires both stages into one operator command.

Cons: not single-command from `uv sync` alone. Hash pin must be rotated on every vendor installer update. Each fresh install consumes one device slot — operator handles this on the vnstocks UI.

## Final Solution

### `product/api/pyproject.toml` change

Drop the `vendor` extra entirely:

```toml
[project]
name = "learning-loop-product"
version = "0.1.0"
description = "Product runtime environment for learning-loop capability experiments."
requires-python = ">=3.10"
dependencies = [
  "pandas>=3.0.2",
  "requests>=2.33.1",
  "uv>=0.11.12",
]

[tool.uv]
package = false
```

Rationale: the extra is a resolution promise uv cannot keep. Removing it keeps the manifest honest.

### `product/api/scripts/install-vnstock.sh` (new)

Shell bootstrap with:

- Required env: `VNSTOCK_API_KEY`. Optional: `VNSTOCK_INSTALLER_URL` (default `https://vnstocks.com/files/vnstock-cli-installer.run`), `VNSTOCK_INSTALLER_SHA256` (default pinned).
- Idempotency gate: `product/api/.venv/bin/python -c "import vnstock_data" && exit 0`.
- Pre-flight: `product/api/.venv` exists (operator runs `uv sync` first), `pandas` already importable in that venv (installer prerequisite per sandbox-1 evidence).
- Download: `curl -fsSL "$VNSTOCK_INSTALLER_URL" -o "$tmp/installer.run"`.
- Verify: `sha256sum "$tmp/installer.run"` matches `VNSTOCK_INSTALLER_SHA256`. Fail loudly on mismatch.
- Execute: `HOME="$(realpath product/api)" VNSTOCK_CONFIG_PATH="$HOME/.vnstock/user.json" VNSTOCK_VENV_TYPE=venv VNSTOCK_LANGUAGE=python bash "$tmp/installer.run"`.
- Post-flight: `product/api/.venv/bin/python -c "import vnstock_data; print(vnstock_data.__version__)"` must succeed. Fail loudly otherwise.
- Cleanup: `rm -rf "$tmp"`.

Script lives under `product/api/scripts/` (per-stack convention). Stays under 200 lines. No bash modularization required (configuration files / shell scripts are exempt per development rules).

### `package.json` script wiring (root)

```json
"scripts": {
  "bootstrap:api": "cd product/api && uv sync && bash scripts/install-vnstock.sh"
}
```

Single operator command rebuilds the API stack venv from a clean clone.

### Doc updates (living docs)

- `docs/operator-guide.md` — add a "Stack Bootstrap" subsection under "Stacks and Capability Locations" describing the two-stage flow.
- `product/README.md` — workspace overview gains a one-line pointer to `bootstrap:api`.
- `product/api/capabilities/vnstock-data/README.md` — replace any `uv sync --extra vendor` reference with `pnpm bootstrap:api`.

Frozen records and journals untouched.

### Records authored

- `records/evidence/loop/vnstock-installer-bootstrap.md` — discovery evidence: prior assumption, observed registry miss, root cause, workaround, reproducibility gap. Cites all claims/decisions/evidence read above.
- `records/decisions/decision-20260510T170623Z-vnstock-installer-bootstrap.yaml` — draft decision locking the two-stage bootstrap, the dropped `vendor` extra, the hash-pinned installer script, and the per-stack scripts location.

A claim is **not** authored. The existing `claim-vnstock-install-sandbox` already covers installer behavior; this work refines installation topology, not vendor claims. The runtime claim flip (to `verified` for the new bootstrap) belongs to a future implementation plan's loop phase, not this brainstorm.

## Implementation Considerations

- The installer creates `$HOME/.venv`. Setting `HOME="$(realpath product/api)"` makes `$HOME/.venv` resolve to `product/api/.venv`, the same location `uv sync` populated in stage 1. The installer adds `vnstock_data` (and `vnstock_core`) into that pre-existing venv rather than overwriting it — confirmed by sandbox-1 evidence (`installer-created venv path observed: $HOME/.venv`).
- `vnstock_data` import check post-install can fail with `Không tìm thấy thông tin người dùng hợp lệ` — sandbox-1 evidence shows this as a non-fatal warning during install. The post-flight check should distinguish (a) module not present (fatal) from (b) module present but config missing (recoverable; first capability run repopulates `~/.vnstock/user.json`).
- `pandas` is an installer prerequisite, not optional. Its presence in `[project.dependencies]` is load-bearing for stage 2.
- The hash pin in the script is the contract with the vendor. Operator rotates the pin only after running a sandbox-1-style fresh-Docker experiment that proves the new installer behaves; the pin update is a loop-record event, not a silent commit.
- `product/api/.vnstock/` directory is preserved by the prior migration; the bootstrap script must not delete it.
- The bootstrap script is bash-only, no node/python dependencies. Runs on any POSIX shell environment with `curl`, `sha256sum`, `bash`.

## Risks

| Risk | Mitigation |
|---|---|
| Vendor rotates installer URL or SHA without notice | Hash pin fails closed; script aborts. Rotation is a loop-recorded event. |
| Operator runs stage 2 without stage 1 (no venv exists) | Pre-flight check requires `product/api/.venv/bin/python` exists; fail loudly with stage-1 instruction. |
| Bootstrap consumed device slot but vnstock UI shows slot-full from stale fingerprint | Out of scope for this script; operator clears via vnstocks UI per `decision-20260509T070411Z-vnstock-vendor-device-limit-clearance`. |
| Post-flight import fails with config error vs missing module | Distinguish exit codes; treat config error as warning, missing module as fatal. |
| `pandas` future bump breaks installer compat (sandbox-1 needed it preinstalled, version unknown) | Pin `pandas` floor in `pyproject.toml` at the version that worked in sandbox-1; bump only with a re-verify sandbox run. |
| Removing `vendor` extra breaks any external skill that calls `uv sync --extra vendor` | Grep `.claude/skills/`, `docs/`, `product/api/capabilities/vnstock-data/README.md`. Replace all with `pnpm bootstrap:api`. |

## Next Steps

1. Hand off to `/ck:plan` with this report as input. Output: phase plan under `plans/<ts>-vnstock-installer-bootstrap/` — small, three or four phases (records → script + pyproject edit → docs harmonize → post-records).
2. Operator approves the draft decision after reviewing the brainstorm + evidence.
3. Implementation lands the script + manifest edit + doc harmonize. Phase-final loop-records flip the decision to `approved` and add a runtime evidence MD covering a fresh `pnpm bootstrap:api` run on a clean `.venv`.
4. Future: when vendor publishes a new installer, append a sandbox-1-style experiment record + rotate the SHA pin in the same commit.

## Unresolved Questions

- **Installer URL stability:** `installer-prior-notes.md` describes the URL as a "candidate fact". Does the vendor publish a versioned URL (e.g. `vnstock-cli-installer-v3.1.7.run`), or only the rolling latest? If versioned, prefer pinning the URL too. Confirm in the next sandbox run.
- **Idempotency under partial state:** if stage 2 was interrupted mid-install (network drop after device registration), is re-running safe, or does the device-already-registered path need a different code path? Sandbox-1 evidence shows a clean run; an interrupt scenario was not tested.
- **`vnstock_core` version coupling:** the installer brings in `vnstock_core` plus `vnstock_data`. Should `vnstock_core` also be flagged in the decision's `affected_refs`, or is it transparent vendor internals? Defer to operator review.

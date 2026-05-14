# 260513 — Vnstock Prepared Substrate Follow-Up Experiment

## Context

Follow-up to `docs/journals/260513-learning-loop-orchestration-enhancement-vnstock-experiment.md`.
Executed the "Option A" follow-up experiment proposed in that journal.

## Changes

### Experiment Execution
- **Created** `records/experiments/experiment-vnstock-install-prepared-substrate-20260513T173104Z.yaml` — experiment record capturing mixed results: hypothesis 1 confirmed, hypothesis 2 contradicted.
- **Created** `records/evidence/vnstock-data/experiment-install-prepared-substrate-20260513T173104Z.md` — evidence envelope with full runtime observations from the prepared-substrate Docker sandbox.

### Claim Update
- **Updated** `records/claims/claim-vnstock-install-sandbox.yaml` — updated `updated_at`, added new evidence ref, and rewrote limitations:
  - Confirmed one-liner succeeds in prepared substrates (requests/vnai/pandas/numpy pre-installed).
  - Resolved the venv-path discrepancy: installer unconditionally uses `/root/.venv`; `/opt/venv` is ignored.

## Experiment Results

| Hypothesis | Result | Detail |
|------------|--------|--------|
| H1: One-liner proceeds in prepared substrate | **Confirmed** | Installer reached device registration after installing 35 deps into `/root/.venv` |
| H2: Pre-created `/opt/venv` is respected | **Contradicted** | Installer unconditionally created `/root/.venv` despite `PATH=/opt/venv/bin:$PATH` |

## Key Observations

- Installer SHA-256 unchanged: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- Device-limit gate reached and failed as expected (installer claims 'Golden 2'; actual limit is 1 Bronze device — confirmed 2026-05-15)
- `vnstock_data` not installed in either venv because device limit blocked sponsor package installation
- API key material confined to `/root/.vnstock/api_key.json` (container-local, removed with `--rm`)
- No secret leakage in `/tmp` or other temp locations

## Verification

- `pnpm check` passes (39 records validated, 3 tests green)
- `pnpm validate:records` passes
- Docker container removed via `--rm`
- No API key material retained in repo

## Impact

- The vendor one-liner is viable **only** in prepared substrates with `requests`, `vnai`, `pandas`, `numpy` pre-installed.
- The vendor Dockerfile pattern (pre-created `/opt/venv`) is **incorrect** — the installer hardcodes `/root/.venv`.
- Product bootstrap scripts should NOT attempt to use `/opt/venv` for vnstock installations.
- The venv-path discrepancy from prior experiments is now conclusively resolved.

## Open Questions for Next Session

1. **Bootstrap script substrate compatibility**: The product `pyproject.toml` includes `requests` and `pandas` but not `vnai`. The bootstrap script only checks for `pandas`. Does the installer itself need `vnai` pre-installed, or does it only install `vnai` into the target venv? If the former, the bootstrap script will fail in production.

2. **HOME override behavior**: The bootstrap script sets `HOME="${API_HOME}"` hoping the installer creates `.venv` inside the product directory. We proved the installer creates `~/.venv` when `HOME=/root`, but we never tested with `HOME` pointed at a non-root directory. If the installer respects `HOME`, the bootstrap script works. If the path is hardcoded to `/root/.venv`, it breaks for non-root users.

3. **Direct pip install of sponsor packages**: The vendor uses `--extra-index-url https://vnstocks.com/api/simple`. We never tested whether `vnstock_data` is available on that index. If it is, we could bypass the Makeself installer entirely — no device limit at install time, no SHA-256 drift.

## Proposed Next Experiment

**Goal**: Test bootstrap-script-equivalent substrate + HOME override to determine if the bootstrap script is viable.

**Hypotheses**:
- If only `requests` + `pandas` are pre-installed (matching actual product `.venv` after `uv sync`), the installer still proceeds past dependency checks.
- If `HOME=/tmp/fake-home` is set, the installer creates `/tmp/fake-home/.venv` rather than `/root/.venv`.

**Method**:
1. Fresh `python:3.11-slim` container.
2. Install system deps.
3. Create a venv with ONLY `requests>=2.31.0` and `pandas>=1.5.3` (no `vnai`, no `vnstock`).
4. Set `HOME=/tmp/fake-home`, `PATH` to venv, `VIRTUAL_ENV` to venv.
5. Download and run the vendor installer with API key.
6. Observe: does it fail before venv creation? Where is the venv created?
7. Accept device-limit failure; target is substrate compatibility and venv path.

**Blocked actions**:
- Do NOT clear host device registration.
- Do NOT modify `product/api/scripts/install-vnstock.sh` until hypotheses are tested.

## Version Claim

- **Created** `records/claims/claim-vnstock-version-requirements.yaml` — draft claim that a standard install produces `vnstock>=4` and `vnstock_data>=3`.
- `vnstock 4.0.2` was observed in the prepared substrate experiment.
- `vnstock_data` version remains unverified because device limit blocked installation.
- Future experiment with cleared device slot should verify `vnstock_data>=3`.

## Next Steps

- Run the proposed bootstrap-substrate experiment to answer open questions 1 and 2.
- Optionally test direct pip install from vendor extra-index URL.
- Update `product/api/scripts/install-vnstock.sh` based on findings.
- Verify version claim once a device slot is available.

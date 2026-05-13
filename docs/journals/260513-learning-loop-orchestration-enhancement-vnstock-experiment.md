# 260513 — Learning-Loop Orchestration Enhancement + Vnstock One-Liner Experiment

## Context
Executed `plans/260513-1538-learning-loop-orchestration/plan.md` in `code` mode.

## Changes

### Skill Enhancement
- **Created** `.claude/skills/learning-loop/references/orchestration-patterns.md` — full-lifecycle orchestration blueprint, post-experiment claim update blueprint, claim-evidence alignment review blueprint, promotion rules, and multi-experiment synthesis notes.
- **Updated** `.claude/skills/learning-loop/references/prompt-blueprints.md` — added pointer to orchestration-patterns.md.
- **Updated** `.claude/skills/learning-loop/SKILL.md` — added `full-lifecycle orchestration` as task class #9, updated When to Use, added orchestration-patterns.md to References.
- **Updated** `.claude/skills/learning-loop/evals/evals.json` — added orchestration eval case with 7 assertions.

### Experiment Execution
- **Created** `records/evidence/vnstock-data/experiment-install-vendor-one-liner-20260513T213042Z.md` — evidence envelope with runtime artifact standard fields.
- **Updated** `records/experiments/experiment-vnstock-install-vendor-one-liner-20260513T213042Z.yaml` — result `does-not-support`, result_reason, agent_outcome, observations, and verification block.

### Claim Update
- **Updated** `records/claims/claim-vnstock-install-sandbox.yaml` — kept `install` dimension `verified` (prior proof stands), updated reason via `pnpm verify:claim`, updated limitations to reflect flag-passthrough verification and undocumented `requests` prerequisite.

### Tool Fix
- **Updated** `tools/claim-verification/verify-claim.js` — added `capability` to schema list so `pnpm verify:claim` does not fail on capability records.

## Verification
- `pnpm check` passes (38 records validated, 3 tests green).
- `pnpm validate:records` passes.
- Docker containers removed after both sandboxes (`--rm`).
- No API key material retained in repo.

## Impact
- Agents can now use orchestration blueprints to chain experiment execution → result capture → claim update with promotion rules and alignment gates.
- The vendor one-liner hypothesis is disproved for fresh sandboxes; the bootstrap script should NOT adopt the one-liner without pre-installing `requests`.
- The venv-path discrepancy remains unresolved.

## Next Steps — Follow-Up Experiment (Option A)

**Goal:** Verify whether the vendor one-liner succeeds in a prepared substrate and whether pre-created `/opt/venv` is respected.

**Hypothesis:**
1. If `requests`, `vnai`, and `pandas` are pre-installed in `/opt/venv` (matching the vendor Dockerfile sample), the one-liner will proceed past the `import requests` failure and reach the venv creation / package installation stage.
2. If `PATH=/opt/venv/bin:$PATH` is set, the installer will install sponsor packages into `/opt/venv` rather than creating `$HOME/.venv`.

**Method:**
1. Start fresh `python:3.11-slim` container.
2. Install system deps: `wget`, `build-essential`.
3. Create `/opt/venv` and pre-install: `requests>=2.31.0`, `vnai>=2.2.3`, `pandas>=1.5.3`, `numpy>=1.26.4`.
4. Set `PATH=/opt/venv/bin:$PATH`, `VIRTUAL_ENV=/opt/venv`.
5. Download and run the vendor one-liner.
6. Capture: exit code, whether venv creation occurs, whether `/opt/venv` or `$HOME/.venv` contains `vnstock_data`.
7. Accept device-limit registration failure if it occurs; the target is venv-path behavior, not registration.
8. Audit temp files, remove container.

**Blocked actions:**
- Do NOT clear host device registration (would break `product/api` stack).
- Do NOT modify `product/api/scripts/install-vnstock.sh` unless venv-path hypothesis is confirmed.

**Expected artifacts:**
- `records/experiments/experiment-vnstock-install-prepared-substrate-<timestamp>.yaml`
- `records/evidence/vnstock-data/experiment-install-prepared-substrate-<timestamp>.md`

**Validation:** `pnpm validate:records && pnpm check`

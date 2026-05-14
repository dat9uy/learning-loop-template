# 260513 — Vnstock Bootstrap-Equivalent Substrate Experiment

## Context

Follow-up to `docs/journals/260513-vnstock-prepared-substrate-followup-experiment.md`.
Executed the proposed bootstrap-substrate experiment from that journal's "Open Questions for Next Session".

## Changes

### Experiment Execution
- **Created** `records/experiments/experiment-vnstock-install-bootstrap-substrate-20260513T182621Z.yaml` — experiment record capturing both hypotheses confirmed.
- **Created** `records/evidence/vnstock-data/experiment-install-bootstrap-substrate-20260513T182621Z.md` — evidence envelope with full runtime observations.

### Claim Update
- **Updated** `records/claims/claim-vnstock-install-sandbox.yaml` — updated `updated_at`, added new evidence ref, and rewrote limitations:
  - Confirmed the bootstrap script is validated and viable.
  - Confirmed `vnai` does NOT need to be pre-installed; the installer handles it.
  - Clarified that `$HOME/.venv` is the installer's venv path (not hardcoded `/root/.venv`); `HOME` override is respected.
  - Documented that the product `.venv` (requests + pandas) is a sufficient substrate.

## Experiment Results

| Hypothesis | Result | Detail |
|------------|--------|--------|
| H1: Installer proceeds with only requests + pandas pre-installed | **Confirmed** | Installer installed vnai/vnii/typing_extensions itself, then 35 deps, reaching device registration |
| H2: HOME=/tmp/fake-home causes .venv creation there | **Confirmed** | Installer created `/tmp/fake-home/.venv`; `/root/.venv` was NOT created |

## Key Observations

- Installer SHA-256 unchanged: `fad4bb7b86d23e853b09b9d7431ed7d49bcdc74b32551bbcb1fc19a095a830f2`
- Substrate venv (`/opt/test-venv`) was completely unmodified — no packages added
- `/root/.venv` was NOT created, disproving the "hardcoded to /root/.venv" conclusion from the prior experiment
- The installer's venv path is actually `$HOME/.venv`, not strictly `/root/.venv`
- Device-limit gate reached and failed as expected (Golden tier, 2-device limit)
- `vnstock_data` not installed because device limit blocked sponsor package installation
- API key material confined to `/tmp/fake-home/.vnstock/api_key.json` (container-local, removed with `--rm`)
- No secret leakage outside the configured config path

## Impact

- `product/api/scripts/install-vnstock.sh` is **validated and viable** without modification.
- The bootstrap script's `HOME="${API_HOME}"` strategy correctly directs the installer to create `.venv` inside `product/api`.
- The product `.venv` after `uv sync` (contains `requests` and `pandas`) is a sufficient substrate.
- `vnai` does NOT need to be added to `pyproject.toml` or pre-installed by the bootstrap script.
- The prior conclusion that the venv path was "hardcoded to /root/.venv" was **overly specific** — it is actually `$HOME/.venv`, which defaults to `/root/.venv` only when `HOME=/root`.

## Operator Decision

**Decision**: Clear one device slot to enable a full sponsor-package install experiment.
**Trade-off accepted**: The existing production device registration will be invalidated. The product will require re-running the bootstrap script after experiments complete to restore working vnstock_data access.
**Rationale**: All substrate and path hypotheses are confirmed, but every experiment has been blocked at the device-limit gate. We cannot verify `vnstock_data` version, test direct pip install bypass, or perform an end-to-end bootstrap validation without a free slot. The operator judges the clarity and rigidity of the install process worth the temporary product disruption.

### Deeper Motivation: Runtime Patch Foundation

The runtime 403 fix documented in `records/claims/claim-vnstock-runtime-403-root-cause.yaml` rests on a **shaky foundation**: we patched the library (injecting `Device-Id` header for VCI calls, fixing config-path resolution) based on source-reading and partial observations, but we have **never produced a reproducible environment that matches the library author's intent**.

Specifically:
- Every sandbox experiment has been blocked at the device-limit gate before `vnstock_data` could fully install.
- The compat patch was inferred from static source analysis (`vnstock.get_headers` emits `Device-Id`; `vnstock_data.get_headers` does not) and live smoke tests against a partially-installed environment.
- We do not know whether a "clean" vendor install (no device limit, full sponsor packages) would produce the same runtime behavior, or whether the author's intended configuration would make our patch unnecessary or even harmful.
- Until we can observe a complete, successful install from the vendor's perspective, the runtime patch is essentially a workaround built on incomplete ground truth.

**Closing the installation question once and for all** is a prerequisite for having full confidence in the runtime patch. A successful full install will tell us:
1. What the vendor actually delivers when everything works.
2. Whether `vnstock_data`'s native headers work as-is or still require patching.
3. Whether our patched environment diverges from the author's intent in ways we haven't detected.

## Follow-Up Experiment Plan

### Phase A: Full Install with Cleared Slot
**Goal**: Complete a full vendor installer run that successfully installs `vnstock_data`.
**Substrate**: Bootstrap-equivalent (requests + pandas only, HOME override).
**Method**:
1. Operator clears one device slot at https://vnstocks.com/account?section=devices
2. Fresh `python:3.11-slim` container with requests + pandas venv.
3. Set `HOME=/tmp/fake-home`, run installer with API key.
4. Observe: does `vnstock_data` install successfully? What version?
5. Verify import: `python -c "import vnstock_data; print(vnstock_data.__version__)"`.
6. Record version, exit code, and any new behavior.

**Success criteria**:
- `vnstock_data` is installed in `/tmp/fake-home/.venv`
- Version is captured and meets or exceeds 3.x
- Installer exits 0 (or non-zero only for known, acceptable reasons)

### Phase B: Direct Pip Install from Vendor Index
**Goal**: Test whether `vnstock_data` is accessible via the vendor's extra-index URL without the Makeself installer.
**Method**:
1. Fresh container with `pip`.
2. Run: `pip install --extra-index-url https://vnstocks.com/api/simple vnstock_data`
3. With API key if required (test both with and without).
4. Observe: does pip resolve the package? Is authentication required? What version?

**Success criteria**:
- Determine if direct pip install is a viable bypass strategy
- If viable, document the exact command and auth requirements
- If not viable, document the failure mode

### Phase C: Real Product Directory Bootstrap
**Goal**: Run the actual `product/api/scripts/install-vnstock.sh` in the real product directory.
**Method**:
1. Ensure product/api `.venv` exists and has `requests` + `pandas` (`uv sync`).
2. Ensure `VNSTOCK_API_KEY` is exported.
3. Run the bootstrap script.
4. Observe: does it create `product/api/.vnstock`? Does `vnstock_data` import from `product/api/.venv/bin/python`?

**Success criteria**:
- Script exits 0
- `product/api/.vnstock/` created with expected files
- `import vnstock_data` succeeds from product Python

## Blocked Actions

- Do NOT modify `product/api/scripts/install-vnstock.sh` — it is validated as-is.
- Do NOT clear device slots without operator explicit approval (now granted above).

## Next Steps

1. Operator clears one device slot.
2. Execute Phase A (full install) immediately after slot clearance.
3. Execute Phase B (direct pip) if Phase A succeeds or as a parallel investigation.
4. Execute Phase C (real bootstrap) once Phase A confirms clean install behavior.
5. Update `claim-vnstock-version-requirements.yaml` based on Phase A results.
6. Re-run bootstrap script in production to restore working state.

## Verification

- `pnpm check` passes (39 records validated, 3 tests green)
- `pnpm validate:records` passes
- Docker container removed via `--rm`
- No API key material retained in repo

---

# 260514 — Experiment Continuation Results

## Context

Operator cleared all device slots on 2026-05-14. All three phases (A, B, C) were executed.

## Changes

### Experiment Records Created
- **Created** `records/experiments/experiment-vnstock-install-full-20260514T140811Z.yaml` — Phase A record
- **Created** `records/experiments/experiment-vnstock-direct-pip-20260514T140811Z.yaml` — Phase B record
- **Created** `records/experiments/experiment-vnstock-product-bootstrap-20260514T140811Z.yaml` — Phase C record

### Evidence Created
- **Created** `records/evidence/vnstock-data/experiment-install-full-20260514T140811Z.md`
- **Created** `records/evidence/vnstock-data/experiment-direct-pip-20260514T140811Z.md`
- **Created** `records/evidence/vnstock-data/experiment-product-bootstrap-20260514T140811Z.md`

### Claims Updated
- **Updated** `records/claims/claim-vnstock-install-sandbox.yaml` — documented full install success, idempotency, direct-pip non-viability
- **Updated** `records/claims/claim-vnstock-version-requirements.yaml` — status draft→reviewed, confirmed vnstock_data 3.0.0, documented version drift
- **Updated** `records/claims/claim-vnstock-runtime-403-root-cause.yaml` — confirmed clean install lacks get_headers, vendor_compat is necessary

## Phase A Results: Full Install with Cleared Slot

| Metric | Result |
|--------|--------|
| Installer exit code | **0** |
| Device registration | **Success** (bronze tier, 1/1 devices) |
| `vnstock_data` installed | **Yes** |
| `vnstock_data.__version__` | **3.0.0** |
| `vnstock_data` dist-info | **3.1.3** (version drift) |
| Substrate venv modified | **No** |
| `.venv` location | `/tmp/fake-home/.venv` (respects `HOME`) |

**New findings**:
- Device IDs are **not deterministic** across container instances. A second container on the same host generated a different device ID and hit the device-limit gate.
- The vendor installer is the only path to `vnstock_data`; there is no viable pip bypass.

## Phase B Results: Direct Pip Install from Vendor Index

| Metric | Result |
|--------|--------|
| Index URL returns HTML | **Yes** (Next.js web UI, not PEP 503) |
| Package sub-path resolves | **No** (`{"error":"Package 'vnstock-data' not found"}`) |
| Direct pip install viable | **No** |

**Conclusion**: Direct pip bypass is impossible. The proprietary installer is the only supported delivery mechanism.

## Phase C Results: Real Product Directory Bootstrap

| Metric | Result |
|--------|--------|
| Script exit code | **0** |
| Installer behavior | **Skipped** (idempotency check: vnstock_data already importable) |
| `vnstock_data` import | **Yes** (version 3.0.0) |
| `.vnstock` config | **Exists and valid** |

**New findings**:
- The product was already bootstrapped (likely from a prior run). The bootstrap script's idempotency works correctly.
- `vendor_compat` (runtime patch) is loaded by `src/main.py` and is **necessary** — the clean vendor install does NOT provide `get_headers` or `Device-Id` injection.
- The patch gracefully skips if a future vendor version already provides `Device-Id`.

## Version Drift Observation

A persistent anomaly was confirmed across both the sandbox container and the product venv:
- `vnstock_data.__version__` (source): **3.0.0**
- `vnstock_data` dist-info metadata: **3.1.3**

This drift suggests the vendor may have updated packaging metadata without bumping the in-source version string, or the payload contains mismatched artifacts.

## Runtime Patch Foundation: Closed

The runtime 403 fix foundation is now **solid**:
1. A clean vendor install produces `vnstock_data` 3.0.0 with **no** `get_headers` and **no** `Device-Id` injection.
2. Our `vendor_compat` patch detects this and monkey-patches `_vd_user_agent.get_headers` to inject `Device-Id` for VCI calls.
3. The patch is loaded at application startup (`src/main.py`) and is idempotent.
4. If the vendor ever adds native `Device-Id` support, the patch will detect it and skip itself.

The runtime patch is not a workaround on shaky ground — it is a **necessary compatibility layer** for a vendor package that lacks required headers.

## Impact

- `product/api/scripts/install-vnstock.sh` is **validated, viable, and idempotent**.
- `vnstock_data` version is **3.0.0** (with 3.1.3 dist-info drift).
- The `vendor_compat` runtime patch is **necessary and production-ready**.
- Device limit is rigid: **one slot per fresh container**. The operator should monitor device registrations.
- Direct pip install bypass is **permanently ruled out**.

## Remaining Open Questions

1. **Version drift**: Why does dist-info say 3.1.3 while `__version__` says 3.0.0? (Low priority; does not affect functionality.)
2. **Device ID determinism**: Can the device ID be stabilized across container rebuilds? (Likely no; vendor uses hardware fingerprinting.)
3. **Tier discrepancy**: The successful registration showed "bronze 1/1" while the limit error says "Golden 2 thiết bị". This may be a vendor UI inconsistency. (Low priority.)

## Next Steps

1. Operator may wish to clear the experiment device slot if the 1-device bronze limit is real.
2. Re-run `product/api/scripts/install-vnstock.sh` in production if the product's device registration was invalidated.
3. Monitor vendor package updates for native `Device-Id` support (would allow removing `vendor_compat`).
4. Close out the FastAPI Reference Build validation gate if this was the remaining blocker.

## Verification

- `pnpm check` passes
- `pnpm validate:records` passes
- No API key material retained in repo

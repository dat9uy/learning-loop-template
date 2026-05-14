# 260514 — Vnstock Experiment Meta-Reflection: A Six-Day Arc from Mystery to Ground Truth

## Context

This journal synthesizes the complete experiment history for vnstock_data installation, runtime behavior, and product integration across 8 journals, 12 experiment records, 15 evidence files, 4 claims, and 3 decisions (May 8–14, 2026). The purpose is to extract the narrative arc, surface the dead ends that consumed time, and document the ground-truth findings that replaced prior assumptions.

---

## Phase 1: The Installer Mystery (May 8)

**Starting state**: We knew vnstock_data existed, was sponsor-tier, and required an API key. We did not know the install mechanism, the archive format, or the auth flow.

**First experiment** (experiment-vnstock-install-20260508T101723Z): Downloaded the vendor artifact and discovered it was a Makeself archive. Prior assumption (reading ~/.vnstock/user.json for API key) was falsified — the installer reads VNSTOCK_API_KEY from environment.

**Second experiment** (experiment-vnstock-install-20260508T171112Z): Confirmed env-var auth works, but hit the device-limit gate before vnstock_data could install. This pattern — reach auth, fail at device limit — would repeat for every sandbox experiment until May 14.

**Key dead end**: The prior notes claimed the installer read ~/.vnstock/user.json. This was empirically superseded by env-var behavior, but the old note was not removed immediately, creating confusion for subsequent agents.

---

## Phase 2: Record Layer + Capability Runtime (May 9–10)

**Device-limit decision** (decision-20260509T070411Z): Operator must clear stale devices externally. Agent cannot log into vendor account. This established the boundary that all subsequent experiments inherited.

**Capability runtime experiment** (experiment-vnstock-capabilities-20260509T174957Z): First time vnstock_data actually executed live API calls. Five capability scripts ran successfully against Reference, Market, Fundamental, Insights, and Macro surfaces. This proved the package could work — but only in the existing product venv, which had been set up by unknown means.

**Version anomaly first observed**: vnstock_data.__version__ reported 3.0.0 while dist-info metadata reported 3.1.7 (later 3.1.3). This drift was noted but not explained. It remains unexplained today.

---

## Phase 3: Bootstrap Architecture (May 10–11)

**The two-stage bootstrap decision** (decision-20260510T170623Z): Resolved a fundamental design tension. vnstock_data is not a wheel; uv cannot resolve it. The solution: Stage 1 (uv sync for public deps: requests, pandas) + Stage 2 (vendor Makeself installer with SHA-256 verification). The bootstrap script sets HOME=product/api so the installer creates .venv inside the product directory.

**Runtime 403 blocker** (experiment-vnstock-runtime-403-fix-20260511T143500Z): The FastAPI Reference Build failed at runtime. Root cause analysis revealed two independent bugs:
1. Wrapper VNSTOCK_CONFIG_PATH pointed one segment too deep (/.vnstock/user.json instead of /.vnstock)
2. vnstock_data VCI headers lacked Device-Id, causing 403 rejections from VietCap

**The compat patch** (product/api/src/vendor_compat/vnstock_device_id.py): A monkey-patch that injects Device-Id for VCI calls when the vendor package does not. Critically, it gracefully skips if a future vendor version already provides the header. This patch was inferred from static source analysis and verified with live smoke tests.

**Key assumption at the time**: The patch was built on incomplete ground truth because no clean vendor install had ever been observed (every install blocked at device limit).

---

## Phase 4: Substrate Archaeology (May 13)

**Prepared substrate experiment** (experiment-vnstock-install-prepared-substrate-20260513T173104Z): Tested whether the vendor one-liner works when requests, vnai, pandas, and numpy are pre-installed. Confirmed — the installer proceeds. But the venv-path hypothesis was contradicted: the installer unconditionally creates /root/.venv and ignores pre-created /opt/venv.

**Bootstrap-equivalent substrate experiment** (experiment-vnstock-install-bootstrap-substrate-20260513T182621Z): Tested whether requests + pandas alone (matching the actual product .venv) is sufficient. Confirmed — the installer installs vnai and vnii itself. Tested HOME=/tmp/fake-home. Confirmed — .venv is created at $HOME/.venv, not hardcoded to /root/.venv.

**Vendor one-liner experiment** (experiment-vnstock-install-vendor-one-liner-20260513T213042Z): Disproved the vendor troubleshooting guide's one-liner for fresh sandboxes. The one-liner requires requests in the system Python (undocumented prerequisite).

**Open questions crystallized**:
1. Does the installer need vnai pre-installed? -> No (answered May 14)
2. Does HOME override work for non-root dirs? -> Yes (answered May 14)
3. Is direct pip install viable? -> No (answered May 14)

---

## Phase 5: Ground Truth (May 14)

**Phase A — Full install with cleared slot** (experiment-vnstock-install-full-20260514T140811Z): For the first time, a complete vendor installer run succeeded. vnstock_data version 3.0.0 installed. Installer exited 0. Device registered (bronze, 1/1).

**Critical finding**: The clean vendor install does NOT provide get_headers or Device-Id injection. The vendor_compat patch is necessary, not a workaround. This closed the foundational uncertainty from May 11.

**Device ID stability test**: A second container on the same host generated a different device ID and hit the device limit. Device IDs are not deterministic across container instances.

**Phase B — Direct pip install** (experiment-vnstock-direct-pip-20260514T140811Z): The vendor's https://vnstocks.com/api/simple is a Next.js web UI, not a PEP 503 package index. Direct pip bypass is permanently ruled out.

**Phase C — Product bootstrap** (experiment-vnstock-product-bootstrap-20260514T140811Z): The actual bootstrap script correctly detects the existing installation and skips. The product is already bootstrapped and functional.

**SHA-256 drift discovered**: The bootstrap script's pinned SHA-256 (1982f7f9...) did not match the current installer (fad4bb7b...). The vendor updated the installer between May 11 and May 14. The script was updated to the current hash.

**Forced re-registration attempt**: Attempted to force a fresh device registration by making vnstock_data temporarily unimportable. The vendor installer's internal dependency-install timeout (at step 4/6) fired before completion when installing into the existing large venv. Fresh venvs work; existing venvs timeout. The product was restored from the renamed package directory.

---

## What We Thought vs. What Is True

| Assumption | Truth |
|------------|-------|
| Installer reads ~/.vnstock/user.json for API key | Reads VNSTOCK_API_KEY env var |
| Installer hardcodes /root/.venv | Respects $HOME/.venv |
| vnai must be pre-installed in substrate | Installer handles it; requests + pandas sufficient |
| Direct pip install from vendor index is viable | Index is HTML web UI, not PEP 503 |
| vendor_compat patch is a workaround on shaky ground | Patch is necessary; clean install lacks Device-Id |
| Device IDs are stable across containers | Not deterministic; each fresh container consumes a slot |
| vnstock_data version is 3.1.3 (dist-info) | Source __version__ is 3.0.0; drift unexplained |
| Bootstrap script SHA-256 is current | Vendor rotated installer; SHA was stale |

---

## Dead Ends That Cost Time

1. The ~/.vnstock/user.json red herring: Prior notes claimed the installer read API key from a config file. Multiple experiments were designed around this false assumption before the env-var behavior was confirmed.

2. The /opt/venv hypothesis: The vendor Dockerfile sample implies pre-created venvs are respected. Two experiments disproved this. The installer always creates $HOME/.venv.

3. The vendor one-liner for fresh sandboxes: The vendor troubleshooting guide advertises a one-liner that fails in fresh containers because it omits the requests prerequisite.

4. The Golden tier confusion: The device-limit error says Gói Golden... 2 thiết bị but successful registrations show bronze 1/1. Tier messaging is inconsistent or cached.

5. Forced re-registration via bootstrap: Attempting to force a reinstall in the product venv hit the vendor installer's internal timeout. This approach does not work for existing venvs.

---

## The State Problem

The user released all devices in the web UI, yet API calls from the product venv still succeed. Possible explanations:

- Vendor API backend has a cache lag relative to the web UI
- The equity.list() endpoint does not strictly validate device ID
- The auth_state local cache (60 min TTL) masks invalidation
- The device was never actually in the web UI's deletion set

Attempted resolution: Forced re-registration by renaming vnstock_data and running the bootstrap script. Blocked by vendor installer timeout. Product restored to functional state with old device ID.

---

## Current Architecture

product/api/
  .venv/                          # uv-managed; requests, pandas, fastapi, etc.
    lib/python3.12/site-packages/
      vnstock/                    # free package (4.0.2)
      vnstock_data/               # sponsor package (3.0.0 source, 3.1.3 dist-info)
      vnai/                       # installed by vendor installer
      vnii/                       # installed by vendor installer
  .vnstock/                       # vendor config
    device.id                     # hardware fingerprint
    api_key.json                  # API key (written by installer)
    user.json                     # device registration metadata
    auth_state.json               # local auth cache (60 min TTL)
  src/vendor_compat/
    vnstock_device_id.py          # runtime patch: injects Device-Id for VCI
  scripts/install-vnstock.sh      # bootstrap script (SHA-256 pinned)
  capabilities/vnstock-data/      # capability runtime scripts

---

## Remaining Open Questions

1. Version drift: Why does dist-info say 3.1.3 while __version__ says 3.0.0? (Low priority — does not affect functionality.)
2. Tier discrepancy: Why does the limit error say Golden 2 while registration shows bronze 1/1? (Likely vendor UI inconsistency.)
3. Device invalidation lag: How long does the vendor API cache device validity after web UI release? (Operational risk, not experimental.)
4. Installer timeout in existing venvs: Why does the vendor installer timeout when installing into existing venvs but succeed in fresh ones? (Vendor-side behavior, not controllable.)

---

## What an Agent Should Know

- product/api/scripts/install-vnstock.sh is the only viable install path.
- The script is idempotent — safe to run multiple times.
- The script requires VNSTOCK_API_KEY in environment.
- The script's SHA-256 pin may drift if the vendor updates the installer. Check before running.
- vendor_compat is load-bearing — do not remove it.
- Device slots are consumed per unique container/hardware fingerprint.
- pnpm bootstrap:api chains uv sync + the bootstrap script.

---

## Source

- Journals: docs/journals/260508-vnstock-install-blocked-experiment.md through docs/journals/260513-vnstock-bootstrap-substrate-experiment.md
- Experiments: records/experiments/experiment-vnstock-install-* (8 install records) + experiment-vnstock-runtime-403-fix-* + experiment-vnstock-capabilities-* + experiment-vnstock-direct-pip-* + experiment-vnstock-product-bootstrap-*
- Evidence: records/evidence/vnstock-data/* (15 files)
- Claims: records/claims/claim-vnstock-{install-sandbox,device-limit-mechanism,runtime-403-root-cause,version-requirements}.yaml
- Decisions: records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml, decision-20260510T170623Z-vnstock-installer-bootstrap.yaml, decision-20260511T003000Z-product-approval-vnstock-reference-slice.yaml

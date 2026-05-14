# 260514 — Vnstock Experiment Meta-Reflection: A Six-Day Arc from Mystery to Ground Truth

## Context

This journal synthesizes the complete experiment history for vnstock_data installation, runtime behavior, and product integration across 8 journals, 13 experiment records, 16 evidence files, 5 claims, and 3 decisions (May 8–15, 2026). The purpose is to extract the narrative arc, surface the dead ends that consumed time, and document the ground-truth findings that replaced prior assumptions.

**CRITICAL CORRECTION (2026-05-15):** The vendor installer's error message has been a source of confusion since day one. The message claims "Gói Golden... 2 thiết bị mỗi hệ điều hành" (Golden package, 2 devices per OS). This is **false**. The actual account tier is **Bronze** with a **1-device limit**. Every experiment that hit the device-limit gate was hitting a 1-device ceiling, not 2. The vendor mislabels the tier in the installer message. See `claim-vnstock-device-limit-ui-inconsistency` for the verified claim.

---

## Phase 1: The Installer Mystery (May 8)

**Starting state**: We knew vnstock_data existed, was sponsor-tier, and required an API key. We did not know the install mechanism, the archive format, or the auth flow.

**First experiment** (experiment-vnstock-install-20260508T101723Z): Downloaded the vendor artifact and discovered it was a Makeself archive. Prior assumption (reading ~/.vnstock/user.json for API key) was falsified — the installer reads VNSTOCK_API_KEY from environment.

**Second experiment** (experiment-vnstock-install-20260508T171112Z): Confirmed env-var auth works, but hit the device-limit gate before vnstock_data could install. This pattern — reach auth, fail at device limit — would repeat for every sandbox experiment until May 14.

> **Retrospective note**: The device-limit message said "Golden... 2 devices". We now know the actual limit was 1 (Bronze) all along. The message was a red herring that caused us to search for a second invisible device that never existed.

**Key dead end**: The prior notes claimed the installer read API key from ~/.vnstock/user.json. This was empirically superseded by env-var behavior, but the old note was not removed immediately, creating confusion for subsequent agents.

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

> **Retrospective note**: Both experiments hit device limit and reported "Golden... 2 devices". We now know they hit the Bronze 1-device limit. The message was false then and is false now.

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

> **Retrospective note**: The second container hit the 1-device Bronze limit, not a 2-device Golden limit. The message has always been wrong.

**Phase B — Direct pip install** (experiment-vnstock-direct-pip-20260514T140811Z): The vendor's https://vnstocks.com/api/simple is a Next.js web UI, not a PEP 503 package index. Direct pip bypass is permanently ruled out.

**Phase C — Product bootstrap** (experiment-vnstock-product-bootstrap-20260514T140811Z): The actual bootstrap script correctly detects the existing installation and skips. The product is already bootstrapped and functional.

**SHA-256 drift discovered**: The bootstrap script's pinned SHA-256 (1982f7f9...) did not match the current installer (fad4bb7b...). The vendor updated the installer between May 11 and May 14. The script was updated to the current hash.

**Forced re-registration attempt**: Attempted to force a fresh device registration by making vnstock_data temporarily unimportable. The vendor installer's internal dependency-install timeout (at step 4/6) fired before completion when installing into the existing large venv. Fresh venvs work; existing venvs timeout. The product was restored from the renamed package directory.

---

## Phase 6: The Vendor Message Lie Revealed (May 15)

**Bootstrap critique re-run** (experiment-vnstock-bootstrap-critique-rerun-20260514T171316Z): After operator cleared all device slots, the current bootstrap script was re-run in a clean sandbox. The installer proceeded through steps 2-5 successfully (31 dependencies installed, API authenticated), then failed at step 6 with device limit exceeded.

**The web UI showed exactly 1 device** — the one created by this experiment. The vendor message still claimed "Golden... 2 devices".

**Operator insight**: The actual tier is **Bronze (limit 1)**, not Golden (limit 2). The vendor installer message is false.

**Asymmetric failure semantics**: Device **registration succeeds** before the sponsor package download is attempted. The vendor server accepts the new device (visible in UI). What "fails" is only the vnstock_data download. From the vendor's perspective, the device registration was successful; only the package install hit the block.

**Implication**: Every run that reaches step 6 **consumes a device slot**, regardless of final exit code. A "failed" install still costs a slot.

---

## What We Thought vs. What Is True

| Assumption | Truth |
|---|---|
| Installer reads ~/.vnstock/user.json for API key | Reads VNSTOCK_API_KEY env var |
| Installer hardcodes /root/.venv | Respects $HOME/.venv |
| vnai must be pre-installed in substrate | Installer handles it; requests + pandas sufficient |
| Direct pip install from vendor index is viable | Index is HTML web UI, not PEP 503 |
| vendor_compat patch is a workaround on shaky ground | Patch is necessary; clean install lacks Device-Id |
| Device IDs are stable across containers | Not deterministic; each fresh container consumes a slot |
| vnstock_data version is 3.1.3 (dist-info) | Source __version__ is 3.0.0; drift unexplained |
| Bootstrap script SHA-256 is current | Vendor rotated installer; SHA was stale |
| Device limit is 2 (Golden tier) | **Actual limit is 1 (Bronze tier)** — vendor message is false |
| "Failed" install does not consume a slot | **Device registration succeeds before failure; slot is consumed** |
| Cleared devices are permanently deleted | **Vendor clear is a soft delete; re-auth restores hidden devices** |

---

## Dead Ends That Cost Time

1. The ~/.vnstock/user.json red herring: Prior notes claimed the installer read API key from a config file. Multiple experiments were designed around this false assumption before the env-var behavior was confirmed.

2. The /opt/venv hypothesis: The vendor Dockerfile sample implies pre-created venvs are respected. Two experiments disproved this. The installer always creates $HOME/.venv.

3. The vendor one-liner for fresh sandboxes: The vendor troubleshooting guide advertises a one-liner that fails in fresh containers because it omits the requests prerequisite.

4. **The Golden tier confusion (MAJOR)**: The device-limit error says "Gói Golden... 2 thiết bị" but successful registrations show bronze 1/1. We spent sessions searching for invisible devices, backup/restore ghosts, and cache lags. The truth is simpler: **the vendor message lies**. The actual tier is Bronze with limit 1. Every device-limit hit was the 1-device ceiling, not a mystery second device.

5. Forced re-registration via bootstrap: Attempting to force a reinstall in the product venv hit the vendor installer's internal timeout. This approach does not work for existing venvs.

---

## Current Architecture

```
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
  scripts/install-vnstock.sh      # bootstrap script (SHA-256 pinned, rewritten with atomicity guard, slot warnings, and --force/--check-device flags)
  capabilities/vnstock-data/      # capability runtime scripts
```

---

## Remaining Open Questions

1. Version drift: Why does dist-info say 3.1.3 while __version__ says 3.0.0? (Low priority — does not affect functionality.)
2. Vendor message lie: Why does the installer claim "Golden 2" when the account is Bronze 1? (Vendor bug/misconfiguration; not actionable by us.)
3. Device invalidation lag: How long does the vendor API cache device validity after web UI release? (Operational risk, not experimental.)
4. Installer timeout in existing venvs: Why does the vendor installer timeout when installing into existing venvs but succeed in fresh ones? (Vendor-side behavior, not controllable.)
5. **Device reactivation via import (NEW 2026-05-15)**: Does deleting `auth_state.json` prevent restoration of cleared devices? Does the vendor use fingerprint alone or a token exchange? (High priority for Phase 2 error-path testing.)

---

## What an Agent Should Know

- **Actual device limit: 1 (Bronze tier)**. The vendor message saying "Golden, 2 devices" is false.
- **Every install attempt that reaches step 6 consumes a slot**, even if it reports "failure".
- **Cleared devices are soft-deleted on the vendor backend. Re-authentication (e.g., `import vnstock_data` with expired auth cache) restores them to the visible dashboard.** After operator clears devices, avoid ANY host-side import of vnstock_data until the sacred production install.
- product/api/scripts/install-vnstock.sh is the only viable install path. It was rewritten defensively on 2026-05-15 with atomicity guards, slot warnings, and pre/post-flight checks, but vendor device-limit semantics remain outside our control.
- The script is idempotent by default — safe to run multiple times ONLY when vnstock_data is already importable. Use `--force` to re-register (invalidates any previous device).
- The script requires VNSTOCK_API_KEY in environment.
- The script's SHA-256 pin may drift if the vendor updates the installer. Check before running.
- vendor_compat is load-bearing — do not remove it.
- Device slots are consumed per unique container/hardware fingerprint.
- pnpm bootstrap:api chains uv sync + the bootstrap script.
- **Do not trust the vendor's device-limit message. Trust the web UI count and treat 1 as the limit.**

---

## Source

- Journals: docs/journals/260508-vnstock-install-blocked-experiment.md through docs/journals/260514-vnstock-bootstrap-script-critique-session.md
- Experiments: records/experiments/experiment-vnstock-install-* (8 install records) + experiment-vnstock-runtime-403-fix-* + experiment-vnstock-capabilities-* + experiment-vnstock-direct-pip-* + experiment-vnstock-product-bootstrap-* + experiment-vnstock-bootstrap-critique-rerun-*
- Evidence: records/evidence/vnstock-data/* (16 files)
- Claims: records/claims/claim-vnstock-{install-sandbox,device-limit-mechanism,runtime-403-root-cause,version-requirements,device-limit-ui-inconsistency}.yaml
- Decisions: records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml, decision-20260510T170623Z-vnstock-installer-bootstrap.yaml, decision-20260511T003000Z-product-approval-vnstock-reference-slice.yaml

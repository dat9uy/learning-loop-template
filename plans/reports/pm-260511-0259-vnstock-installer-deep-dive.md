---
title: "vnstock Installer Deep-Dive — Findings & Install-Strategy Decision Frame"
created: "2026-05-11T02:59:00+07:00"
parent_report: "plans/reports/pm-260511-0224-fastapi-reference-runtime-blocker-diagnostic.md"
reference_doc: "docs/vendor-vnstock-installer.md"
superseded_by: "plans/reports/pm-260511-0341-vnstock-source-read-findings.md"
status: superseded
plan: "plans/260511-0030-fastapi-reference-build/plan.md"
---

# vnstock Installer Deep-Dive — Findings & Install-Strategy Decision Frame

> **Update 2026-05-11 03:41** — Source-read of the venv revised this further. The 403 root cause is NOT the URL (no trailing slash exists in source) but a missing `Device-Id` header in `vnstock_data.get_headers`. The "dir-vs-file contract mismatch" is wrapper-side only (runtime does not read `VNSTOCK_CONFIG_PATH`). See `plans/reports/pm-260511-0341-vnstock-source-read-findings.md` and `records/claims/claim-vnstock-runtime-403-root-cause.yaml` for the corrected analysis.

Follow-up to the FastAPI reference runtime-blocker diagnostic. Per session direction: stop treating the vendor installer as a blackbox, document behavior, then choose strategy. No re-install or network fetch performed; analysis reads existing logs and on-disk artifacts only.

## What the Prior Diagnostic Got Right / Wrong

| Claim in prior report | Verdict | Note |
|---|---|---|
| `vnstock_data` 3.1.7 vs 3.1.3 is packaging drift, not root cause | **right** | dist-info `3.1.3`, tarball name `3.1.7`; vendor build mismatch |
| Double-slash URL → 403 is the runtime blocker | **right** | bug spans `vnstock/explorer/vci/const.py` + `vnstock_data/explorer/vci/listing.py` |
| `VNSTOCK_CONFIG_PATH` directory/file confusion exists | **right** | confirmed bidirectional contract mismatch |
| Recommended fixes A–D as parallel choices | **partially wrong** | A & D address installer hygiene; only patching vendor source (or pivoting source) addresses the 403 |
| "Installation reports success anyway" framed as informational | **understated** | this is bug E — the installer's exit code is unreliable evidence of working state |

## New Findings

1. **Two-stage architecture confirmed.** Outer `cli_installer.log` is a wrapper summary; inner `vnstock_installer.log` carries the install-time trace. Operators reading only the outer log will miss the import-fail warning.
2. **Bug E (deceptive success).** Inner installer logs `vnstock_data import check failed (may work in practice)` immediately followed by `Installation completed: 1 successful, 0 failed`. Exit code is 0. Our wrapper's secondary `import vnstock_data` check is load-bearing; without it CI passes on a broken venv.
3. **Slot enforcement is not strict.** Three captured runs report `devices=0/1`, `2/1`, `0/1`. Bronze tier nominally allows 1 device but the server tolerated `2/1`. Prior "1 install ≈ 1 slot" guidance can be relaxed.
4. **`normalize_vnstock_config` is incomplete.** It relocates only `user.json`; orphans `api_key.json`, `device.id`, `user_install.json`, `vnstock_installer.log` inside the backup directory. Runtime impact of the orphans is unverified.
5. **Runtime files self-materialise.** `id/`, `data/`, `config/` directories under `.vnstock/` appear at first runtime import (timestamps 02:55–02:56) and do not depend on the installer. A no-installer bootstrap is feasible for these.
6. **Tarball is byte-identical across runs.** 223,312 bytes for all three captured downloads; vendor is not pushing fresh builds between our installs.

## Why "Change How We Install" Is the Wrong First Move

| What user wants to fix | Will install-method change fix it? |
|---|---|
| `VNSTOCK_CONFIG_PATH` dir/file confusion (A + B) | Partial — we'd write the file form, runtime would be happy, but vendor would push the dir form back on next install |
| Runtime 403 from URL double-slash (C) | **No** — bug is in vendor runtime source, not install path |
| Tarball/metadata version drift (D) | Only by pinning a known-good tarball, which forks us from vendor updates |
| Deceptive installer success (E) | No — wrapper compensates already |

The installer is real tech debt and worth documenting (now done in `docs/vendor-vnstock-installer.md`), but the **active blocker** is independent. Spending engineering on a new install path before the runtime fix optimises the wrong variable.

## Install-Strategy Options (Cost / Risk / What It Buys)

| Option | Effort | Risk | Solves runtime 403? |
|---|---|---|---|
| **Keep wrapper, extend `normalize_vnstock_config`** to also relocate `api_key.json` + `device.id` | S | low | no |
| **Add post-install patcher** that rewrites `vnstock/explorer/vci/const.py` (strip trailing slash from `_TRADING_URL`) | S | medium (fragile on reinstall, breaks SHA hygiene of vendor venv) | **yes** |
| **Replace installer**: direct-tarball install with manual device-register call | M | medium (needs reverse-engineering the auth flow) | no |
| **Skip installer, vendor `vnstock_data` tarball in repo** | M | high (T&C, freshness loss) | no |
| **Drop `vnstock_data`**, use `vnstock` PyPI direct or alt-source (TCBS, HOSE) | L | high (rewrites capability scope) | yes if alt-source avoids VCI |

Minimum-cost path that clears the blocker: **post-install patcher targeting the URL bug**, paired with existing wrapper. The wrapper handles installer hygiene; the patcher handles the runtime defect. Two small modifications, both reversible.

## Recommended Next Actions

1. **Extend `normalize_vnstock_config`** in `product/api/scripts/install-vnstock.sh` to relocate `api_key.json` and `device.id` (no functional confirmation yet that runtime needs them; relocate as defence-in-depth).
2. **Add a `patch_vnstock_runtime()`** step at end of the installer wrapper that strips trailing slash from `_TRADING_URL` in the venv-installed `vnstock` package. Idempotent. Verifies it's the expected string before patching; fails loudly otherwise.
3. **Add a smoke test** that calls the VietCap symbol list and asserts JSON (not HTML 403) — runs at end of `pnpm bootstrap:api`. This is the regression detector for the next vendor change.
4. **Do not pursue installer replacement** until items 1–3 are validated insufficient.
5. **Update the runtime-blocker diagnostic** to point at this report and the reference doc.

## Unresolved Questions

1. Does runtime require the orphaned `api_key.json` / `device.id` files at the post-normalise path? Source-read of `vnstock_data` would confirm; if so, action #1 becomes mandatory.
2. Has the VCI server change that introduced the 403 also affected other endpoints `vnstock_data` calls? A second smoke test per endpoint family may be warranted.
3. Vendor's response cycle: if we file the URL bug upstream, what's the expected turnaround? Worth a probe before committing to a permanent patch.
4. Does the runtime-created `data/usage_metrics.json` phone home? Should be inspected before declaring the install reproducible offline.

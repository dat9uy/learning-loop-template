---
title: "Vendor vnstock Installer — Behavior Reference"
status: reference
last_observed: "2026-05-15"
source_logs:
  - product/api/.vnstock/cli_installer.log
  - product/api/.vnstock/user-json-dir.backup.20260511025552/vnstock_installer.log
  - product/api/.vnstock/user-json-dir.backup.20260511025552/user_install.json
source_reads:
  - venv:vnstock_data 3.1.3 (dist-info)
  - venv:vnstock 4.0.2
  - venv:vnai
related:
  - records/claims/claim-vnstock-runtime-403-root-cause.yaml
  - plans/reports/pm-260511-0259-vnstock-installer-deep-dive.md
scope: "Observable behavior of `vnstock-cli-installer.run` as invoked by `product/api/scripts/install-vnstock.sh`. Reconstructed from installer logs + source-read of the installed packages."
---

# Vendor vnstock Installer — Behavior Reference

Reference for operators and future debug sessions. The vendor `vnstock-cli-installer.run` is a private bash self-extractor that bootstraps `vnstock_data` (not on PyPI) into `product/api/.venv`. This doc describes what it does, what contracts it assumes, what is broken, and what changing the install would/would not fix.

> **Revised bottom line (2026-05-11, post source-read).** The blocker had TWO independent causes, both narrower than the prior diagnostic claimed:
> 1. **Runtime 403** — `vnstock_data`'s `get_headers` for VCI does NOT inject the `Device-Id` header / `device_id` cookie that VietCap now enforces. `vnstock` (PyPI) DOES inject them. The "URL trailing-slash bug" claim in the original diagnostic is **false** — source shows `_TRADING_URL = '…/api'` with no trailing slash.
> 2. **IsADirectoryError on import** — caused by **our wrapper** setting `VNSTOCK_CONFIG_PATH=${API_HOME}/.vnstock/user.json` when the installer treats this env var as the directory to write into. Setting it to `${API_HOME}/.vnstock` (no `/user.json` suffix) lines the installer's output paths up with what the runtime expects via `Path.home()/'.vnstock'/'user.json'`.
> Both causes were fixed in the 2026-05-11 runtime blocker repair. See `records/claims/claim-vnstock-runtime-403-root-cause.yaml` and `records/evidence/vnstock-data/runtime-403-fix-20260511.md`.

## Two-Stage Architecture

| Stage | Artifact | Source | Role |
|---|---|---|---|
| Outer | `vnstock-cli-installer.run` | `https://vnstocks.com/files/...` (SHA-pinned) | Self-extracts to `/tmp/tmp.*/`, fetches 35-line requirements list, ensures deps, invokes inner |
| Inner | `vnstock-installer.py` | Bundled inside the .run | Authenticates, registers device, fetches private package tarballs, runs `pip install`, writes config |

The outer wrapper writes `cli_installer.log` (4-line summary per run). The inner writer produces `vnstock_installer.log` (~5KB per run; full DEBUG trace).

## Inner Stage — Behavior Walkthrough

Observed sequence (3 captured runs, identical structure):

1. Python ≥ 3.12 check.
2. Detect existing venv at `$VIRTUAL_ENV` (our wrapper sets this).
3. Write `${VNSTOCK_CONFIG_PATH}/api_key.json` ← **treats env var as directory**.
4. Re-import critical packages (`vnai`, `vnii`) from venv.
5. Read or create cached `device_id` from `${VNSTOCK_CONFIG_PATH}/device.id` (or vnai equivalent).
6. POST registration to vendor licence server. Payload includes `api_key`, `device_id`, host info.
7. Server returns `tier=bronze, devices=N/1`. Bronze tier ⇒ 1 package accessible (`vnstock_data` only).
8. Write `${VNSTOCK_CONFIG_PATH}/user_install.json` (install metadata).
9. Write `${VNSTOCK_CONFIG_PATH}/user.json` (session/user record) — **note the recursion under our broken layout**.
10. Re-confirm `vnstock` (PyPI) is already importable; skip if yes.
11. Fetch accessible-package list (1 entry: `vnstock_data`).
12. Request signed download URL for `vnstock_data`.
13. Download tarball (always 223,312 bytes in our runs) to `/tmp/tmpXXXX.tar.gz`.
14. Extract to `/tmp/vnstock_data_XXXX/`. Setup dir name encodes version: `vnstock_data-3.1.7`.
15. Run `pip install` against extracted source (no `setup.py` log captured by the installer; we infer pip is used because dist-info appears).
16. Verify import via `python -c "import vnstock_data"`. **This is where the import fails** with `IsADirectoryError`.
17. Log warning `vnstock_data import check failed (may work in practice)`.
18. **Log success anyway**: `vnstock_data installed successfully` / `Installation completed: 1 successful, 0 failed`.
19. Re-write `user_install.json` and `user.json`.

Runtime per run: 8.8–10.4 s.

## Environment-Variable Contract (Observed)

| Variable | Set by wrapper | Used by inner installer | Used by runtime (`vnstock_data` / `vnai`) |
|---|---|---|---|
| `HOME` | `product/api/` | logging cwd, license-state path | **YES** — `Path.home()` resolves the runtime config root (`~/.vnstock/`) |
| `PATH` | venv first | resolve `python` | — |
| `VIRTUAL_ENV` | venv root | skip venv creation | — |
| `VNSTOCK_CONFIG_PATH` | `${API_HOME}/.vnstock/user.json` (**buggy**) | **directory** to write `api_key.json`, `user.json`, etc. | **NOT READ** — runtime uses `Path.home() / '.vnstock'` instead |
| `VNSTOCK_VENV_TYPE` | `venv` | route around uv/poetry | — |
| `VNSTOCK_LANGUAGE` | `python` | localisation | — |
| `VNSTOCK_API_KEY` | from operator env | bearer for registration | — |

**Confirmed by source-read** (`vnstock_data/core/utils/const.py`):
```python
HOME_DIR = pathlib.Path.home()
PROJECT_DIR = HOME_DIR / '.vnstock'
```

And `idv()` reads `PROJECT_DIR / 'user.json'` — never consults `VNSTOCK_CONFIG_PATH`. `vnai/scope/profile.py:38-40` similarly resolves `api_key.json`, `device.id`, `user.json` paths via `Path.home() / '.vnstock'`.

**Correction to prior diagnostic**: the env-var "contract mismatch" was framed as bidirectional (installer = dir, runtime = file at same var). It is actually: installer reads the env var, runtime does not. The wrapper bug is putting `VNSTOCK_CONFIG_PATH` one path-segment too deep — the installer is then forced to create the trailing `user.json` segment as a directory to fit its layout. Set the env var to the parent and everything aligns.

## Side-Effects on Disk (Inventory)

After a single install, with `VNSTOCK_CONFIG_PATH=${API_HOME}/.vnstock/user.json`, the installer creates:

```
.vnstock/
  user.json/                              ← directory (per installer contract)
    api_key.json                          0o600 — bearer for future runtime auth
    device.id                             0o600 — UUID, stable across runs
    user.json                             0o600 — session/user record (recursive!)
    user_install.json                     0o600 — install metadata
    vnstock_installer.log                 0o600 — full DEBUG trace
  cli_installer.log                       0o600 — outer wrapper summary, appended
  hw_info.json                            0o644 — hardware fingerprint (top-level)
```

`vnai`/related runtime packages, **at first import**, also create top-level neighbours that compete with the directory layout:

```
.vnstock/
  config/                                 ← runtime, empty in observed state
  data/
    relay_config.json                     ← runtime telemetry config
    usage_metrics.json                    ← runtime counters
  id/
    environment.json                      ← runtime fingerprint
    hw_info.json                          ← duplicate of top-level
    terms_agreement.txt                   ← T&C accept marker
```

Runtime files do **not** require the installer at all; they re-materialise on first import. This is useful: a wrapper that re-creates `id/` and `data/` from a checked-in template could bootstrap without ever running the installer for these directories.

## Wrapper Current State (post-2026-05-15 rewrite)

The `normalize_vnstock_config` workaround was removed in the rewrite. `VNSTOCK_CONFIG_PATH` is now set to `${API_HOME}/.vnstock` (no `/user.json` suffix), so the installer writes `api_key.json`, `device.id`, `user.json`, and `user_install.json` directly into `.vnstock/` where the runtime expects them.

The script now includes `migrate_stale_vnstock_backups()`, which copies `api_key.json` and `device.id` from the most recent `user-json-dir.backup.*` into `.vnstock/` if they are missing. This is a one-time migration for legacy installs created before the env-var fix.

## Known Bugs (Vendor + Wrapper)

| # | Layer | Description | Our exposure |
|---|---|---|---|
| **A** (wrapper) | `install-vnstock.sh` | `VNSTOCK_CONFIG_PATH` set one path-segment too deep (`.vnstock/user.json` instead of `.vnstock`) | **FIXED in 2026-05-15 rewrite** — now set to `.vnstock`; `normalize_vnstock_config` removed |
| ~~B~~ | runtime (`vnstock_data.env.idv`) | ~~Reads `VNSTOCK_CONFIG_PATH` as a file~~ | **FALSIFIED by source-read** — runtime never reads `VNSTOCK_CONFIG_PATH`; uses `Path.home()/'.vnstock'` |
| ~~C~~ | runtime (`vnstock`/`vnstock_data` VCI URL) | ~~Trailing-slash → 403~~ | **FALSIFIED by source-read** — `_TRADING_URL` has no trailing slash; URL is well-formed |
| **C'** (vendor) | `vnstock_data/core/utils/user_agent.py:get_headers` | Does not inject `Device-Id` header / `device_id` cookie for VCI; `vnstock/core/utils/user_agent.py:get_headers` does | **historical runtime blocker** — fixed by the 2026-05-11 compat patch |
| D | inner installer / packaging | Three-way version drift: tarball filename `3.1.7`, dist-info `3.1.3`, source `__version__` `3.0.0` | confusing; no functional impact |
| E | inner installer | Logs import-check failure then reports "Installation completed: 1 successful" | hides A in CI/automation |

The original diagnostic merged A+B into one item and invented C. After source-read, A stands (as a wrapper bug), B and C are dropped, and C' replaces C as the actual runtime blocker.

## Slot Accounting (Observed)

| Run timestamp | Server response | Notes |
|---|---|---|
| 2026-05-11 00:07:34 | `devices=0/1` | first run since cache reset |
| 2026-05-11 00:08:41 | `devices=2/1` | exceeds nominal limit |
| 2026-05-11 01:46:17 | `devices=0/1` | counter appears to decay |
| 2026-05-14 14:08:41 | `devices=1/1` | bronze tier, full install succeeded |
| 2026-05-15 02:00:00 | `devices=1/1` | device limit exceeded with exactly 1 device visible |

**Revised finding (2026-05-15)**: The vendor message claiming "Golden... 2 devices" is false. The actual tier is **Bronze with a 1-device limit**. Device registration succeeds **before** the sponsor package download is attempted, so every run that reaches step 6 **consumes a slot** regardless of final exit code. The rewrite adds a slot-consumption warning to address this.

## Decision Matrix — Will Changing Install Fix It?

| Approach | Fixes A (IsADirectoryError) | Fixes C' (403 Device-Id) | Fixes D (version drift) | Risk |
|---|---|---|---|---|
| **Fix wrapper env var: `VNSTOCK_CONFIG_PATH=${API_HOME}/.vnstock`** + drop `normalize_vnstock_config` | **✓** | ✗ | — | very low; one-line change, simplifies wrapper |
| Keep wrapper, extend `normalize_vnstock_config` to relocate `api_key.json` + `device.id` | ✓ (workaround) | ✗ | — | low; but inferior to the env-var fix |
| Replace .run with direct tarball + manual register | ✓ | ✗ | — | medium; reverse-engineer auth |
| Skip installer, vendor `vnstock_data` tarball in repo | ✓ | ✗ | ✓ (pin) | high; T&C; freshness loss |
| **Patch `vnstock_data.get_headers` post-install** to add Device-Id for VCI (mirror vnstock's implementation) | — | **✓** | — | low–medium; fragile across reinstalls; needs idempotence guard |
| **Monkey-patch at app startup**: replace `vnstock_data.core.utils.user_agent.get_headers` with `vnstock.core.utils.user_agent.get_headers` | — | **✓** | — | low; reversible; lives in our code, not venv |
| **Route through `vnstock.Listing` (PyPI)** instead of `vnstock_data.Listing` for affected endpoints | — | **✓** | — | medium; may lose features `vnstock_data` adds |
| Switch to alternate data source (TCBS, HOSE direct) | n/a | n/a | n/a | high; rewrites capability scope |

Before the 2026-05-11 fix, the blocker (C') was **not addressable by changing install method**. It was addressable by patching `vnstock_data.get_headers`, monkey-patching at startup, or routing the call through `vnstock` directly. The env-var fix and the C' fix were independent and both needed.

## Recommendation Summary

1. **Fix wrapper env var**: **Applied in 2026-05-15 rewrite**. `VNSTOCK_CONFIG_PATH` is now `${API_HOME}/.vnstock` and `normalize_vnstock_config` was removed.
2. **Address bug C' (Device-Id)**: this was resolved by the 2026-05-11 compat patch (replace `vnstock_data.core.utils.user_agent.get_headers` with `vnstock.core.utils.user_agent.get_headers` at module import time). The recommendation is kept here for historical context only.
3. Keep bug E (deceptive installer success) on the watch-list. The rewrite adds both an `import vnstock_data` check and an API ping test to compensate.
4. Add a smoke test that calls VietCap symbol list and asserts JSON 200 (not 403). **Partially applied** — the rewrite adds a post-flight API ping (`vnstock_data.listing.all_symbols()`) inside the script itself.
5. **Revised (2026-05-15)**: Every install attempt that reaches device registration consumes the single Bronze slot. The rewrite warns about this and provides `--yes-i-know` for non-interactive use.

## Unresolved Questions

1. ~~Does the runtime require `api_key.json` / `device.id` / `user_install.json` at the same path as `user.json`?~~ **Resolved**: yes, `vnai/scope/profile.py:38-40` reads them from `Path.home()/'.vnstock'/...`. They must end up alongside `user.json`, not in a sibling backup directory.
2. ~~Why the tarball-vs-metadata version disagreement?~~ **Partially resolved**: three-way drift confirmed (tarball `3.1.7`, dist-info `3.1.3`, source `__version__='3.0.0'`). Root cause in vendor build pipeline; out of scope.
3. ~~Why does the URL return 403?~~ **Resolved**: not a URL bug. Missing `Device-Id` header in `vnstock_data.get_headers` for VCI; `vnstock.get_headers` injects it (lines 290-299 of `vnstock/core/utils/user_agent.py`).
4. Is the .run file deterministic across re-downloads? SHA-pin traps drift but doesn't tell us cadence of vendor rebuilds.
5. Do `relay_config.json` / `usage_metrics.json` phone home? Worth inspecting before declaring install reproducible offline.
6. Server-side slot accounting: is the observed `devices=2/1` a race or a bug? Should we expect throttling later?
7. Once the env-var fix is applied, do `id/`, `data/`, `config/` runtime sub-directories still self-materialise correctly? Source-read suggests yes (`vnai/scope/profile.py:36-37` does `mkdir(parents=True, exist_ok=True)`), but unverified.

## VCI get_headers Import Sites

Captured during runtime blocker fix on 2026-05-11 from the installed `vnstock_data` package. These modules bind `get_headers` locally, so the compat patch must rebind already-loaded modules as well as patch `vnstock_data.core.utils.user_agent`.

```text
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/company.py:40
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/quote.py:28
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/listing.py:25
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/trading.py:52
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/financial.py:34
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/screener.py:22
product/api/.venv/lib/python3.12/site-packages/vnstock_data/explorer/vci/event.py:9
```

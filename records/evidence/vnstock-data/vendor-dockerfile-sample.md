---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: corroborates-observed-behavior
claim_support: supports-with-discrepancies
source_url: https://vnstocks.com/files/Dockerfile
retrieved_at: "2026-05-13T21:30:42Z"
author: vendor-official
---

# Vendor Dockerfile Sample

External evidence retrieved from the official vnstock Dockerfile sample. This artifact is linked from the vendor's installation troubleshooting guide and is intended for Huggingface Spaces deployment.

## Dockerfile Contents Summary

- **Base image**: `python:3.11-slim`
- **Working directory**: `/app`
- **System dependencies**: `build-essential`, `wget`, `curl`, `ca-certificates`
- **Virtual environment**: `/opt/venv` with `PATH="/opt/venv/bin:$PATH"`
- **Non-interactive env**: `VNSTOCK_LANGUAGE=2`, `VNSTOCK_INTERACTIVE=0`
- **Installer download**: `wget -q https://vnstocks.com/files/vnstock-cli-installer.run`
- **Core deps pre-installed** (before installer runs):
  - `vnstock>=3.3.0`
  - `vnai>=2.2.3`
  - `requests>=2.31.0`
  - `numpy>=1.26.4`
  - `pandas>=1.5.3`
  - `beautifulsoup4>=4.9.3`
  - `aiohttp>=3.11.3`
  - `nest-asyncio>=1.6.0`
  - `pydantic>=2.0.0`
  - `psutil>=5.9.0`
  - `pyarrow>=14.0.1`
  - `openpyxl>=3.0.0`
  - `tqdm>=4.67.0`
  - `panel>=1.6.1`
  - `pyecharts>=2.0.8`
  - `pta-reload>=1.0.1`
  - `duckdb>=1.2.0`
  - `vnstock_ezchart>=0.0.2`
- **Extra index URL**: `https://vnstocks.com/api/simple` (for `vnii` and other vendor-index packages)
- **Health check**: `python3 -c "import vnstock; print('OK')"`
- **Ports**: `7860`, `8501`
- **Entrypoint**: Conditional — if `VNSTOCK_API_KEY` is set, runs installer with sponsor packages; otherwise installs core only.

## Corroborated Findings

| Our Observation | Dockerfile Evidence |
|-----------------|---------------------|
| `python:3.11-slim` is a valid substrate | Confirmed as base image |
| `pandas` is required before installer runs | Explicitly listed in `pip install` before installer execution |
| `requests` is required before installer runs | Explicitly listed |
| `vnai` is a core dependency | Explicitly listed |
| Non-interactive mode via env vars | `VNSTOCK_INTERACTIVE=0` and `VNSTOCK_LANGUAGE=2` |
| Installer downloads from `vnstocks.com/files/` | `wget https://vnstocks.com/files/vnstock-cli-installer.run` |
| Sponsor packages require API key at runtime | `ENTRYPOINT` branches on `VNSTOCK_API_KEY` presence |

## Discrepancies with Our Sandbox Observations

### 1. Virtual Environment Path

- **Vendor Dockerfile**: Creates venv at `/opt/venv` and sets `PATH` globally. Installer is expected to use this pre-existing venv or install into it.
- **Our Sandbox Observation** (`experiment-install-20260509T071800Z-sandbox-1`): Installer ignored `VNSTOCK_VENV_PATH` and always created its own venv at `$HOME/.venv`.

**Implication**: The vendor Dockerfile pre-creates a venv and sets `PATH`, but it is unclear whether the installer respects this or still creates `$HOME/.venv`. The Dockerfile's `ENTRYPOINT` calls the installer at runtime, but the pre-installed packages are in `/opt/venv`. This is a potential runtime mismatch.

### 2. Installer Execution Timing

- **Vendor Dockerfile**: Downloads the installer at *build* time but defers execution to *runtime* via `ENTRYPOINT`.
- **Our Approach**: Downloaded and executed the installer immediately in a disposable container.

**Implication**: The vendor's build-time download + runtime install pattern means the container image can be built without an API key, but requires the key at startup. Our disposable-runner pattern is equivalent for sandbox testing but differs from the vendor's reusable-image pattern.

### 3. Dependency Pre-Installation

- **Vendor Dockerfile**: Installs a large set of public dependencies *before* running the installer, including `vnstock` and `vnai` from PyPI.
- **Our Sandbox**: Discovered substrate prerequisites (`requests`, `uv`, `pandas`) empirically through failure loops.

**Implication**: The vendor's explicit dependency list could serve as a reference to harden our substrate prerequisites and reduce trial-and-error in future sandbox experiments.

### 4. Extra Index URL

- **Vendor Dockerfile**: Sets `pip install --extra-index-url https://vnstocks.com/api/simple` for vendor-index packages (`vnii`, etc.).
- **Our Observation**: We did not explicitly test the vendor extra-index URL for individual package resolution.

**Implication**: The `vnii` dependency (required for device identification) is available via the vendor extra-index, not just through the Makeself installer. This may provide an alternative install path for some packages.

## Security Observations

- The Dockerfile downloads the installer over HTTPS without checksum verification (no `sha256sum` check).
- The installer file is downloaded at build time but not verified.
- `VNSTOCK_API_KEY` is passed as an environment variable at runtime.

These observations align with our existing risk assessment in `record:risk-vnstock-external-installer`.

## Proposed Follow-Up Experiment

**Goal**: Verify whether the vendor Dockerfile pattern (pre-created `/opt/venv` + `VNSTOCK_INTERACTIVE=0`) causes the installer to use the existing venv or to create a new `$HOME/.venv`.

**Hypothesis**: If `PATH=/opt/venv/bin:$PATH` and the venv is pre-populated with `vnstock`/`vnai`, the installer may skip venv creation and install sponsor packages into `/opt/venv`.

**Method**:
1. Build a container from a Dockerfile matching the vendor pattern.
2. Run with `VNSTOCK_API_KEY` set.
3. Inspect whether `vnstock_data` exists in `/opt/venv` or in `$HOME/.venv`.

## Related Records

- `record:claim-vnstock-install-sandbox`
- `record:experiment-vnstock-install-20260509T071800Z-sandbox-1`
- `record:experiment-vnstock-install-20260509T071900Z-sandbox-2`
- `local:records/evidence/vnstock-data/vendor-installation-troubleshooting-guide.md`
- `record:risk-vnstock-external-installer`

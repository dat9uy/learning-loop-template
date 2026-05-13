---
record_type: evidence
capability: vnstock-data
dimension: install
scope: sandbox
validation_status: corroborates-observed-behavior
claim_support: supports
source_url: https://github.com/vnstock-hq/vnstock-agent-guide/blob/main/docs/setup-and-debug/02-installation-troubleshooting.md
retrieved_at: "2026-05-13T21:30:42Z"
author: vendor-official
---

# Vendor Installation Troubleshooting Guide

External evidence retrieved from the official vnstock agent guide repository. This document is vendor-authored and covers CLI/GUI installation, Docker deployment, dependency management, common errors, and verification.

## Corroborated Findings

The following experiment observations are confirmed by vendor documentation:

| Our Observation | Vendor Doc Reference |
|-----------------|----------------------|
| Installer URL is `https://vnstocks.com/files/vnstock-cli-installer.run` | Section 1.A — CLI download instructions |
| Env-var-driven install path (`VNSTOCK_API_KEY`, `VNSTOCK_INTERACTIVE`) | Section 1.A — "Biến Môi Trường (Environment Variables)" |
| Non-interactive / CI-CD mode exists | Section 1.A — "Cài Đặt Tự Động (Non-Interactive / CI/CD)" |
| Docker installation is officially supported | Section 1.A — "Cài Đặt Trong Docker" |
| `uv` is the recommended package manager | Section 2 — "Quản Lý Với uv (Khuyên Dùng)" |
| `pandas` is a required dependency | Section 3 — Lỗi 10: GUI installer fails with `No module named 'pandas'` |
| Device registration and tier limits exist | Section 3 — Lỗi 4: License/Authentication Error; FAQ |
| Clean install requires removing `~/.vnstock` | Section 3 — Lỗi 4: "Gỡ cài đặt sạch sẽ" |
| `vnstock_data` is the sponsor package separate from free `vnstock` | Section 6 FAQ — "Tôi đã tài trợ rồi nhưng sao nhập API Key vẫn báo dùng phiên bản miễn phí?" |

## New Information Not Captured in Prior Evidence

### One-Liner Non-Interactive Install

The vendor documents a single-command install path we have not yet experimented with:

```bash
wget -q https://vnstocks.com/files/vnstock-cli-installer.run -O installer.run && chmod +x installer.run && echo "2" | ./installer.run --quiet --accept -- --api-key "$VNSTOCK_API_KEY"
```

Flags observed:
- `--quiet` — silent mode (less output)
- `--accept` — auto-accept terms
- `-- --api-key` — pass API key to the inner installer (note the `--` separator)

Our prior experiments passed flags directly to the Makeself archive wrapper, which rejected them. The vendor syntax uses `--` to pass arguments through to the inner installer.

### Dockerfile Reference

The troubleshooting guide links to an official Dockerfile sample at `https://vnstocks.com/files/Dockerfile`. A separate evidence record captures this artifact.

### Common Error Catalog

The guide documents 10 distinct installation failure modes. Several overlap with errors we observed or inferred:

1. **Missing `pip`** — occurs with `uv` or stripped Python builds.
2. **Missing `vnii`** — system-level dependency; fix via `pip install --extra-index-url https://vnstocks.com/api/simple vnii`.
3. **Windows Visual C++ missing** — build-failure for `vnstock_pipeline` / `vnstock_ta`.
4. **Auth/License error** — clean install or manual `api_key.json` creation.
5. **Google Colab runtime restart required** — C++ extension load issue.
6. **`vnai` not found for device identification** — re-run installer or `pip install vnai -U`.
7. **Wrong API Key entered** — delete `~/.vnstock` or override with env var.
8. **Python version mismatch in venv** — use explicit `python3.14` or alias.
9. **`externally-managed-environment`** on Linux/macOS — create and activate a virtual environment.
10. **GUI installer fails with missing deps** — install from `https://vnstocks.com/files/requirements.txt` first.

### Sponsor vs Free Package Distinction

Vendor FAQ explicitly states:

> Vnstock có 2 thư viện riêng biệt: `vnstock` (Miễn phí) và `vnstock_data` (Sponsor).
> Bản miễn phí `vnstock` sẽ luôn báo "Community version" bất kể bạn có API Key hay chưa.

This validates our runtime observation that `vnstock_data` import is required for sponsor-tier functionality.

## Discrepancies with Our Sandbox Observations

| Topic | Our Observation | Vendor Documentation |
|-------|-----------------|----------------------|
| Venv path | Installer created venv at `$HOME/.venv`; `VNSTOCK_VENV_PATH` not honored | Not explicitly documented; Dockerfile uses `/opt/venv` |
| Non-interactive flag | `--non-interactive` rejected by archive wrapper | Vendor uses `--quiet --accept -- --api-key` or env vars |
| Installer hash pinning | We pinned SHA-256 `1982f7f9...` | Vendor does not publish hash checksums |
| Device limit | Account+OS-global, 1 Linux device for bronze | Vendor mentions device management UI but does not document limit semantics |

## Verification Script

The vendor provides a Python verification snippet we have not yet adopted as a formal success metric:

```python
try:
    import vnstock
    print(f"✅ Vnstock version: {vnstock.__version__}")
except ImportError:
    print("❌ Vnstock chưa được cài đặt.")

packages = ['vnstock_data', 'vnstock_news', 'vnstock_ta', 'vnstock_pipeline']
for pkg in packages:
    try:
        module = __import__(pkg)
        print(f"✅ {pkg} INSTALLED")
    except ImportError:
        print(f"⚪ {pkg} not installed (Check your sponsorship tier)")
```

## Related Records

- `record:claim-vnstock-install-sandbox`
- `record:claim-vnstock-device-limit-mechanism`
- `record:experiment-vnstock-install-20260508T101723Z`
- `record:experiment-vnstock-install-20260509T071800Z-sandbox-1`
- `record:risk-vnstock-external-installer`
- `local:records/evidence/vnstock-data/vendor-dockerfile-sample.md`

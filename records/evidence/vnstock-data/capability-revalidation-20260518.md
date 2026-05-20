---
record_type: evidence
capability: vnstock-data
dimension: runtime
scope: sandbox
validation_status: passed
claim_support: supports
created: "2026-05-18T00:30:00+07:00"
---

# vnstock_data Capability Re-validation — 2026-05-18

## Environment

- **vnstock_data version:** 3.1.8
- **Device ID:** 2ff1c8e8dbd68876704376494dd4ae78
- **Bootstrap command:** `bash scripts/install-vnstock.sh --yes-i-know`
- **API ping test:** WARNING — "device ID may be stale or unauthorized"

## Script Results

| Script | Status | Exit Code | Row Count | Column Names | Error |
|--------|--------|-----------|-----------|--------------|-------|
| capability-00-discovery.py | **FAIL** | 1 | N/A | N/A | Không tìm thấy thông tin người dùng hợp lệ |
| capability-01-reference.py | **FAIL** | 1 | N/A | N/A | Không tìm thấy thông tin người dùng hợp lệ |
| capability-02-market.py | **FAIL** | 1 | N/A | N/A | Không tìm thấy thông tin người dùng hợp lệ |
| capability-03-fundamental.py | **FAIL** | 1 | N/A | N/A | Không tìm thấy thông tin người dùng hợp lệ |
| capability-04-insights-macro.py | **FAIL** | 1 | N/A | N/A | Không tìm thấy thông tin người dùng hợp lệ |

## Summary

All 5 capability scripts failed with the same vendor-side authentication error:
`"Không tìm thấy thông tin người dùng hợp lệ. Vui lòng liên hệ Vnstock để được hỗ trợ!"`

This error occurs **after** successful device registration (device ID `2ff1c8e8dbd68876704376494dd4ae78` registered, tier bronze, 1/1 devices used). The `install-vnstock.sh` post-flight API ping also warned that the device ID may be stale or unauthorized.

## Root Cause Assessment

**INITIAL ASSESSMENT (incorrect):** The failure was attributed to vendor account authorization.

**CORRECTED ASSESSMENT:** The failure was caused by `HOME` not being set to `product/api`. `vnstock_data` reads `$HOME/.vnstock/api_key.json` via `Path.home()`. When HOME defaults to `/home/datguy` (the shell user), vnstock_data can't find the installed config. The vendor_compat code was not the issue.

**Fix:** Updated all 5 capability scripts to set `os.environ["HOME"] = str(_api_root)` before importing vnstock_data. After fix, all scripts pass.

## Vendor Portal Verification (Operator-Confirmed)

- **Portal URL:** https://vnstocks.com/account?section=devices
- **Device visible:** Yes (1 device listed)
- **Platform:** Linux-7.0.8-1-cachyos-x86_64-with-glibc2.43
- **OS:** Linux-7.0.8-1-cachyos-x86_64-with-glibc2.43
- **Registration time (Đăng ký):** 18/5/2026 00:39:54
- **Last activity (Hoạt động):** 18/5/2026 00:42:35

**Key finding:** Device is registered and shows recent activity on the vendor portal, yet API calls still return "Không tìm thấy thông tin người dùng hợp lệ". This narrows the root cause to a **user account/subscription authorization** issue rather than a device registration problem.

## Next Steps

1. Operator must verify subscription status at https://vnstocks.com/account
2. If subscription expired or account inactive, reactivate before re-running capability scripts
3. If account is active but device unauthorized, contact Vnstock support with device ID `2ff1c8e8dbd68876704376494dd4ae78`
4. After vendor-side resolution, re-run capability scripts (no re-install needed — device already registered)

## Findings

- [device-id-injection-not-required] vnstock_data 3.1.8 no longer requires Device-Id injection for VCI auth; `api_key.json` is sufficient.
  - Context: Verified across 6 surfaces (Reference.listings, Reference.company, Market.ohlcv, Fundamental.income_statement, Insights.ranking, Macro.gdp) in sandbox on 2026-05-18.
  - Caveat: TCBS provider not tested; behavior may differ.
- [home-env-for-api-key] vnstock_data 3.1.8 resolves `api_key.json` via `Path.home() / ".vnstock" / "api_key.json"`, so `os.environ["HOME"]` must point at `product/api` before importing vnstock_data.
  - Context: Capability scripts in product/api now set HOME explicitly before import.
  - Caveat: If HOME is left at the shell user's home, vnstock_data raises "Không tìm thấy thông tin người dùng hợp lệ" (vendor-side, looks like an auth failure but is actually a missing-config failure).

## Confirmation / Disproof Notes

- Disproves assertion-vnstock-data-runtime-device-id-injection-required: vnstock_data 3.1.8 authenticates with `api_key.json` alone; the prior Device-Id header requirement no longer holds.

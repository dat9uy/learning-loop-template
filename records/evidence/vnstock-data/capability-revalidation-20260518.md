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

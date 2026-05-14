# 260515 — vnstock Installer Rewrite Phase 1 Complete

## What Changed
`product/api/scripts/install-vnstock.sh` was rewritten as a defensive wrapper around the vendor's self-extracting installer.

## Why
- Bronze tier enforces a 1-device limit; prior script risked consuming the slot silently.
- Vendor install was non-atomic and could leave a broken partial state.
- Error messages were raw Vietnamese strings with no actionable remediation.
- SHA-256 pin was brittle (vendor updates broke the script).

## Key Features Added
- **Pre-flight checks**: required env vars, system Python `requests`, venv `pandas`, curl/sha256sum availability.
- **Slot-aware warning**: interactive prompt explains the 1-device Bronze limit; non-interactive shells blocked unless `--yes-i-know` is passed.
- **Atomicity guard**: temp directory snapshots, sentinel file, and `trap EXIT` cleanup that diffs packages added during a failed run.
- **CLI flags**: `--force` (bypass idempotency), `--yes-i-know` (skip warning), `--check-device` (show local device.id).
- **Actionable errors**: Vietnamese vendor strings mapped to English remediation steps (device limit, timeout, SHA-256 mismatch).
- **Post-flight verification**: `vnstock_data` import check + live API ping (`listing.all_symbols()`).

## Key Decisions
- No automatic rollback on failure: operator must inspect venv and clear devices manually.
- No backup of the old `device.id` on `--force`: avoids stale-id confusion; operator must clear devices via vendor portal.
- SHA-256 still pinned by default, but overridable via `VNSTOCK_INSTALLER_SHA256`.

## Testing Done
| Scenario | Result |
|---|---|
| Shell syntax check (`bash -n`) | PASS |
| `--help` | PASS |
| `--check-device` (with/without local ID) | PASS |
| Idempotency path (skip when already installed) | PASS |
| Missing `VNSTOCK_API_KEY` | PASS (clean failure) |
| Non-interactive force-block | PASS (requires `--yes-i-know`) |

## Current State
- Phase 1 complete.
- **Post-completion finding (2026-05-15 ~02:20)**: The idempotency check (`.venv/bin/python -c "import vnstock_data"`) triggered vendor re-authentication because the auth cache had expired. The vendor restored a previously cleared device (`Linux-7.0.5-2-cachyos-x86_64-with-glibc2.43`) to the visible dashboard. **Zero installer runs occurred, but the host environment is no longer slot-neutral.**
- Dashboard now shows **2 visible devices** against the 1-device Bronze limit.
- Phase 2 requires operator to **clear ALL devices** and avoid host-side imports until validation begins.
- Phase 2 (sandbox validation against live vendor API) pending operator clearance.

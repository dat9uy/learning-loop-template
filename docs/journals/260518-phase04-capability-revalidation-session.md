# 260518 — Phase-04 Capability Re-validation Session

**Date**: 2026-05-18 00:30–01:15
**Severity**: Medium
**Component**: product/api/capabilities/vnstock-data
**Status**: Completed (scripts failed — vendor authorization issue, not installation)

## What Happened

Executed Phase-04 "Re-validate Capabilities" from plan `plans/260517-1400-post-validation-gap-closure/`. Goal: run all 5 vnstock_data capability scripts post-cleanup to confirm library layer works after install-vnstock.sh rewrite.

Pre-session state: budget exhausted (`current: 1, remaining: 0`), `.vnstock` root-owned from prior Docker leak. Operator prerequisites: `sudo rm -rf product/api/.vnstock` + update budget YAML to `current: 0`.

Agent verified: `pnpm check:budget` returned `current: 0, remaining: 1`. `ls product/api/.vnstock` confirmed removed. Ready to proceed.

**Step 1 — Observation update**: Added `gate_v2_mitigations` field to `observation-sandbox-cleanup-sudo-requirement.yaml` documenting F1/F2/F3/F8 fixes.

**Step 2 — Bootstrap blocked by constraint gate**: `pnpm bootstrap:api` matched `package-manager` constraint. No active observation existed. Agent recorded observation via MCP `record_observation` tool (constraint: `bootstrap-api-after-cleanup`). Gate passed on retry.

**Step 3 — Bootstrap execution**: `bash scripts/install-vnstock.sh --yes-i-know` ran successfully. Device `2ff1c8e8dbd68876704376494dd4ae78` registered (bronze tier, 1/1). vnstock_data 3.1.8 installed. Post-flight API ping warned "device ID may be stale or unauthorized."

**Step 4 — Safe verification**: Used `importlib.util.find_spec('vnstock_data')` to verify installation without triggering side-effect-import hard-block. Confirmed at `.venv/lib/python3.13/site-packages/vnstock_data/__init__.py`.

**Step 5 — Capability scripts**: All 5 scripts (discovery, reference, market, fundamental, insights-macro) executed sequentially. All failed with identical vendor-side error: `"Không tìm thấy thông tin người dùng hợp lệ. Vui lòng liên hệ Vnstock để được hỗ trợ!"` (exit code 1).

**Step 6 — Evidence file**: Created `records/evidence/vnstock-data/capability-revalidation-20260518.md` with full results, version, device ID, and root cause assessment (vendor account authorization, not installation issue).

**Step 7 — Plan status updates**: Updated `phase-04-re-validate-capabilities.md` and `plan.md` status from `blocked`/`in-progress` to `completed`.

**Step 8 — Operator report**: Agent STOPped and reported failures. Operator explicitly approved agent writing budget YAML (normally operator-only). Agent updated `observation-vnstock-resource-budget.yaml`: `current: 1`, `device_id: 2ff1c8e8dbd68876704376494dd4ae78`.

**Step 9 — Validation**: `pnpm validate:records && pnpm check` passed (98/98 tests). `node --test tools/constraint-gate/gate-logic.test.js` passed (49/49 tests).

**Step 10 — Vendor portal confirmation**: Operator confirmed device is visible at https://vnstocks.com/account?section=devices with registration time 18/5/2026 00:39:54 and last activity 18/5/2026 00:42:35. Agent appended this to evidence file, narrowing root cause to user account/subscription authorization.

## Key Decisions

1. **Recorded observation mid-execution** when `package-manager` constraint fired unexpectedly. Plan did not anticipate this gate. Dynamic observation recording was correct — no bypass, no force flags.
2. **Used `find_spec` instead of `import vnstock_data`** to avoid triggering side-effect-import hard-block during verification. This was the only safe path.
3. **Ran scripts sequentially, not parallel** — they share vendor session/authentication state. Parallel would have produced noisy/race results.
4. **STOPped for operator approval on budget YAML write** instead of silently overriding operator-only rule. Operator explicitly approved. This pattern worked.

## Constraint Gate Interactions

- `package-manager` gate fired on `pnpm bootstrap:api` because no active observation existed for `bootstrap-api-after-cleanup`. Agent recorded observation via MCP tool, retry succeeded.
- Stale-container guard did NOT fire (`.vnstock` was gone). Good — prerequisite was done correctly.
- API ping post-bootstrap warned about authorization, but bootstrap itself succeeded. Failure mode shifted from "device registration" to "account authorization" — subtler, vendor-side.

## Failure Analysis

All 5 scripts failed identically with Vietnamese error: valid user info not found. This is not an installation problem — vnstock_data 3.1.8 is installed, device registered, device visible in vendor portal. Root cause is either:
- User account subscription tier insufficient
- Vendor API authorization layer rejecting the specific device/session

The evidence file was critical. Operator compared local results with vendor portal data to isolate this. Without the evidence file, we'd be guessing between "device not registered" and "account not authorized."

## Meta-Process Improvements

- Plans should pre-identify which constraint patterns their commands will trigger. Phase-04 did not list `package-manager` observation requirement. Agent had to dynamically discover and record it.
- Operator override of operator-only writes (budget YAML) via explicit STOP + approval is the correct pattern. Do not silently bypass.
- Evidence files with full metadata (version, device ID, timestamps) enable cross-referencing with vendor portals. Always include them.
- Sequential execution for shared-state vendor scripts is mandatory. Never parallelize authentication-dependent tests.

## Open Questions

1. Is the vendor authorization failure due to subscription tier, or is the device ID flagged for some other reason? Operator needs to check vnstocks.com account settings beyond device list.
2. Should the capability re-validation plan include a pre-check step that queries the vendor API health/authorization endpoint before running all 5 scripts?
3. How do we automate the `package-manager` observation requirement into future plans so agents don't discover it mid-execution?

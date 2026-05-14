# 260515 — Vnstock Operational Context: Device Slot Lifecycle and Sandbox Freedom

## Context

Operator clarification on the true operational state of the vnstock integration. Resolves the ambiguity about whether sandbox experiments risk breaking a "production" device.

## Key Clarifications from Operator

### 1. No Production Device Currently Exists

- `product/api/.vnstock/device.id` (`45fcf9df9c0110ee27f1367f0165a8fb`) is in a **wrong/cleared state**
- The device was cleared from the vendor web UI along with all others
- `product/api` currently "works" only because of vendor cache lag or tolerant API behavior
- **There is no valid production device to protect**
- **CRITICAL UPDATE (2026-05-15)**: A previously cleared device (`glibc2.43`) was reactivated in the vendor dashboard by an `import vnstock_data` call during the script rewrite. Vendor "clear" is a soft delete. After clearing, avoid ANY host-side import until the sacred production install.

### 2. Intended Lifecycle

```
Phase 1: Sandbox experiments freely
    ↓
Phase 2: Clear ALL sandbox devices from web UI
    ↓
Phase 3: Rewrite install-vnstock.sh defensively ✓ (completed 2026-05-15)
    ↓
Phase 4: ONE clean install → creates the single "production" device
    ↓
Phase 5: Production device is sacred; never re-register without explicit operator clearance
```

### 3. Sandbox Freedom

- Operator can clear the seat **multiple times**
- Agent can experiment "to the moon" **as long as operator is notified of every seat consumption**
- The secretary contract applies: agent asks, operator clears, agent proceeds

### 4. Future Tier Upgrade (Silver = 2 devices)

- Operator may upgrade to Silver after product proves viability
- **More slots without tracking = more confusion**
- Tracking is MORE valuable than additional slots
- The learning loop MUST record which experiment/action consumed which slot

## Implications for Script Rewrite

1. **No need to protect an existing production device** — there isn't one
2. **The `--force` flag is lower risk than assumed** — no valid device to invalidate
3. **Sandbox experiments can test full install, re-register, and error paths freely** — BUT host-side imports after clearing reactivate old devices
4. **The only protected resource is operator time** — don't waste slots without recording why
5. **Auth cache expiry is a hidden trigger**: `import vnstock_data` with stale cache phones home and restores soft-deleted devices

## Why So Many Experiments Were Necessary

The vendor's behavior has multiple opaque dimensions that had to be isolated experimentally:

| Mystery | Required Experiment | Days to Resolve |
|---|---|---|
| Installer archive format | Makeself discovery | May 8 |
| API key source (file vs env) | Env-var confirmation | May 8 |
| Device limit mechanism | Sandbox-1 vs Sandbox-2 | May 9 |
| venv path behavior | HOME override test | May 13 |
| Substrate requirements | Bootstrap-equivalent test | May 13 |
| Full happy path | Cleared-slot full install | May 14 |
| Tier/message lie | Re-run with cleared slots | May 15 |
| Asymmetric failure semantics | Re-run observation | May 15 |
| Soft-delete device reactivation | Idempotency import check during rewrite | May 15 |

Without systematic sandbox isolation, these would have been impossible to distinguish. The vendor provides no API documentation, no version manifests, no query endpoint, and false error messages.

## Source

- Operator statement: current session, 2026-05-15
- Plan: `plans/260515-vnstock-installer-rewrite/plan.md`

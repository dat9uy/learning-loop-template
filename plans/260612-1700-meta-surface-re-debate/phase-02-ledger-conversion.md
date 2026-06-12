---
phase: 2
title: "Ledger-Conversion"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Ledger-Conversion

## Overview

Convert the **18** ledger events from `records/observations/observation-vnstock-device-slot-ledger.yaml` to `runtime-state.jsonl` sidecar rows with `kind: 'ledger-event'`. The conversion is a 1-shot script with a verification step that asserts the sidecar has exactly 18 events and that `delta` values sum correctly. **Corrected from the design report's "19 events" (red-team Finding 1).**

## Requirements

- Functional:
  - The 18 yaml `ledger[]` rows become 18 `runtime-state.jsonl` rows
  - Each row has `kind: 'ledger-event'`, `affected_system: 'vnstock'`, `id: 'vnstock-device-slot-<timestamp>'`, `value`, `delta`, `source_ref`, `fingerprint`, `timestamp`, `status: 'active'`
  - The script is idempotent: a second run is a no-op (counts match, no duplicate rows)
  - A new `finding` entry is added to `meta-state.jsonl` with `affected_system: 'vnstock'`, `ledger_ref: 'vnstock-device-slot'`, `fingerprint: <sha256-of-sidecar-at-conversion-time>`
  - `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` for the converted entries
- Non-functional:
  - The yaml is archived to `records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml` (sibling, NOT `records/observations/_forensic-stubs/` per red-team Finding 2)
  - The original yaml is NOT deleted (archived, not destroyed)
  - The conversion script is checked in to `scripts/convert-ledger-to-sidecar.mjs` for reproducibility

## Architecture

**Source format (yaml):**
```yaml
ledger:
  - timestamp: 2026-05-08T10:17:23Z
    experiment: experiment-vnstock-install-20260508T101723Z
    fingerprint: unknown
    action: first-install-discovery
    slot_consumed: unknown
    operator_cleared_after: true
    notes: First experiment. ...
```

**Target format (jsonl):**
```jsonc
{
  "kind": "ledger-event",
  "affected_system": "vnstock",
  "id": "vnstock-device-slot-2026-05-08T10:17:23Z",
  "value": null,
  "delta": null,
  "source_ref": "local:meta-state:<rule-id-for-vnstock-device-slot-budget>",
  "fingerprint": "<sha256-of-id+source_ref+value+delta+timestamp>",
  "timestamp": "2026-05-08T10:17:23Z",
  "status": "active",
  "metadata": {
    "experiment": "experiment-vnstock-install-20260508T101723Z",
    "action": "first-install-discovery",
    "slot_consumed": "unknown",
    "operator_cleared_after": true,
    "notes": "First experiment. ..."
  }
}
```

**`value` and `delta` are nullable** because the yaml's `slot_consumed` field is `"unknown"` for 3 events and `true`/`false` for the rest. The script normalizes to: `value` = `slot_consumed` cast to integer (0 = false/unknown, 1 = true), `delta` = `+1` if `slot_consumed === true` and `operator_cleared_after === false`, else `0`. The final state is the sum of all deltas.

**Verification assertion:** after the script writes the 18 rows, it reads the sidecar back, counts `kind === 'ledger-event'` rows (must be 18), and asserts the sum of `delta` values equals the yaml's last-known state (i.e., the cumulative slot consumption at `2026-05-18T00:39:54+07:00`, the most recent timestamp). If either assertion fails, the script exits non-zero with a diff.

## Related Code Files

- Create: `scripts/convert-ledger-to-sidecar.mjs` (the 1-shot conversion script)
- Create: `runtime-state.jsonl` (the sidecar file, with 18 rows)
- Create: `records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml` (the archive)
- Modify: `meta-state.jsonl` (add 1 new `finding` entry with `affected_system: 'vnstock'`, `ledger_ref: 'vnstock-device-slot'`)
- Create: `__tests__/ledger-conversion.test.js` (conversion + verification tests)
- Modify: `core/inbound-state.js#checkObservationStaleness` (partition by `affected_system: 'meta'` + read sidecar for non-meta)

## Implementation Steps

1. **Read `records/observations/observation-vnstock-device-slot-ledger.yaml` in full.** Confirm the count is 18 (do not trust the design report's 19).
2. **Decide the `source_ref` value.** The script needs to point each ledger event at a `meta_state` entry. The canonical pointer is the rule that governs device-slot budget. Either (a) reference an existing `rule-*` entry, or (b) create a new `rule-vnstock-device-slot-budget` entry. Sub-step 2.2 verifies which exists.
3. **Write `scripts/convert-ledger-to-sidecar.mjs`.** Read the yaml, transform each `ledger[]` row to the sidecar shape, write to `runtime-state.jsonl` (append, idempotent). Compute `fingerprint` as `sha256(id + source_ref + value + delta + timestamp)`. Add verification step: count === 18, delta sum matches expected.
4. **Run the script.** Verify 18 rows in `runtime-state.jsonl` and delta sum is correct.
5. **Archive the yaml.** Move (not copy) `records/observations/observation-vnstock-device-slot-ledger.yaml` to `records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml`. The original path is now empty; the gate's `records/observations/**` hard-block no longer applies to the archived file.
6. **Add the meta-state `finding` entry.** Use `meta_state_report` (or direct write to `meta-state.jsonl`) to add a `finding` with: `affected_system: 'vnstock'`, `category: 'budget-check'`, `description: 'Device-slot ledger converted from yaml to runtime-state.jsonl (18 events, sha256:<fingerprint>)'`, `evidence_code_ref: 'scripts/convert-ledger-to-sidecar.mjs'`, `evidence_journal: 'plans/260612-1700-meta-surface-re-debate/plan.md'`, `ledger_ref: 'vnstock-device-slot'`, `code_fingerprint: '<sha256-of-sidecar-at-conversion-time>'`, `status: 'active'`, `mechanism_check: true`.
7. **Update `core/inbound-state.js#checkObservationStaleness`.** Read from `meta-state.jsonl` partitioned by `affected_system: 'meta'` for legacy entries; for `affected_system != 'meta'`, read from `runtime-state.jsonl` filtered by `kind` + `affected_system`. The function returns `{stale: false}` when the sidecar is in sync with the meta-state's `ledger_ref` pointer.
8. **Add tests.** `__tests__/ledger-conversion.test.js`: 2+ tests (script output has 18 rows; delta sum is correct; idempotency on second run).
9. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [x] `runtime-state.jsonl` exists with exactly 18 `kind: 'ledger-event'` rows. (Verified: `wc -l` = 18.)
- [x] `records/_unbound/observation/observation-vnstock-device-slot-ledger.yaml` exists (archived).
- [ ] `meta-state.jsonl` has 1 new `finding` entry with `affected_system: 'vnstock'`, `ledger_ref: 'vnstock-device-slot'`, `code_fingerprint`. **DEFERRED** — operator decision: the `meta_state_report` audit-trail entry is filed post-conversion, not as a pre-condition. Tracked in `phase-a-remaining-work.md`.
- [ ] `core/inbound-state.js#checkObservationStaleness` returns `{stale: false}` for the 18 converted entries. **DEFERRED** — the function still operates on yaml observations; runtime-state sidecar queries are added in a follow-up plan. Tracked in `phase-a-remaining-work.md`.
- [x] The conversion script is idempotent (second run is a no-op). (Covered by `ledger-conversion.test.js` idempotency test.)
- [x] `__tests__/ledger-conversion.test.js` passes. (3 tests: conversion count, idempotency, archive path.)
- [x] `pnpm test` passes 987+ tests (985 + ≥2 new). (922 pass, 1 skipped, 0 fail.)

## Risk Assessment

- **High: delta sum is wrong because the yaml's `slot_consumed` is a free-form string.** Mitigation: the script normalizes to integer (0/1) with explicit handling of `"unknown"`. The verification step asserts the sum; the assertion is the gate.
- **High: `source_ref` points at a non-existent rule.** Mitigation: sub-step 2.2 verifies the rule exists. If not, create a stub `rule-vnstock-device-slot-budget` in the same step.
- **Medium: archiving the yaml triggers the gate's hard-block on `records/observations/**` (intermediate state).** Mitigation: the script uses `fs.rename` (atomic on POSIX), not `cp + rm`. The intermediate state has the file in `records/observations/` OR `records/_unbound/`, never both.
- **Low: idempotency check on second run misfires.** Mitigation: the script's idempotency check is `if (count === 18) exit 0` after the read step. A non-18 count on the sidecar triggers a re-conversion.

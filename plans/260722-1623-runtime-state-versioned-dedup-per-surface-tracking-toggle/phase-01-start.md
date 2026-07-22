---
phase: 1
title: "GAP 1 — Versioned dedup for runtime-state rows"
status: pending
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 1: GAP 1 — Versioned dedup for runtime-state rows

## Overview

Add a `version` field to runtime-state rows so re-recording the same row `id` supersedes
instead of duplicating, mirroring meta-state's `max_by(version)` projection. `runtime_state_read`
returns the current state per id (not up to 20 stale copies); the raw sidecar still stores
history. `readRuntimeStateRows` and the v2 fingerprint formula are unchanged.

## Requirements

- Functional: re-recording an existing row `id` appends a new row with `version = maxExisting+1`;
  `runtime_state_read` collapses to one row per `id` (the `max_by(version)` row, ties broken by
  newest timestamp then file order). First record of an id is `version: 0`.
- Non-functional: `readRuntimeStateRows` stays raw (every row, unchanged contract) — the inbound
  gate and history depend on it. v2 fingerprint formula is unchanged (version is not hashed). No
  row migration: existing unversioned rows default to `version: 0` at read time.

## Architecture

- `core/runtime-state.js`:
  - `appendLedgerEvent(root, row)`: before writing, scan existing rows for the same `id`,
    compute `version = (max version for that id, default -1) + 1`, set `row.version`. Then
    compute fingerprint (v2, unchanged) and append.
  - New `readRuntimeStateRowsLatest(root)`: read raw, group by `id`, keep the row with the
    highest `version` (ties → newest `timestamp`, then last in file order). Returns the
    deduped array (order: first-seen by id in file order).
  - `readRuntimeStateRows(root)`: unchanged.
  - `computeFingerprint` / `verifyRow`: unchanged (v2; version not in hash).
- `tools/handlers/runtime-state-read-tool.js`: replace `readRuntimeStateRows` with
  `readRuntimeStateRowsLatest` for the read source; filters + `verifyRow` (against full raw
  row for the chosen latest) + compact projection unchanged. `total` now reflects the deduped
  count (computed before the `limit` slice, as today).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/runtime-state.js`
- Modify: `tools/learning-loop-mastra/tools/handlers/runtime-state-read-tool.js`
- Create: `tools/learning-loop-mastra/__tests__/runtime-state-versioned-dedup.test.js`
- Read-only context: `tools/learning-loop-mastra/core/inbound-state.js` (confirm it uses
  `readRuntimeStateRows` raw — must NOT change), existing
  `__tests__/runtime-state-fingerprint.test.js` (confirm v2 formula stays).

## Implementation Steps (TDD — tests first)

1. **Write the failing test** `__tests__/runtime-state-versioned-dedup.test.js`:
   - `appendLedgerEvent` twice with same `id` (distinct timestamps) into a temp root →
     `readRuntimeStateRows` returns 2 rows with `version` 0 and 1; `readRuntimeStateRowsLatest`
     returns 1 row whose `version` is 1 and `timestamp` is the second.
   - Third append same id → `readRuntimeStateRowsLatest` returns 1 row `version` 2.
   - Two different ids → `readRuntimeStateRowsLatest` returns 2 rows.
   - Pre-existing unversioned row (hand-written line, no `version`) + one append same id →
     latest is the appended row (`version` 1 > default 0).
   - `verifyRow` still true on the latest row (fingerprint formula unchanged).
   - `runtime_state_read` handler: record same id twice via the tool → response `total: 1`,
     `count: 1`, one row (the latest). (Drive the handler directly with a temp root;
     preflight marker present for `runtime_state_record`.)
2. Run `pnpm test:one <path>` → red (no `version`, no `readRuntimeStateRowsLatest`).
3. **Implement** `version` assignment in `appendLedgerEvent` + `readRuntimeStateRowsLatest`
   in `core/runtime-state.js`.
4. **Wire** `runtime_state_read` to `readRuntimeStateRowsLatest`.
5. Run `pnpm test:one` on the new test + `runtime-state-fingerprint.test.js` +
   `runtime-state-read-tool.test.js` → green.
6. Grep consumers: `rg "readRuntimeStateRows|runtime_state_read"` — confirm only the read-tool
   and tests reference the deduped path; inbound-state.js still uses raw `readRuntimeStateRows`.

## Success Criteria

- [ ] Same-id re-records collapse to one latest row in `runtime_state_read`; history preserved
      in `readRuntimeStateRows`.
- [ ] `version` is 0 for first record, increments on re-record; absent version reads as 0.
- [ ] v2 fingerprint + `verifyRow` unchanged; existing fingerprint tests green.
- [ ] `inbound-state.js` read path raw and unchanged.

## Risk Assessment

- **Read-contract change.** `runtime_state_read` consumers that expected N stale copies break.
  Mitigation: TDD pin + consumer grep. The MCP read is operator-facing; no automated consumer
  depends on stale copies (the inbound gate uses the raw reader).
- **O(n) version scan per append.** Acceptable at operator scale; documented in code comment.
  Low risk; no cache for now (YAGNI).
- **Rollback.** Revert the two file changes; the sidecar is forward-compatible (extra
  `version` field is ignored by old readers; old rows without `version` default to 0).
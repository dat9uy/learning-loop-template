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
  - `appendLedgerEvent(root, row)`: wrap the scan-then-append in `withRegistryLock(root, …)`
    (the cross-process file lock `core/meta-state.js` uses via `core/registry-lock.js` — NOT
    just an in-process queue; the `.claude` runtime's CLI one-shots are separate processes, so
    only a file lock prevents two writers both reading max=N and both appending version=N+1).
    Inside the lock: scan existing rows for the same `id`, compute
    `version = (max version for that id, default -1) + 1`, set `row.version`; then compute
    fingerprint (v2, unchanged) and append. Without the lock, concurrent `runtime_state_record`
    + `meta_state_dispatch_finding` (or two sessions sharing `GATE_ROOT`) collide versions and
    silently lose a write — defeating GAP 1.
  - New `readRuntimeStateRowsLatest(root)`: read raw, group by `id`, keep the row with the
    highest `version`. Tie-break: newest `timestamp` with a `timestamp ?? ""` fallback (mirroring
    meta-state's `created_at ?? ""` at `core/meta-state.js:768-769`), then last in file order.
    Missing/unparseable timestamps sort as `""` (oldest), so a re-record with a real timestamp
    wins over a legacy unversioned row lacking one. Returns the deduped array (order:
    first-seen by id in file order).
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
  `readRuntimeStateRows` raw at `inbound-state.js:13,89` — must NOT change), existing
  `__tests__/runtime-state-fingerprint.test.js` (confirm v2 formula stays),
  `core/registry-lock.js` + `core/meta-state.js:768-769,1042-1043` (the cross-process
  `withRegistryLock` to wrap the scan-then-append, and the `created_at ?? ""` tie-break precedent).

## Implementation Steps (TDD — tests first)

1. **Write the failing test** `__tests__/runtime-state-versioned-dedup.test.js`:
   - `appendLedgerEvent` twice with same `id` (distinct timestamps) into a temp root →
     `readRuntimeStateRows` returns 2 rows with `version` 0 and 1; `readRuntimeStateRowsLatest`
     returns 1 row whose `version` is 1 and `timestamp` is the second.
   - Third append same id → `readRuntimeStateRowsLatest` returns 1 row `version` 2.
   - Two different ids → `readRuntimeStateRowsLatest` returns 2 rows.
   - Pre-existing unversioned row (hand-written line, no `version`) + one append same id →
     latest is the appended row (`version` 1 > default 0).
   - Tie-break fallback: two unversioned rows same `id`, one with a missing `timestamp` → the
     row with a real timestamp wins; both missing → last-in-file wins.
   - `verifyRow` still true on the latest row (fingerprint formula unchanged).
   - `runtime_state_read` handler: record same id twice via the tool → response `total: 1`,
     `count: 1`, one row (the latest). (Drive the handler directly with a temp root;
     preflight marker present for `runtime_state_record`.)
   - **Concurrent-append race test** (validation decision — actually exercises the
     `withRegistryLock`, since the sequential tests never do): spawn two writers for the SAME
     `id` concurrently (two `node` child processes or `Promise.all` of two `appendLedgerEvent`
     calls against the same temp root), then `readRuntimeStateRows` returns 2 rows with DISTINCT
     `version`s (0 and 1, no collision) and `readRuntimeStateRowsLatest` returns one row. Assert
     no two rows share `version` for the same `id`. This is the only coverage for the Critical
     TOCTOU fix; the sequential TDD tests stay green whether or not the lock works.
2. Run `pnpm test:one <path>` → red (no `version`, no `readRuntimeStateRowsLatest`).
3. **Implement** `version` assignment in `appendLedgerEvent` (scan-then-append wrapped in
   `withRegistryLock`) + `readRuntimeStateRowsLatest` (with `timestamp ?? ""` tie-break) in
   `core/runtime-state.js`.
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
  Mitigation: TDD pin + consumer grep. The change affects BOTH transports (`runtime_state_read`
  is in `CLI_READ_TOOLS` at `core/cli-tools.js:32`, not just MCP); `readRuntimeStateRows` raw
  consumers (inbound gate `core/inbound-state.js:89`, file-readers, dispatch idempotency scan)
  are unchanged.
- **TOCTOU on scan-then-append (mitigated).** Bare `appendFileSync` would let concurrent writers
  collide `version`. Mitigation: `withRegistryLock` (cross-process file lock) wraps the
  scan-then-append, mirroring `core/meta-state.js:1042-1043`. The TDD test is sequential, so the
  race is not exercised by green tests — add a concurrent-append test if the sidecar ever goes
  multi-writer hot.
- **O(n) version scan per append.** Acceptable at operator scale; documented in code comment.
  Low risk; no cache for now (YAGNI — and dead code on the CLI one-shot path).
- **Rollback asymmetry.** The read direction is forward-compatible (extra `version` ignored by
  old readers; old rows without `version` default to 0). The WRITE direction has a hole: after
  rollback, old code writes rows without `version` (read as 0); if a stale versioned row (v≥1)
  for the same `id` remains, it wins and shadows the post-rollback re-record — the operator's
  update is silently lost. Mitigation: document that post-rollback re-recording requires pruning
  any versioned rows for the affected id first (assigning `max(existing,0)+1` even for
  versionless input would require the version logic to survive rollback, contradicting a clean
  revert).
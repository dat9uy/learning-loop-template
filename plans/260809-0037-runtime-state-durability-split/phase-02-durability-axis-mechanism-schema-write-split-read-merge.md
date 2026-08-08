---
phase: 2
title: "Durability axis mechanism (schema + write-split + read-merge + namespace guard)"
status: pending
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Durability axis mechanism (schema + write-split + read-merge + namespace guard)

## Overview
Add the `durability` axis to the mechanism surface so the write path routes by it, the read path merges across both substrates, and — critically — the namespace↔durability invariant is **structurally enforced at the record-tool boundary** (red-team #4, strengthened). Also land the gate-verb-allowance incantation `durability:"ephemeral"` edit here so it ships *with* the guard (red-team #8) — otherwise the guard breaks the allowance flow. Tests-first.

## Requirements
- Functional: `runtime_state_record` accepts optional `durability: "durable" | "ephemeral"` (default `durable`); `appendLedgerEvent` routes durable→`runtime-state.jsonl`, ephemeral→`.loop/runtime-state-local.jsonl`; the **version scan is destination-scoped** (reads only the destination file, not the merged union — red-team #6); `readRuntimeObservations`/`readRuntimeStateRows` (read-side only) union both substrates before collapse.
- **Namespace↔durability guard (red-team #4, symmetric, load-bearing):** the record tool rejects any row that violates `affected_system.startsWith("gate-verb:")` ⟺ `durability:"ephemeral"`. I.e. `gate-verb:*` rows MUST be `ephemeral`; non-`gate-verb` rows MUST be `durable` (default). This structurally enforces "a durable and ephemeral row never share an id" for ALL surfaces — resolving the per-file version-collision class (red-team #6/#15) and the migration-predicate safety (red-team #10) at the boundary, not as a deferred risk.
- **Incantation edit lands here (red-team #8):** the bash-gate self-remediating block message and the `gate-verb-allowance` `loop_get_instruction` key emit `durability:"ephemeral"` in the 2-call incantation, so an operator who copies it records to the local substrate. This MUST ship with the guard: once the guard rejects durable `gate-verb:*` rows, a stale incantation (no `durability`) would be rejected and the allowance flow would break.
- Non-functional: back-compat — every existing caller that omits `durability` and writes a non-`gate-verb` row keeps writing to the committed file; every existing committed row (no `durability` field) reads as `durable`; the merged read is transparent to the bash-gate gate-verb check and the inbound gate.

## Architecture
- **Schema** (`schemas/runtime-state.schema.json`): add `durability` enum `["durable","ephemeral"]`, optional, mirroring the L2 contract. NOTE (red-team #14): the JSON schema is NOT the live enforcement layer — its `affected_system` enum is already stale (lacks `gate-verb:*`, which is derived dynamically in `AFFECTED_SYSTEM_ENUM_RUNTIME` from `patterns.json`). The live boundary is the record tool's **zod** schema. Add the field to both for documentation, but test enforcement against zod, not the JSON schema. Reconciling the stale JSON enum is out of scope (separate drift).
- **Write split + destination-scoped version scan** (`core/runtime-state.js`, red-team #6): `appendLedgerEvent(root, row)` resolves destination from `row.durability ?? "durable"` → `RUNTIME_STATE_FILENAME` or `RUNTIME_STATE_LOCAL_FILENAME` (new const, `.loop/runtime-state-local.jsonl`). The `max(version)+1` scan reads ONLY the destination file (a new destination-scoped read helper, e.g. `readRuntimeStateRowsForFile(root, filename)`) — NOT the merged `readRuntimeStateRows`, which is read-side-only. This makes per-destination versioning real, not contradicted by the union scan.
- **Export the path const (red-team #11):** export `RUNTIME_STATE_FILENAME` from `core/runtime-state.js`. Replace the hardcoded `"runtime-state.jsonl"` in `core/gate-override.js:89` with an import. Document the two other append paths as **durable-only**: `appendOrFindDispatchLedgerEvent` (`core/runtime-state.js:180-205`, used by `meta_state_dispatch_finding`) and `gate-override.js#appendOverrideAudit` — both write `ledger-event` (durable audit), so they correctly target the committed file and do not need routing. Add a comment naming them so a future "ephemeral dispatch row" change routes through `appendLedgerEvent` explicitly.
- **Read merge** (`core/file-readers.js` + `core/runtime-state.js`): `readRuntimeStateRows(root)` (read-side) reads the committed file then concats the local file (missing local → `[]`). `readRuntimeStateRowsDetailed` tracks **per-substrate malformed counts** (red-team #7). `readBudgetTrackingState` throws only on malformed lines in the **committed** file (or the queried surface's rows) — a malformed line in the disposable local file must NOT poison durable writes. The read-gate (`readRuntimeObservations`) already fail-opens on error (returns `[]`), so the bash gate is unaffected; the fix targets the **write-path** fail-closed (`runtime_state_record`/`stop` catch `readBudgetTrackingState` and return `corrupt_state`). `collapseLatestById`/`collapseLatestBudgetStateById` operate on the union unchanged; the symmetric guard (#4) prevents cross-substrate same-id collisions so the existing tie-break (newest timestamp, then last-in-file — red-team #15) never mis-resolves across substrates.
- **Record tool** (`tools/handlers/runtime-state-record-tool.js`): add `durability: z.enum(["durable","ephemeral"]).optional()` to the zod schema; thread it to `appendLedgerEvent`. Add the **symmetric namespace guard** before the row build: if `affected_system.startsWith("gate-verb:")` then require `durability === "ephemeral"` (reject with `durability_namespace_mismatch`); else require `durability !== "ephemeral"` (default durable). The existing preflight + pause + canonical-id guards are unchanged.
- **Incantation (red-team #8):** locate the self-remediating block-message emitter (grep `gate-verb` / the 2-call incantation in `core/evaluate-bash-gate.js` or `core/gate-logic.js`) and the `gate-verb-allowance` `HINT_REGISTRY` entry; add `durability:"ephemeral"` to the `runtime_state_record` call in the emitted incantation so the operator's copied call routes to local and passes the guard.

## Related Code Files
- Modify: `schemas/runtime-state.schema.json`, `tools/learning-loop-mastra/core/runtime-state.js` (export `RUNTIME_STATE_FILENAME` + new `RUNTIME_STATE_LOCAL_FILENAME` + destination-scoped scan + per-substrate malformed + read merge), `tools/learning-loop-mastra/core/file-readers.js`, `tools/learning-loop-mastra/core/gate-override.js` (import the const), `tools/learning-loop-mastra/tools/handlers/runtime-state-record-tool.js` (zod `durability` + symmetric guard), the bash-gate block-message emitter + `gate-verb-allowance` HINT_REGISTRY entry (incantation `durability:"ephemeral"`).
- Create: `tools/learning-loop-mastra/__tests__/runtime-state-durability-split.test.js`.

## Implementation Steps (TDD — tests first)
1. **Write the failing tests** (`runtime-state-durability-split.test.js`), in a temp `root`:
   - `runtime_state_record({affected_system:"gate-verb:node", durability:"ephemeral", ...})` → row in `.loop/runtime-state-local.jsonl`, NOT `runtime-state.jsonl`.
   - `runtime_state_record({affected_system:"vnstock", ...})` (no durability) → row in `runtime-state.jsonl` (back-compat).
   - **Symmetric guard:** `runtime_state_record({affected_system:"gate-verb:node", durability:"durable"})` → rejected `durability_namespace_mismatch`; `runtime_state_record({affected_system:"vnstock", durability:"ephemeral"})` → rejected `durability_namespace_mismatch`.
   - **Destination-scoped versioning (red-team #6):** a durable row under `id:"x"` at version 0 in committed; an ephemeral row under a *different* `id` at version 0 in local (ids can't collide post-guard). Then a second ephemeral row under the same ephemeral id → version 1 in local. The durable row's version is unaffected (the scan read only the destination file).
   - `readRuntimeObservations` over a root with a committed durable lifecycle row AND a local ephemeral allowance row → projects both.
   - Fresh-clone sim: root with no `.loop/runtime-state-local.jsonl` → `readRuntimeStateRows` returns only committed rows; no throw.
   - **Per-substrate malformed (red-team #7):** a malformed line in the local file does NOT make `runtime_state_record({affected_system:"vnstock"})` return `corrupt_state`; a malformed line in the committed file DOES.
   - Schema/zod: record-tool zod accepts `durability` enum; rejects an unknown value; absent `durability` validates. (Test zod, not the JSON schema — red-team #14.)
   - **Incantation (red-team #8):** the emitted block-message incantation for a gate-verb block contains `"durability":"ephemeral"` (or `durability:ephemeral`); regression test pins it.
2. Run `pnpm test --changed` → red.
3. Add `RUNTIME_STATE_LOCAL_FILENAME` const; export `RUNTIME_STATE_FILENAME`; add the destination-scoped read helper; make `appendLedgerEvent` route by `row.durability ?? "durable"` and scan only the destination file.
4. Make `readRuntimeStateRows`/`readRuntimeStateRowsDetailed` (read-side) concat the local file; track per-substrate malformed; make `readBudgetTrackingState` throw only on committed-file malformation.
5. Add the `durability` field to the JSON schema (documentation) + record-tool zod; add the symmetric namespace guard; thread `durability` to `appendLedgerEvent`.
6. Import `RUNTIME_STATE_FILENAME` in `gate-override.js`; add the durable-only-append-paths comment.
7. Add `durability:"ephemeral"` to the block-message + hint incantation.
8. Run `pnpm test --changed` → green; run the full `runtime-state-*` + bash-gate + inbound-gate + gate-override suites → green.

## Success Criteria
- [ ] All new durability-split tests green (incl. symmetric guard, destination-scoped versioning, per-substrate malformed, incantation).
- [ ] Existing `runtime-state-versioned-dedup`, `runtime-state-no-delete-to-clear-gate`, `evaluate-bash-gate`, `evaluate-inbound-gate`, `runtime-state-metadata-validation`, `gate-override` suites green — no regression.
- [ ] The symmetric guard rejects cross-namespace durability at the record-tool boundary (no `vnstock` ephemeral, no durable `gate-verb:*`).
- [ ] `appendLedgerEvent`'s version scan is destination-scoped (no union-wide scan on the write path).
- [ ] A malformed local line does not block durable writes.
- [ ] The gate-verb block-message incantation includes `durability:"ephemeral"`.

## Risk Assessment
- **Symmetric guard over-restricts a legitimate future durable `gate-verb:*` ledger-event** (Low-Medium). The guard rejects `durability:"durable"` for `gate-verb:*`. If the loop later wants to durably audit "a gate-verb allowance was granted" as a committed `ledger-event` under a `gate-verb:*` affected_system, the guard blocks it. Observable signal: a `ledger-event` audit need for gate-verb surfaces. Pre-decided response: by the L1/L2 contract, gate-verb allowances are ephemeral (session-scoped, TTL'd); a durable gate-verb row is a category error. If a durable gate-verb audit is genuinely needed, that is a contract change — re-debate the L1 durability axis, then relax the guard for `ledger-event` specifically. Do not silently relax it.
- **Read merge performance** (Low). The gate reads on every bash command; the local file is small (session-scoped). Negligible.
- **`RUNTIME_STATE_FILENAME` external references** (Low, red-team #11). grep confirmed `gate-override.js` hardcodes the string; the dispatch path uses its own `appendFileSync`. Both are addressed (import + comment). No other external import.
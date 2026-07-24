<!-- final summary: ship-ready report for plan 260724-1119 -->

# Plan 260724-1119 — Final summary

**Status:** Shipped (all 3 phases complete, full test suite green except pre-existing `cold-tier-regression` age-stale failure unrelated to this plan).

## Behavioral payoff

The "27 stale active observations" warning is gone. `evaluateInboundGate` now returns `decision: ok` with **0 stale observations** against the real `runtime-state.jsonl` after the vnstock collapse migration. Row count: **34 rows** (was 33; the +1 is the terminal `stopped` budget-state row — no destructive deletion).

## What changed

| Surface | Change |
|---|---|
| `schemas/runtime-state.schema.json` | `status` enum: `["initial","active","paused","stopped"]` (was `["active","cleared","reconciled"]`) |
| `core/runtime-state.js` | Added `readBudgetTrackingState(root, surface)` (kind-filtered, throws on corrupt). `appendLedgerEvent` enforces kind→status rule. `pruneSurfaceRows` removed. |
| `core/runtime-tracking.js` | `isSurfacePaused` reads `readBudgetTrackingState` (in-band). Legacy sidecar helpers are no-op shims. |
| `core/file-readers.js` | `readRuntimeObservations` filters `kind === "budget-state"` + `status === "active"` (R5). |
| `core/inbound-state.js` | `checkObservationStaleness` filters same kind+status before per-obs check. |
| `tools/handlers/runtime-state-pause-tool.js` | Appends in-band `kind: budget-state, status: paused` under canonical id (D8). Rejects from `stopped` (D1). |
| `tools/handlers/runtime-state-resume-tool.js` | Appends `status: active` version. |
| `tools/handlers/runtime-state-stop-tool.js` (NEW) | Non-destructive terminal retire. Requires preflight + `confirm: true`. |
| `tools/handlers/runtime-state-read-tool.js` | Added `include_all_versions` parameter (FailureMode #2). |
| `tools/handlers/runtime-state-record-tool.js` | Kind-conditional status enforcement. Fresh-id records allowed on stopped surfaces (D1). |
| `tools/handlers/runtime-state-prune-surface-tool.js` | **REMOVED** (D4). |
| `tools/handlers/agent-manifest.json` | `prune_surface` → `stop` |
| `agent-manifest.json` | Same |
| `tools/manifest.json` + `tools/handlers/manifest.json` | Same |
| `core/cli-tools.js` `CLI_WRITE_TOOLS` | Same |
| `hooks/universal/session-start-inject-discoverability.cjs` `WRITE_TOOL_SKETCHES` | Same |
| `runtime-state.jsonl` | +1 budget-state row (vnstock canonical, `status: stopped`); 33 ledger-event rows preserved |
| `docs/architecture.md` | § Budget tracking lifecycle flipped to shipped; prune paragraph removed |
| `docs/runtime-contract.md` | L2 contract added (kind discriminator, D1, D8, prune removal) |
| `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md` | prune → stop entries |
| 4 test files | Fixtures updated `kind: ledger-event` → `kind: budget-state, status: active` |
| `__tests__/runtime-tracking.test.js` | REWRITTEN to test in-band lifecycle |
| `__tests__/runtime-state-prune-surface.test.js` | DELETED |
| `__tests__/runtime-state-no-delete-to-clear-gate.test.js` (NEW) | Phase 1 regression guard |
| `__tests__/runtime-state-vnstock-collapse-e2e.test.js` (NEW) | Phase 3 e2e |
| `meta-state.jsonl` | `meta-260724T1312Z-runtime-state-jsonl` change-log entry |

## Red-team findings disposition

All 12 red-team findings from the `--deep` gate applied inline:
- R1 (corrupt-rows throws): `readBudgetTrackingState` throws; gate callers catch + degrade
- R2 (preflight TTL): kept operator-controlled (gate_mark_preflight stamps fresh ts on every call)
- R3 (Zod refine trap): avoided by reusing `status` field (D5), no new field
- R4 (inverting assertions): 4+ test files updated with budget-state fixtures
- R5 (kind filter not in readRuntimeStateRowsLatest): explicit kind+status guards on both readers
- R6 (TOCTOU): documented (pre-existing; not regressed)
- R7 (gate-override bypass): documented, not routed (in-band model avoids the need)
- R8 (regression guard `===`): assertion uses `>=`
- R9 (id collision): canonical id = surface name (`vnstock`), NOT the shared `vnstock-device-slot-2026-05-08T10:17:23Z`
- R10 (sidecar deny-list narrow scope): kept as no-op defenses (nothing writes the sidecar)
- R11 (kind-blind dedup): `readBudgetTrackingState` filters kind BEFORE `max_by(version)`
- R12 (session-start dispatch audit): unaffected (dispatch stays ledger-event)

## Test results

- **Total:** 2471 passed, 1 skipped, 1 failed (pre-existing)
- **Pre-existing failure:** `cold-tier-regression.test.js` — 16 age-stale mechanism_check findings exceed threshold 11. Pure meta-state age issue; not in scope for this plan.
- **New tests added:** 3 files, 18 tests, all passing.

## Files changed

40 modified, 3 added, 1 deleted (prune handler + test):
- New: `tools/learning-loop-mastra/__tests__/runtime-state-no-delete-to-clear-gate.test.js`
- New: `tools/learning-loop-mastra/__tests__/runtime-state-vnstock-collapse-e2e.test.js`
- New: `tools/learning-loop-mastra/tools/handlers/runtime-state-stop-tool.js`
- Deleted: `tools/learning-loop-mastra/tools/handlers/runtime-state-prune-surface-tool.js`
- Deleted: `tools/learning-loop-mastra/__tests__/runtime-state-prune-surface.test.js`

## Verification

```bash
$ node -e "const {evaluateInboundGate}=require('./tools/learning-loop-mastra/core/evaluate-inbound-gate.js'); \
  const r=evaluateInboundGate({prompt:'I cleared the device slot',root:process.cwd()}); \
  console.log('decision:',r.decision,'observations_stale:',r.observations_stale?r.observations_stale.length:0);"
decision: ok observations_stale: 0
```

## Migration commands used (operator-audited)

```bash
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs gate_mark_preflight '{"surface":"runtime-tracking"}'
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs runtime_state_stop '{"surface":"vnstock","confirm":true}'
LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs meta_state_log_change '...'
```

## Loop metadata

- `meta-260724T1312Z-runtime-state-jsonl` (change-log, surface, runtime-state.jsonl): Phase 2+3 surface change

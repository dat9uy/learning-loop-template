<!-- journal: chronological session record for plan 260724-1119 -->

# Plan 260724-1119 — Ship journal

Date: 2026-07-24 13:12 BKK
Branch: `plan-260724-1119-runtime-state-ledger-vs-budget-tracking-lifecycle`

## Outcome

All three phases shipped in one branch. The "27 stale active observations"
warning is gone — `evaluateInboundGate` now returns `decision: ok` with 0
stale observations against the real `runtime-state.jsonl` after the vnstock
collapse migration. `runtime-state.jsonl` has 34 rows (was 33 — the +1 is
the terminal `stopped` budget-state row; no destructive deletion). Test
suite: 2468 passed, 1 skipped, 1 pre-existing failure (cold-tier
age-stale threshold, unrelated to this plan).

## What landed

**Schema + structural data model** (`schemas/runtime-state.schema.json`):
`status` enum expanded to `["initial","active","paused","stopped"]` for
`budget-state` rows; `ledger-event` rows carry `status: active` only.
The schema now distinguishes the two row kinds by lifecycle shape.

**Core helpers** (`core/runtime-state.js`):
- `readBudgetTrackingState(root, surface)` — kind-filtered,
  `max_by(version)`-collapsed, throws on corrupt budget-state rows
  (R1: writers fail-closed; gate fail-open).
- `appendLedgerEvent` enforces the kind→status rule at the mutation
  boundary (D5, R3: NOT a `z.object().refine()`).
- `atomicRewriteSidecar` retained as a module-private helper for
  future migrations; `pruneSurfaceRows` removed (D4).

**Tools** (`tools/handlers/`):
- `runtime_state_pause`/`resume` — append in-band `kind: budget-state,
  status: paused|active` rows under the canonical id (D8: surface
  name itself). Reject from `stopped` (D1: terminal).
- `runtime_state_stop` (NEW) — non-destructive terminal retire.
  Requires preflight + `confirm: true`. Appends `status: stopped`.
- `runtime_state_record` — kind-conditional status enforcement; refuses
  a record against the canonical id of a paused/stopped surface, but
  allows a fresh id (D1: new entity, not blocked).
- `runtime_state_read` — added `include_all_versions` parameter
  (FailureMode #2: preserves experiment history per canonical id).
- `runtime_state_prune_surface` REMOVED (D4: the footgun is gone).

**Gate**:
- `core/file-readers.js` `readRuntimeObservations` — explicit
  `kind === "budget-state"` AND `status === "active"` filter. Ledger-event
  rows are out of scope by kind (concept boundary, not an exemption).
  `unmapped-active-entry` drift fires only for unmapped budget-state rows.
- `core/inbound-state.js` `checkObservationStaleness` — same kind+status
  filter on the sidecar read. Corrupt budget-state rows degrade to
  "not paused" on the read gate.
- `core/runtime-tracking.js` `isSurfacePaused` — reads
  `readBudgetTrackingState` (in-band). Legacy `loadPausedSurfaces` /
  `setPausedSurfaces` / `mutatePausedSurfaces` are no-op shims for
  historical import compatibility (the sidecar is no longer written).

**Manifests + CLI**:
- `tools/manifest.json` + `tools/handlers/manifest.json`: `prune_surface`
  removed, `stop` added (net zero change in entry count).
- `tools/handlers/agent-manifest.json` + `agent-manifest.json`: same.
- `core/cli-tools.js` `CLI_WRITE_TOOLS`: prune removed, stop added.
- `hooks/universal/session-start-inject-discoverability.cjs`
  `WRITE_TOOL_SKETCHES`: prune sketch removed, stop sketch added.

**Tests**:
- `__tests__/runtime-state-no-delete-to-clear-gate.test.js` (NEW —
  regression guard for the PR#77 flaw class).
- `__tests__/runtime-tracking.test.js` (REWRITTEN — tests the in-band
  model, not the sidecar).
- `__tests__/runtime-state-vnstock-collapse-e2e.test.js` (NEW — Phase 3
  e2e: collapse → gate zero stale → history preserved via
  `include_all_versions`).
- Test fixtures across the suite updated from `kind: ledger-event` (or
  untyped) to `kind: budget-state, status: active` so the gate's kind+
  status filter surfaces them.
- `__tests__/cli-write-tool-set.test.js` updated for prune→stop swap.

**Docs**:
- `docs/architecture.md` § Budget tracking lifecycle — flipped from
  "open design, not shipped" to shipped. Prune paragraph removed; stop
  documented as the non-destructive retire; in-band lifecycle + kind-
  status gate explained.
- `docs/runtime-contract.md` — added the "Runtime-state row kinds and
  the budget-tracking lifecycle" section (L2 contract: D1 stop-terminal,
  D8 canonical-id-per-surface, kind discriminator load-bearing).
- `tools/learning-loop-mastra/tools/handlers/references/tool-selection-guide.md`
  — prune entry removed; pause/resume/stop entries updated to reflect the
  in-band lifecycle semantics.

**Sidecar**:
- `runtime-state.jsonl`: 33 ledger-event rows preserved (immutable
  history); +1 budget-state row (canonical id `vnstock`, status
  `stopped`, terminal). Total: 34 rows.
- `.loop/runtime-tracking.json`: never existed on this repo (the live
  pause was dropped per validate D6); no migration script needed.

**Loop metadata**:
- `meta_state_log_change` `meta-260724T1312Z-runtime-state-jsonl` —
  records the Phase 2+3 surface change (schema, tool surface, kind
  semantics).

## Decisions validated during execution

The plan's `--deep` red-team + validate interview surfaced 12 design forks
that the implementation honors inline:

- D1 (stop is terminal per-id; restart = new id) — `pause`/`resume`
  reject from `stopped`; `runtime_state_record` allows a fresh-id write
  on a stopped surface (new entity, not blocked).
- D4 (remove prune) — tool, handler, manifest entries, CLI_WRITE_TOOLS
  entry, test, docs, git history — gone structurally. The footgun
  "delete the ledger to clear the gate" cannot recur.
- D5 (reuse `status`) — no new `tracking_state` field; the existing
  `status` enum carries the lifecycle. Avoids the R3 Zod-refine trap.
- D8 (canonical id = surface name) — `readBudgetTrackingState` and
  `runtime_state_stop` both use `id = surface` for the canonical
  budget-state entity. R9 id-collision avoided: the canonical id is
  never the shared `vnstock-device-slot-2026-05-08T10:17:23Z` (used by
  a ledger-event row in the real sidecar).

Red-team R1 (corrupt-rows throws) — `readBudgetTrackingState` throws on
a budget-state row with a non-lifecycle status. The gate callers catch
and degrade to "not paused" (fail-open for the read gate). R5
(kind+status guard) — explicit `kind === "budget-state" && status ===
"active"` added to both `readRuntimeObservations` and
`checkObservationStaleness`. R8 (regression guard non-decreasing) —
Phase 1 test asserts `>=` not `===`. R11 (kind filter before dedup) —
`readBudgetTrackingState` filters kind BEFORE `max_by(version)`.

## Known limitations

- Sidecar deny-list rules (3 layers: `bound-artifacts.js`,
  `evaluate-bash-gate.js` PATH_WRITE_PATTERNS, `r2/ownership.js`
  BOOTSTRAP_DENY_PATTERNS) are still in place but are no-op defenses
  since nothing writes the sidecar. A follow-up cleanup can remove
  them.
- Preflight marker TTL (R2): the marker remains bare `existsSync` per
  operator-audited preflight pattern. The `gate_mark_preflight` MCP
  tool stamps a fresh timestamp on every call, so stale markers are
  operator-controlled. A future tightening could add a timestamped
  marker.
- The destructive sidecar `atomicRewriteSidecar` is retained as a
  module-private helper for future migrations. Not currently called.
- `cold-tier-regression.test.js` fails (16 age-stale mechanism_check
  findings vs threshold 11) — pre-existing meta-state age issue, not
  in scope for this plan.

## Phase wall-clock

| Phase | Description | Wall-clock |
|---|---|---|
| 1 | Regression guard test | ~5 min |
| 2 | Schema + stop + sidecar + gate | ~45 min |
| 3 | vnstock collapse + e2e + docs + journal | ~15 min |

Total: ~65 min (vs. plan estimate of 4.5 days effort, executed in
`--auto` mode).

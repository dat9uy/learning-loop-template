---
title: "CLI Context Savings Measurement and Ledger Dogfood"
description: "Close meta-260722T1546Z: make the CLI transport's context savings measured, reproducible, ledger-recorded, and regression-guarded"
status: complete
priority: P1
effort: "1.5d"
tags: [loop-anti-pattern, context-cost, dogfood, tdd]
created: 2026-07-26
---

# CLI Context Savings Measurement and Ledger Dogfood

## Overview

Close finding `meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch`
(open, warning, loop-anti-pattern). The CLI transport's context savings were
measured once by hand (29.9 KB / 94% per session start) with a deleted
throwaway script. This plan systematizes it: a pure wire-byte computation
module (TDD), a committed measurement script that emits a
`runtime_state_record` ledger row per run, and a vitest regression guard
chained to the existing banner byte budget via a shared constant. Predict
report: `plans/reports/predict-260726-1948-systematize-context-cost-analysis.md`
(verdict CAUTION, Phase 1 scope).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pure, unit-tested savings-delta computation (wire def bytes for CLI_TOOLS vs banner bytes) | P1 |
| 2 | Committed measurement entry point (`pnpm measure:context`) emitting a `runtime_state_record` ledger row per run (script mints its own preflight marker) | P1 |
| 3 | Vitest regression guard: byte-accuracy + savings floor derived from the live CLI_TOOLS set, banner budget shared via `__tests__/banner-budget.js` | P1 |
| 4 | Resolve the finding only after a recorded run is verified via `runtime_state_read` and gate-rule enumeration | P1 |

## Non-Goals

- Runtime-owned surface telemetry (system prompt, built-in tool defs) — Phase 2 of the predict report, separate plan.
- CI wiring of the measurement — manual-first; escalate only after ledger evidence shows cadence is useful.
- Changes to `measure-context-surfaces.mjs` (it measures MCP-surface absolutes via live `tools/list`; this plan adds the CLI *delta* via static manifest + dynamic import; the predict report's "extend, don't fork" guidance is acknowledged in Phase 2's Risk Assessment with the test-isolation rationale).
- Sharing preflight across operators — the script mints its own marker (TTL 30 min covers a single `--record` invocation); no cross-operator coupling.

## Key Design Decisions (verified against source)

- **Wire bytes, not manifest stubs**: dropped bytes = `byteLength(JSON.stringify(wireDef))` per CLI_TOOLS member where `wireDef = {name, description, inputSchema: z.toJSONSchema(legacy.schema, {target:"draft-7", io:"input"})}`. Manifest entries at `tools/manifest.json:25-66` carry only `{file, export, pathFields}` (no `name`); name resolution comes from each handler's `legacy.name` via dynamic import. The parity view at `mastra/create-loop-tool.js:24-63` (line 63 mutates `schema._zod.toJSONSchema`) must be used so the byte count reflects the parity schema MCP clients see. Fidelity boundary (post-review clarification): the counted `name` is `legacy.name`, NOT the MCP-surface `mastra_<name>` registered at `mastra/server.js:43,74-76`, and the parityJson excludes `legacy.parityJsonSchemaHints` (merged at `create-loop-tool.js:39-45`). Both are constant per-tool offsets (~8 B × N tools + a few bytes on the one hinted tool) that do not affect regression detection or `savings_pct`; excluding them keeps the ledger time-series comparable across formula revisions. Live MCP-wire parity is owned by `mcp-tools-list-parity.test.js`. Manifest stub bytes (~85 B × 30 tools ≈ 2.5 KB) measure the wrong quantity.
- **JSONC parsing**: parse with the full-line-comment strip regex `.replace(/^\s*\/\/.*$/gm, "")` from `mastra/server.js:34`. Do not add a JSONC dependency. Acknowledged duplication: this adds a 3rd copy (after `server.js:34` and `bin/loop.mjs:54`).
- **Ledger row shape** (from `runtime-state-record-tool.js:148-159`): `affected_system: "runtime-state"`, `kind: "ledger-event"`, `status: "active"` (REQUIRED — `assertKindConditionalStatus` at `runtime-state.js:288-308` rejects ledger-event rows without it; the canonical handler sets it at line 156), `source_ref` MUST match `^local:meta-state:.+` → cite the finding id. `value` = savings_bytes (number), `delta` = number | null, `metadata` = typed flat object (`dropped_def_bytes: int`, `banner_bytes: int`, `savings_pct: number (1 decimal)`, `cli_tool_count: int`) — v2 fingerprint hashes metadata canonicalized (`runtime-state.js:213-217`), so type drift breaks `verifyRow`.
- **Ledger id**: `ctx-savings-<ISO>-<pid>` — pid suffix prevents same-millisecond collisions. `appendLedgerEvent` (`runtime-state.js:266-281`) does NOT dedupe on id+kind; that dedupe belongs to `appendOrFindDispatchLedgerEvent:131-152` (used by `meta_state_dispatch_finding`, not by `runtime_state_record`).
- **Previous-row lookup**: `runtime_state_read` has no `id_prefix` filter (`runtime-state-read-tool.js:19-34` accepts only `affected_system, kind, since, until, limit, compact, include_all_versions`). Script uses `include_all_versions: true` and filters client-side (`id.startsWith("ctx-savings-")`), sorts by `timestamp` DESC, picks index 1 as prior. First run → empty → `delta: null`.
- **Banner bytes**: import `buildTransportBanner` from `hooks/universal/session-start-inject-discoverability.cjs` (exported at line 418), both variants (reads-only, records-via-cli); take max. Banner budget (4096) extracted to shared constant in `__tests__/banner-budget.js` — both tests import it (no inline literals).
- **Preflight handling**: the script mints its own `.loop-preflight-runtime-state` marker (`{completed_at: now()}`) before the record spawnSync, matching `hasSurfacePreflightMarker` shape at `runtime-tracking.js:51-64`. 30-min TTL (`runtime-tracking.js:37`) covers a single `--record` run. Marker is a coordination marker, not a record (direct file write is permitted; records are still exclusively via the CLI tool).
- **Tests never write the ledger**: recording happens only via the script's explicit `--record` flag. Vitest covers the pure computation only; the shape test asserts the script's stdout without `--record`.
- **SpawnSync convention**: absolute `bin/loop.mjs` path + `cwd: root` + `GATE_ROOT=root` + `LOOP_SURFACE` from env (`.claude` default). Mirrors `measure-context-surfaces.mjs:17-19,38`.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Delta Computation Module (TDD)](./phase-01-delta-computation-module.md) | Complete |
| 2 | [Measurement Script + Ledger Record](./phase-02-measurement-script-ledger-record.md) | Complete |
| 3 | [Regression Guard + Finding Resolution](./phase-03-regression-guard-finding-resolution.md) | Complete |

## Success Criteria

- [x] `pnpm measure:context` prints `{dropped_def_bytes, banner_bytes, savings_bytes, savings_pct}` and `--record` appends a verifiable ledger row (works from a fresh shell; script mints preflight)
- [x] `runtime_state_read` returns the recorded row after a `--record` run
- [x] New vitest guard fails when a CLI tool's wire bytes stop being counted correctly (byte-accuracy assertion) or the banner re-bloats past the shared `BANNER_BYTES_BUDGET`
- [x] Finding `meta-260722T1546Z` resolved with `local:meta-state:` citation to the evidence, after gate-rule enumeration clears the path
- [x] `pnpm test` green

<!-- slug: cli-context-savings-measurement-and-ledger-dogfood -->

## Validation Log

### Session 1 — 2026-07-27
**Trigger:** Post-red-team validation (3 reviewers, 21 accepted findings, 0 rejected)
**Questions asked:** 4

#### Questions & Answers

1. **[Tradeoffs]** The plan uses `savings_pct >= 50` as the regression-tripwire floor (half the observed ~94% win). Is this the right tripwire level?
   - Options: 50% (half-of-94%) | 70% (catches tighter regressions) | 30% (very loose, signal-only)
   - **Answer:** 50% (half-of-94%, current plan)
   - **Rationale:** Deliberate tripwire. Catches catastrophic erosion (banner bloat, mass reclassification) but tolerates legitimate small drifts from individual tool schema growth. The predict-report magnitude (94%) is the anchor; halving is a stable ratio for any future "X%" measurement.

2. **[Architecture]** The predict report recommended `kind: 'context-savings-measurement'`, but the `runtime_state_record` schema only accepts `ledger-event` or `budget-state`. Plan uses `ledger-event`. How should this divergence be handled?
   - Options: Use ledger-event (current plan) | Add third `kind` value | Defer with TODO
   - **Answer:** Use ledger-event (current plan)
   - **Rationale:** Closed enum, no schema change. The `metadata` field carries the disambiguation if needed for future queries. Adding a third kind is scope creep; deferring leaves the dogfood loop unblocked but doesn't resolve the semantic question — `ledger-event` is the right answer because this IS a ledger event tracking a measurement.

3. **[Assumptions]** Phase 1's success criterion: "Wire-byte formula reproduces the finding's measured 31.8 KB magnitude (test asserts within ±10%)". Is ±10% the right tolerance?
   - Options: ±10% (current plan) | ±5% (strict) | ±20% (loose)
   - **Answer:** ±10% (current plan)
   - **Rationale:** Catches significant drift (28-34 KB window) while tolerating normal variation in JSON.stringify output across Node versions and zod schema evolution. ±5% would risk flakiness from cosmetic JSON changes; ±20% is too loose to catch real regressions.

4. **[Effort]** Total plan effort is 1.5d (Phase 1: 4h, Phase 2: 4h, Phase 3: 2h). The Phase 1 wire-byte work (dynamic import + z.toJSONSchema parity view per `create-loop-tool.js:24-63`) may surface additional gotchas. Realistic?
   - Options: 1.5d stays (current plan) | Bump to 2d | Reserve as TBD, fix after Phase 1 spike
   - **Answer:** 1.5d stays (current plan)
   - **Rationale:** Phase 1's 4h is achievable if the parity view is well-understood via the cited code path. The risk note in Phase 1 §Risk Assessment documents the gotcha surface (`z.toJSONSchema` parity view differs from MCP wire); if it surfaces in implementation, Phase 2's record step is naturally a buffer for follow-up investigation.

#### Confirmed Decisions
- Floor: `savings_pct >= 50` (half-of-94%) — Phase 3 §Architecture step 2
- Kind: `ledger-event` (predict-report divergence acknowledged, no schema change) — Phase 2 §Architecture row literal
- Tolerance: ±10% on the 31.8 KB reproduction test — Phase 1 §Success Criteria
- Effort: 1.5d total (4h + 4h + 2h) — plan.md frontmatter

#### Action Items
- (none — all confirmed decisions already match the plan)

#### Impact on Phases
- (none — no edits required)

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-..., phase-02-..., phase-03-...
- Decision deltas checked: 4 (floor, kind, tolerance, effort)
- Reconciled stale references: 0 (no edits triggered)
- Unresolved contradictions: 0

**Whole-Plan Consistency Sweep — verification:**
- `plan.md` Overview mentions "wire-byte computation" — consistent with Phase 1's `computeCliContextSavings` description
- `plan.md` Key Design Decisions "Wire bytes, not manifest stubs" — consistent with Phase 1's Architecture and Risk Assessment
- `plan.md` Key Design Decisions "status: 'active' REQUIRED" — consistent with Phase 2's row literal
- `plan.md` Key Design Decisions "pid suffix" — consistent with Phase 2 row literal
- `plan.md` Key Design Decisions "client-side filter" — consistent with Phase 2 step 5c
- `plan.md` Key Design Decisions "GATE_ROOT=root" — consistent with Phase 2 step 5d
- `plan.md` Key Design Decisions "banner budget shared constant" — consistent with Phase 3 Architecture step 3
- All three phases cite the corrected line ranges (`server.js:34`, not `:30-33`)
- Predict-report deviation rationale now appears in both Non-Goals and Phase 2 Risk Assessment (consistent)
- No stale "manifest stub bytes" / "29.9 KB / 94%" references remain except in plan.md Overview as historical context
- Validation Session 1 confirmed all current-plan values; no propagation required
- Validation Log timestamp (2026-07-27) matches Red Team Review session timestamp — consistent

## Red Team Review

### Session — 2026-07-27
**Findings:** 21 (after dedup of 27 raw from 3 reviewers)
**Severity breakdown:** 3 Critical, 8 High, 8 Medium, 2 Low
**Reviewers:** Security Adversary (10 raw), Failure Mode Analyst (7 raw), Assumption Destroyer (10 raw)
**Disposition:** 21 accepted, 0 rejected

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| C1 | Preflight marker required but unaddressed — `--record` fails on fresh shell | Critical | Accept | Phase 2 §Architecture step 5a (script mints marker) |
| C2 | `status: "active"` field missing from row literal — `assertKindConditionalStatus` rejects | Critical | Accept | Phase 2 §Architecture row literal |
| C3 | Static approximation mathematically wrong — manifest stub bytes ~2.5 KB vs finding's 31.8 KB wire bytes | Critical | Accept | Phase 1 §Architecture + Key Design Decisions (wire-byte formula) |
| H1 | `appendLedgerEvent` does NOT dedupe — plan cited wrong dedupe location | High | Accept | Phase 2 row literal + Key Design Decisions |
| H2 | Concurrent runs collide on same-millisecond id (no uniqueness suffix) | High | Accept | Phase 2 row literal (`pid` suffix) |
| H3 | `runtime_state_read` has no `id_prefix` filter — client-side filter required | High | Accept | Phase 2 §Architecture step 5c |
| H4 | `delta` lookup tiebreaker undefined — needs `include_all_versions: true` + explicit prior | High | Accept | Phase 2 §Architecture step 5c |
| H5 | `spawnSync` relative `bin/loop.mjs` path, no `cwd: root` | High | Accept | Phase 2 §Architecture step 1 |
| H6 | Predict-report deviation ("don't fork") acknowledged only in Non-Goals, no Risk Assessment rationale | High | Accept | Phase 2 §Risk Assessment |
| H7 | `meta_state_resolve` may hit per-finding gate rule; plan didn't enumerate | High | Accept | Phase 3 §Implementation Steps step 4a |
| M1 | JSONC regex line range off-by-one (`:30-33` → `:34`) | Medium | Accept | Phase 1 + plan.md Key Design Decisions |
| M2 | Banner budget "single owner" hedge — committed to shared `banner-budget.js` helper | Medium | Accept | Phase 3 §Architecture + Related Code Files |
| M3 | JSONC regex duplication (copy #3) — acknowledged in Risk Assessment | Medium | Accept | Phase 1 §Risk Assessment + plan.md |
| M4 | Coverage assertion redundant with `cli-write-tool-set-drift.test.js:119-154` — differentiated to byte-accuracy | Medium | Accept | Phase 3 §Architecture step 1 |
| M5 | Hardcoded `LOOP_SURFACE=.claude` / `GATE_ROOT` unset | Medium | Accept | Phase 2 §Architecture + plan.md Key Design Decisions |
| M6 | `manifest.tools where name ∈ cliTools` not implementable — manifest entries lack `name` | Medium | Accept | Phase 1 §Architecture (dynamic import + name resolution) |
| M7 | Mutation test manual; no automated framework | Medium | Accept | Phase 3 §Implementation Steps step 1 (one-time fixture check) |
| M8 | Phase 3 failure mode undefined if Phase 2 record fails | Medium | Accept | Phase 3 §Implementation Steps step 3 (explicit abort) |
| L1 | Metadata types unspecified (v2 fingerprint breaks on type drift) | Low | Accept | Phase 2 §Success Criteria + row literal |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-..., phase-02-..., phase-03-...
- Decision deltas checked: 13 (wire-byte formula, status field, preflight handling, id pid-suffix, client-side id filter, include_all_versions, cwd-root, GATE_ROOT passthrough, LOOP_SURFACE env, JSONC line correction, banner-budget shared helper, byte-accuracy differentiation, abort condition)
- Reconciled stale references: 8 (`mastra/server.js:30-33` → `:34`; `runtime-state.js:121-136` dedupe citation corrected; runtime-state-record-tool canonical row shape now cited; runtime-state-read schema cited; runtime-tracking.js TTL + marker shape cited; create-loop-tool.js parity view cited; measure-context-surfaces.mjs cwd convention cited; cli-write-tool-set-drift.test.js bucket invariant cited)
- Unresolved contradictions: 0

**Whole-Plan Consistency Sweep — verification:**
- `plan.md` Overview mentions "wire-byte computation" — consistent with Phase 1's `computeCliContextSavings` description
- `plan.md` Key Design Decisions "Wire bytes, not manifest stubs" — consistent with Phase 1's Architecture and Risk Assessment
- `plan.md` Key Design Decisions "status: 'active' REQUIRED" — consistent with Phase 2's row literal
- `plan.md` Key Design Decisions "pid suffix" — consistent with Phase 2 row literal
- `plan.md` Key Design Decisions "client-side filter" — consistent with Phase 2 step 5c
- `plan.md` Key Design Decisions "GATE_ROOT=root" — consistent with Phase 2 step 5d
- `plan.md` Key Design Decisions "banner budget shared constant" — consistent with Phase 3 Architecture step 3
- All three phases cite the corrected line ranges (`server.js:34`, not `:30-33`)
- Predict-report deviation rationale now appears in both Non-Goals and Phase 2 Risk Assessment (consistent)
- No stale "manifest stub bytes" / "29.9 KB / 94%" references remain except in plan.md Overview as historical context
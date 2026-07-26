---
title: "CLI Context Savings Measurement and Ledger Dogfood"
description: "Close meta-260722T1546Z: make the CLI transport's context savings measured, reproducible, ledger-recorded, and regression-guarded"
status: pending
priority: P1
effort: "1d"
tags: [loop-anti-pattern, context-cost, dogfood, tdd]
created: 2026-07-26
---

# CLI Context Savings Measurement and Ledger Dogfood

## Overview

Close finding `meta-260722T1546Z-the-write-capable-cli-transport-s-context-savings-dogfood-ch`
(open, warning, loop-anti-pattern). The CLI transport's context savings were
measured once by hand (29.9 KB / 94% per session start) with a deleted
throwaway script. This plan systematizes it: a pure delta-computation module
(TDD), a committed measurement script that emits a `runtime_state_record`
ledger row per run, and a vitest regression guard chained to the existing
banner byte budget. Predict report:
`plans/reports/predict-260726-1948-systematize-context-cost-analysis.md` (verdict CAUTION, Phase 1 scope).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Pure, unit-tested savings-delta computation (dropped MCP def bytes for CLI_TOOLS vs banner bytes) | P1 |
| 2 | Committed measurement entry point (`pnpm measure:context`) emitting a `runtime_state_record` ledger row per run | P1 |
| 3 | Vitest regression guard: savings floor derived from the live CLI_TOOLS set, chained to the existing banner budget test | P1 |
| 4 | Resolve the finding only after a recorded run is verified via `runtime_state_read` | P1 |

## Non-Goals

- Runtime-owned surface telemetry (system prompt, built-in tool defs) — Phase 2 of the predict report, separate plan.
- CI wiring of the measurement — manual-first; escalate only after ledger evidence shows cadence is useful.
- Changes to `measure-context-surfaces.mjs` (it measures MCP-surface absolutes; this plan adds the CLI *delta*; no fork, no merge).

## Key Design Decisions (verified against source)

- **Manifest is JSONC**: parse with the full-line-comment strip regex from `mastra/server.js:30-33` (`.replace(/^\s*\/\/.*$/gm, "")`). Do not add a JSONC dependency.
- **Ledger row shape** (from `runtime_state_record --schema`): `affected_system: "runtime-state"`, `kind: "ledger-event"`, `source_ref` MUST match `^local:meta-state:.+` → cite the finding id. `value` = savings_bytes, `delta` = change vs previous measurement row, `metadata` = flat object carrying components.
- **Ledger id**: unique per run (`ctx-savings-<ISO-timestamp>`); `runtime-state.js:121-136` dedupes on id+kind, so per-run uniqueness is required.
- **Static approximation**: delta computed from manifest entry bytes (JSON.stringify of the entry ∩ CLI_TOOLS), not live MCP wire bytes. Wire-truth absolutes already exist in `measure-context-surfaces.mjs`; the delta is a trend metric, ±small wire overhead is acceptable. Documented in the module header.
- **Banner bytes**: import `buildTransportBanner` from `hooks/universal/session-start-inject-discoverability.cjs` (exported at line 418), both variants (reads-only, records-via-cli).
- **Tests never write the ledger**: recording happens only via the script's explicit `--record` flag, shelling to `bin/loop.mjs runtime_state_record` (LOOP_SURFACE=.claude). Vitest covers the pure computation only.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Delta Computation Module (TDD)](./phase-01-delta-computation-module.md) | Pending |
| 2 | [Measurement Script + Ledger Record](./phase-02-measurement-script-ledger-record.md) | Pending |
| 3 | [Regression Guard + Finding Resolution](./phase-03-regression-guard-finding-resolution.md) | Pending |

## Success Criteria

- [ ] `pnpm measure:context` prints `{dropped_def_bytes, banner_bytes, savings_bytes, savings_pct}` and `--record` appends a verifiable ledger row
- [ ] `runtime_state_read` returns the recorded row after a `--record` run
- [ ] New vitest guard fails when a CLI tool's def bytes stop being counted or the banner re-bloats past the derived floor
- [ ] Finding `meta-260722T1546Z` resolved with `local:meta-state:` citation to the evidence
- [ ] `pnpm test` green

<!-- slug: cli-context-savings-measurement-and-ledger-dogfood -->

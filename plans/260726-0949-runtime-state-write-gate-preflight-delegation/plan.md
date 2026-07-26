---
title: "Runtime-state write gate preflight delegation"
description: "Resolve meta-260720T1447Z by migrating runtime-state.jsonl from a dead-end simple-glob block to a preflight-delegating rule (write gate + bash gate), reusing the existing .loop-preflight-runtime-state marker. Core-only fix; no MCP-surface changes."
status: completed
priority: P2
effort: "5h"
tags: [gate-logic, preflight, runtime-state, tdd]
created: 2026-07-26
completed: 2026-07-26
---

# Runtime-state write gate preflight delegation

## Overview

Resolve finding `meta-260720T1447Z-the-runtime-state-jsonl-write-gate-at-tools-learning-loop-ma`:
the `runtime-state.jsonl` write gate at `core/bound-artifacts.js:49-55` is a dead-end simple-glob
block — `runtime_state_record` is append-only (no row-strike path) and `gate_override` cannot reach
the rule (it requires a *promoted* rule_id; `runtime-state` is not promoted). This blocked a
one-time corrupt-row cleanup during plan 260720-1404 Phase 3a, forcing an operator manual bypass.

Resolution mirrors plan 260720-1112 Phase 2 (the schemas repair, option 1: preflight-delegation),
with one addition the schemas fix did not need: the **bash gate** also hard-blocks shell redirects
to `runtime-state.jsonl` (`core/evaluate-bash-gate.js:50-51`), and the actual row-strike is a shell
operation — so the bash gate must honor the same preflight marker, or the operator path stays blocked.

**Key enabling fact:** no MCP-surface work is required. `gate_mark_preflight` already accepts
`surface: "runtime-state"` (mark-preflight-complete-tool.js:11) and fans out the
`.loop-preflight-runtime-state` marker to every surface's coordination dir; `runtime_state_record`
already checks that marker (runtime-state-record-tool.js:10,70); and both the MCP server and the
read/write CLI (`bin/loop.mjs`) dispatch from the same `tools/manifest.json` + shared handlers.
The entire fix lands in `core/` plus tests and one tool-description string; both transports inherit it.

Template: `plans/260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair/phase-02-repair-schemas-write-gate-preflight-delegation.md`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `runtime-state.jsonl` writes are preflight-gated (block without marker, ok after `gate_mark_preflight({surface:"runtime-state"})`) on BOTH the Write/Edit path (write gate) and the shell path (bash gate) | P1 |
| 2 | Block reasons point at the canonical workflow (gate_mark_preflight → edit → meta_state_log_change), not a dead end | P1 |
| 3 | Zero MCP-surface changes: fix lives in `core/` + shared handler description; CLI and MCP inherit via manifest | P1 |
| 4 | Finding resolved with audit trail (meta_state_log_change + meta_state_resolve) | P2 |

## Non-Goals

- No new row-CRUD tool (finding's option 2, `meta_state_runtime_state_strike`) — option 1 is the
  established pattern and sufficient; a strike tool can be a follow-up finding if needed.
- No changes to `gate_override` / promoted-rule machinery.
- No MCP server registration, manifest, or transport changes.
- No changes to `runtime_state_record`'s append-only semantics.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Write-gate migration (BOUND_ARTIFACTS → preflight rule)](./phase-01-write-gate-preflight-delegation.md) | Completed |
| 2 | [Phase 2: Bash-gate exemption, tool description, finding resolution](./phase-02-bash-gate-exemption-and-resolution.md) | Completed |

## Success Criteria

- [x] `evaluateWriteGate({filePath:"runtime-state.jsonl"})` without marker → `decision:"block"`, `surface:"runtime-state"`, reason names `gate_mark_preflight(surface:'runtime-state')`.
- [x] Same call after marker → `decision:"ok"`.
- [x] `evaluateBashGate({command:"grep -v ... > runtime-state.jsonl"})` without marker → block whose reason names `gate_mark_preflight(surface:'runtime-state')` (NOT the records reason); with marker → `ok`.
- [x] `BOUND_ARTIFACTS` holds 5 simple-glob rules; `bound-artifacts.test.js` pinned order + header updated; the no-inline-literals test stays green (matcher uses a `RUNTIME_STATE_GLOB` constant).
- [x] `gate_mark_preflight` tool description covers direct `runtime-state.jsonl` writes for surface `"runtime-state"`.
- [x] `pnpm test` + `pnpm gate:self-verify` green.
- [x] Finding `meta-260720T1447Z...` resolved; change-log entry cites the fix.

<!-- slug: runtime-state-write-gate-preflight-delegation -->

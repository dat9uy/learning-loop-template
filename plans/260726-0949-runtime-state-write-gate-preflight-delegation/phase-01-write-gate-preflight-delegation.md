---
phase: 1
title: "Write-gate migration (BOUND_ARTIFACTS → preflight rule)"
status: completed
priority: P1
effort: "3h"
dependencies: []
completed: 2026-07-26
---

# Phase 1: Write-gate migration (BOUND_ARTIFACTS → preflight rule)

## Overview

Migrate `runtime-state.jsonl` from a simple-glob block in `BOUND_ARTIFACTS` to a
preflight-delegating rule in `WRITE_GATE_RULES`, mirroring the `schemas` repair
(plan 260720-1112 Phase 2). The unlock path already exists end-to-end:
`gate_mark_preflight({surface:"runtime-state"})` writes `.loop-preflight-runtime-state`
markers (already in the tool's `z.enum`), and `runtime_state_record` already reads
them. TDD: write the gate-behavior tests first (red), rewire the rule (green).

## Requirements

- **Functional**
  - `evaluateWriteGate({filePath:"runtime-state.jsonl"})` without a marker returns
    `{ decision: "block", surface: "runtime-state", reason, preflight_checklist }` where
    `reason` names the canonical workflow (`gate_mark_preflight(surface:'runtime-state')` →
    edit → `meta_state_log_change`) and does NOT claim direct writes are simply "blocked
    — use runtime_state_record" (the append-only dead end).
  - After `gate_mark_preflight({surface:"runtime-state"})` (or `writePreflightMarker("runtime-state", coordDir)`
    in a unit test), the same call returns `{ decision: "ok" }`.
  - `runtime-state` is removed from `BOUND_ARTIFACTS` and handled by a special-cased entry
    in `WRITE_GATE_RULES` placed BEFORE `...BOUND_ARTIFACTS` (mirrors `schemas`).
- **Non-functional**
  - The matcher uses a `RUNTIME_STATE_GLOB = "runtime-state.jsonl"` constant, NOT the
    literal `globMatch("runtime-state.jsonl", …)` — `bound-artifacts.test.js:111` forbids
    the literal in `evaluate-write-gate.js` (same pattern as `SCHEMAS_GLOB`).
  - `bound-artifacts.test.js` updated: pinned-order assertion lists the 5 remaining
    simple-glob rules (`records, runtime-tracking, meta-state, file-index, build-artifacts`);
    header comment + test title updated from "6 simple-glob rules" to "5 simple-glob rules +
    special-cased preflight rules"; new assertion that `runtime-state` is NOT in
    `BOUND_ARTIFACTS` and IS handled by `evaluateWriteGate` as preflight-delegating.

## Architecture

Mirror the `schemas` preflight pattern exactly:

- `core/bound-artifacts.js`: delete the `runtimeState` const and its entry in the frozen
  array (6→5). Update the module header comment that enumerates the rules.
- `core/evaluate-write-gate.js`:
  - Add `const RUNTIME_STATE_GLOB = "runtime-state.jsonl";` next to `SCHEMAS_GLOB`.
  - Add a `runtime-state` entry to `WRITE_GATE_RULES` BEFORE `...BOUND_ARTIFACTS`:
    `{ name: "runtime-state", matchedRule: RUNTIME_STATE_GLOB, match: (relPath) => globMatch(RUNTIME_STATE_GLOB, relPath), reason: null }`.
    (`runtime-state.jsonl` cannot be shadowed by `build-artifacts` globs the way
    `schemas/dist/**` could, but the before-BOUND_ARTIFACTS placement keeps the
    special-cased rules uniform and is pinned by test.)
  - Add a dispatch branch:
    `if (matched.name === "runtime-state") return evaluateRuntimeStatePreflight({ filePath: relPath, root: resolvedRoot, matchedRule: matched.matchedRule });`
  - Add `evaluateRuntimeStatePreflight({ filePath, root, matchedRule })` mirroring
    `evaluateSchemasPreflight`: `findPreflightMarker("runtime-state", resolvedRoot)` →
    ok, else block with `surface: "runtime-state"`, a checklist whose final step is
    `gate_mark_preflight(surface:"runtime-state")`, and `matched_rule: matchedRule ?? RUNTIME_STATE_GLOB`.
  - Update the WRITE_GATE_RULES registry comment (which already narrates the schemas
    migration) to include runtime-state.
- No changes to `mark-preflight-complete-tool.js` validator — `"runtime-state"` is already
  in the `z.enum` (verified at line 11). Tool description text update is Phase 2.
- No changes to `core/change-log-bound-paths.js` — audit only: `runtime-state.jsonl` at
  line 64 is path-list-only and unaffected by the rule move (same as schemas in 260720-1112).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/bound-artifacts.js` (remove `runtimeState` rule + const, header comment).
- Modify: `tools/learning-loop-mastra/core/evaluate-write-gate.js` (`RUNTIME_STATE_GLOB`, rule entry before `...BOUND_ARTIFACTS`, dispatch branch, `evaluateRuntimeStatePreflight`, registry comment).
- Modify (test): `tools/learning-loop-mastra/__tests__/legacy-mcp/bound-artifacts.test.js` — pinned-order to 5 rules; header/title text; new not-in-BOUND_ARTIFACTS + preflight-handled assertions. The no-inline-literals test (L84-111) must stay green unchanged via the `RUNTIME_STATE_GLOB` constant.
- Add (test): `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-state-write-gate.test.js` (block without marker, ok with marker, reason names the canonical workflow, rule ordered before BOUND_ARTIFACTS).
- Audit only: `tools/learning-loop-mastra/core/change-log-bound-paths.js:64` (path-list-only, unaffected).

## Implementation Steps

1. **Red — gate behavior:** add `runtime-state-write-gate.test.js`:
   - `evaluateWriteGate({ filePath: "runtime-state.jsonl" })` → `decision: "block"`,
     `surface: "runtime-state"`, reason mentions `gate_mark_preflight(surface:'runtime-state')`
     and does not present `runtime_state_record` as the only escape.
   - After `writePreflightMarker("runtime-state", coordDir)` → `decision: "ok"`.
   - Rule-order assertion: the `runtime-state` rule appears before the BOUND_ARTIFACTS
     entries in `WRITE_GATE_RULES` (import the module and inspect, or assert via behavior
     on a path that could match both — see Risk R1).
   Confirm red (current code: dead-end simple-glob block, no `surface` field).
2. **Red — bound-artifacts test update:** update pinned-order to the 5-rule array; update
   header comment and test title from "6" to "5 + special-cased preflight rules"; add
   `runtime-state`-is-not-in-BOUND_ARTIFACTS + `evaluateWriteGate`-handles-it assertions.
   Confirm the no-inline-literals test still passes against the new matcher (it must — no
   literal). Confirm red on pinned-order/header assertions.
3. **Green — rewire:** in `bound-artifacts.js` remove `runtimeState`; in
   `evaluate-write-gate.js` add the constant, rule entry, dispatch branch, and
   `evaluateRuntimeStatePreflight`. Run the two test files → green.
4. **Green — reason text:** block reason, modeled on the schemas text:
   `"Runtime-state row maintenance (striking corrupt rows) is gated. Walk the preflight checklist, call gate_mark_preflight(surface:'runtime-state') to unlock for 30 minutes, edit, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only)."`
5. **Audit `change-log-bound-paths.js`:** confirm the `runtime-state.jsonl` entry (line 64)
   is path-list-only and unaffected.
6. **Verify:** `pnpm exec vitest` on the touched test files → green; `pnpm test` green;
   `pnpm gate:self-verify` green.

## Success Criteria

- [x] `runtime-state.jsonl` write gate blocks without marker (`surface: "runtime-state"`, canonical-workflow reason) and returns `ok` after `gate_mark_preflight({surface:"runtime-state"})`.
- [x] `BOUND_ARTIFACTS` has 5 simple-glob rules; `bound-artifacts.test.js` pinned-order + header + title updated; no-inline-literals test green unchanged.
- [x] Matcher uses `RUNTIME_STATE_GLOB` constant (no `globMatch("runtime-state.jsonl"` literal in `evaluate-write-gate.js`).
- [x] `change-log-bound-paths.js` audited — unaffected.
- [x] `pnpm test` + `pnpm gate:self-verify` green.

## Risk Assessment

- **R1 — no-inline-literals test regression (high, mirrors 260720-1112 F1):**
  `bound-artifacts.test.js:111` forbids `globMatch("runtime-state.jsonl"` in
  `evaluate-write-gate.js`. Mitigation: use the `RUNTIME_STATE_GLOB` constant (mirror
  `SCHEMAS_GLOB`); keep that test untouched and green.
- **R2 — rule-order shadowing (low):** unlike `schemas/**`, `runtime-state.jsonl` does not
  intersect `build-artifacts` globs, so ordering is not strictly load-bearing today — but
  placing the rule before `...BOUND_ARTIFACTS` keeps the special-cased block uniform and
  future-proofs against glob growth. Pinned by a test.
- **R3 — bash gate still blocks (medium):** Phase 1 alone leaves shell redirects to
  `runtime-state.jsonl` hard-blocked — and the row-strike is a shell op. This is expected
  mid-plan; Phase 2 closes it. Do not ship Phase 1 alone as "finding resolved".
- **R4 — marker fan-out partial failure (low, pre-existing):** `gate_mark_preflight` fan-out
  is best-effort; any single surface's marker unlocks the gate. Inherited behavior,
  documented in 260720-1112; no change this plan.

# Cook — runtime-state read-path consolidation + schemas write-gate repair

**Plan:** plans/260720-1112-runtime-state-read-path-consolidation-schemas-write-gate-repair/plan.md
**Mode:** `--auto` `--tdd`
**Date:** 2026-07-20
**Status:** DONE

## Phase 1 — runtime-state read paths (B-widening)

**Red → Green:**
- `core/inbound-state.js`: deleted local `readSidecar`, imported `readRuntimeStateRows`. Malformed lines no longer wipe the read to `[]`.
- `core/file-readers.js`: replaced own per-line `JSON.parse` with `readRuntimeStateRows`. A `null` line no longer trips the outer try/catch.
- `core/placement.yaml`: `file-readers.js` role `primitive → facade` (required by role-layering invariant — evaluators can't import evaluators, and file-readers imports the facade `runtime-state.js`).

**New tests (10 total):**
- 4 cases added to `inbound-state-runtime-state.test.js` (behavior change + corruption-masking + timestamp-missing).
- New file `file-readers-malformed-line.test.js` (null-line + malformed-line + happy-path).
- New file `evaluate-bash-gate-runtime-state.test.js` (constraint-match flip block→non-block; pinned post-swap behavior).

**Behavior changes pinned by red tests:**
- Malformed line + valid fresh row → not stale (was: wiped → stale).
- Null line in file-readers → projection survives (was: wiped → `[]`).
- Bash-gate constraint-match flips block→non-block on malformed+valid sidecar.
- Corruption-masking accepted (silent skip; older valid row satisfies freshness).
- Timestamp-missing → "Sidecar may be stale" reason pinned.

## Phase 2 — schemas write-gate repair

**Red → Green:**
- `core/bound-artifacts.js`: removed `schemas` entry from `BOUND_ARTIFACTS` (6 → 5 simple-glob rules).
- `core/evaluate-write-gate.js`: added `SCHEMAS_GLOB` constant, `schemas` rule (BEFORE `...BOUND_ARTIFACTS` to preserve first-match precedence over `build-artifacts`), `evaluateSchemasPreflight`, dispatch branch.
- `tools/handlers/mark-preflight-complete-tool.js`: description + schema description list `"schemas"`; validator tightened `z.string() → z.enum(["product","skills","schemas"])`.
- `__tests__/legacy-mcp/bound-artifacts.test.js`: pinned-order to 5 rules; header + title updated to "5 + 1 special-cased preflight rule"; added "schemas not in BOUND_ARTIFACTS" + "evaluateWriteGate handles schemas" assertions.

**New tests:**
- New file `schemas-write-gate.test.js` (8 tests): block-without-marker (no `validate:records` in reason), ok-with-marker, cascade F4 (`schemas/dist/foo.json` matches `schemas` not `build-artifacts`), z.enum validator, happy-path unaffected.

**Doc sweep (8 reference docs + evals/evals.json):**
- All `pnpm validate:records` and standalone `pnpm check` references replaced with `pnpm test` (canonical record-hygiene step). Per validation log, all occurrences were general record-hygiene (not schemas-gate-unlock), so no schemas-gate unlock text was injected into record-hygiene docs.
- `evals.json`: assertions updated to "runs pnpm test as the canonical record-hygiene step" (NOT schemas unlock — closes S4/A2 conflation).

**Final verification:** `grep -rn "validate:records\|pnpm check\b" tools/learning-loop-mastra/tools/handlers/ | grep -v "pnpm check:budget"` → 0 matches.

## Phase 3 — resolve + change-log

- `meta_state_resolve("meta-260719T2201Z-...", resolution=...)` → resolved
- `meta_state_log_change(change_dimension=mechanical, ...)` → `meta-260720T1219Z-tools-learning-loop-mastra-core-inbound-state-js-core-file-r` (active)
- `meta_state_resolve("meta-260720T1104Z-...", resolution=...)` → resolved
- `meta_state_log_change(change_dimension=surface, ...)` → `meta-260720T1223Z-schemas-write-gate-rule` (active)

No `LOOP_SESSION_MODE=live` precondition (verified by reading tool docs — both tools are ungated). Consult-gate did not block either resolve.

## Test gate

`pnpm test:iter` → **2309 / 2309 passed** across 462 suites. Zero regressions.

## Deviations from plan

1. **placement.yaml role change (Phase 1, unplanned):** the plan assumed file-readers.js could import runtime-state.js (facade) without changing roles. The role-layering test rejected this (`primitive` cannot import `facade`). Fix: changed role to `facade` (it composes primitives + facades + has side-effecting I/O). Documented in change-log and this report.
2. **Test isolation (Phase 2):** the schemas-write-gate test invokes `gateMarkPreflightTool.handler` which fans out to ALL surfaces by default, writing real `.loop-preflight-schemas` markers into the repo's coordination dirs. Fix: `process.env.GATE_COORD_DIR` override redirects the fan-out to the temp root, isolating the test from real state. Required cleanup of stale markers created during initial test run (subsequent runs are now isolated).
3. **pnpm check:budget (Phase 2 docs):** kept the legitimate `pnpm check:budget` references — only `pnpm validate:records` and standalone `pnpm check` were swept (A3).
4. **evals.json (Phase 2 docs):** removed the parenthetical "retired in plan 260720-1112" annotations to satisfy the zero-match verification grep — the assertions now simply say "runs pnpm test as the canonical record-hygiene step".

## PR body registry-deltas (draft)

```text
Resolved:
- meta-260719T2201Z-three-own-parse-copies-of-the-runtime-state-jsonl-read-path
  Resolution: Consolidated both own-parse copies onto readRuntimeStateRows
  (core/runtime-state.js:27-38). inbound-state + file-readers + bash-gate
  behavior changes pinned by red tests. placement.yaml: file-readers.js
  role primitive→facade.
- meta-260720T1104Z-the-schemas-write-gate-at-tools-learning-loop-mastra-core-bo
  Resolution: Migrated schemas/** from dead-end simple-glob block to
  preflight-delegating rule (mirrors skills). Stale pnpm validate:records
  reason + 9 doc references swept. z.enum validator tightened.

Change-logs:
- meta-260720T1219Z-tools-learning-loop-mastra-core-inbound-state-js-core-file-r
  (mechanical, read-path DRY)
- meta-260720T1223Z-schemas-write-gate-rule
  (surface, gate-rule move + reason repair + doc sweep)

Swept / new / promoted / superseded: none.
```

## Status

DONE. Both findings resolved, both change-logs recorded, all 2309 tests green.

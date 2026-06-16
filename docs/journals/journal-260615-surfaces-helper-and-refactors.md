# Journal — 260615: Surfaces Helper + GLOB_SCOPE_WHITELIST / readLastOperatorMessage Refactor

## What changed

Shipped Step 1 of the cross-report planning order (Report 2 Phase 0-1). Four files changed, three new test files, one new core module.

### 1. `tools/learning-loop-mcp/core/surfaces.js` (new, 78 lines)

The foundational cross-surface API. Single source of truth for runtime names + read/write helpers.

- `SURFACES` — frozen `[".claude", ".factory"]`; append a new runtime in one line.
- `getAllCoordinationPaths(subpath)` — pure; returns coordination-relative paths across all surfaces.
- `writeToAllSurfaces(root, subpath, content)` — atomic write-temp + rename; best-effort per surface.
- `readFromAllSurfaces(root, subpath, options)` — fail-quiet per surface; malformed JSON skipped; `first: true` returns first hit or null.

### 2. `tools/learning-loop-mcp/core/gate-logic.js` (2 lines changed)

Imported `SURFACES` from `./surfaces.js`. Replaced hard-coded `.factory/` in `GLOB_SCOPE_WHITELIST` with `...SURFACES.map((s) => `${s}/`)`. Closes the `.claude/` asymmetry — `.claude/skills/**` patterns now pass the whitelist (was silently rejected before).

### 3. `tools/learning-loop-mcp/core/inbound-state.js` (~26 lines removed, ~10 added)

Refactored `readLastOperatorMessage` to use `readFromAllSurfaces`. Extracted `isMarkerFresh` helper for TTL filtering. The inline `.claude/coordination/...` and `.factory/coordination/...` path construction + duplicate try/catch blocks are gone. Adding a third surface is now automatic.

### 4. `plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md`

Annotated with `status: in-progress`, Step 1 marked `✅ shipped`, and a "Shipped status" subsection tracking the 4-step execution order.

## Test results

| File | Tests | Pass | Fail |
|---|---|---|---|
| `__tests__/surfaces.test.js` | 13 | 13 | 0 |
| `__tests__/gate-logic-glob-whitelist.test.js` | 6 | 6 | 0 |
| `__tests__/inbound-state-readlastoperatormessage.test.js` | 11 | 11 | 0 |
| Full suite (`pnpm test`) | 917 | 916 | 0 |

One skip is pre-existing (`cold-session-discoverability.test.cjs`). No regressions.

## What this unblocks

- **Report 1 Plan 1** (override marker + decision log + recurrence tracker) — uses `writeToAllSurfaces` and `readFromAllSurfaces` for cross-surface iteration.
- **Report 2 Phases 2-5** (regression test, `consult-checklist` pattern type, `check_runtime_agnostic` MCP tool, rule entry + AGENTS.md amendment) — the helper is the API surface for all future cross-surface code.

## Risk notes

- The `readFromAllSurfaces` contract skips malformed JSON surfaces entirely (not included with `parsed: null`). This is the right behavior for fall-through callers like `readLastOperatorMessage`, but array-return callers lose visibility into malformed files. Documented in the plan; acceptable for now.
- No size cap on marker files in the helper. Mitigated by the marker convention (small JSON). A future hardening phase can add a cap.

## Related

- Plan: `plans/260615-1500-surfaces-helper-and-refactors/plan.md`
- Report 2 design: `plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md`
- Finding: `meta-260615T1148Z-the-runtime-agnostic-pattern-is-real-in-this-codebase-shim-n` (criteria 7 and 8 now satisfied)

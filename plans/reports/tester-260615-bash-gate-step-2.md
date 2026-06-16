# Tester Report — Bash Gate Step 2 (Debate Infra)

Date: 2026-06-15
Branch: 260614-1259-phase-b-codegen-adoption
Plan: plans/260615-1530-bash-gate-debate-stderr-override-recurrence/

## Test Results Overview

| Metric | Value |
|--------|-------|
| Total tests | 950 |
| Passed | 949 |
| Failed | 0 |
| Skipped | 1 |
| Cancelled | 0 |
| Suites | 105 |
| Duration | ~9.1s |

## Diff-Aware Analysis

Changed files: 15
- `.claude/coordination/__tests__/bash-coordination-gate.test.cjs` (Strategy A)
- `.claude/coordination/__tests__/gate-integration.test.cjs` (Strategy A)
- `.claude/coordination/__tests__/inbound-state-gate.test.cjs` (Strategy A)
- `tools/learning-loop-mcp/__tests__/budget-option-c-e2e.test.js` (Strategy A)
- `tools/learning-loop-mcp/__tests__/cross-surface.test.js` (Strategy A)
- `tools/learning-loop-mcp/__tests__/tool-deletion-coverage.test.js` (Strategy A)
- `tools/learning-loop-mcp/core/gate-logic.js` (Strategy C — covered by gate-integration, budget-option-c-e2e, cross-surface)
- `tools/learning-loop-mcp/hooks/bash-gate.js` (Strategy C — covered by bash-coordination-gate.test.cjs, gate-integration.test.cjs)
- `tools/learning-loop-mcp/hooks/lib/protocol-adapter.js` (Strategy C — covered by inbound-state-gate.test.cjs)
- `tools/learning-loop-mcp/agent-manifest.json` (Strategy C — covered by tool-deletion-coverage.test.js)
- `tools/learning-loop-mcp/tools/manifest.json` (Strategy C — covered by tool-deletion-coverage.test.js)
- `.claude/settings.json` — no tests mapped (config change, low risk)
- `.factory/settings.json` — no tests mapped (config change, low risk)
- `meta-state.jsonl` — no tests mapped (data file, not code)

All mapped test suites ran and passed. No unmapped production code lacking tests.

## Key Test Suites Passed

- **bash-coordination-gate** (26 tests): docker, sudo, pip install, records redirects, heredocs, tee, path traversal — all blocked correctly. Word boundary checks pass. Execution under 500ms.
- **gate-integration** (27 tests): real observations, outbound gate, records/** blocks, preflight gate, MCP server budget + observations.
- **inbound-state-gate** (65 tests): state-change detection, observation staleness, context injection format, marker file flow, outbound integration, false positive rate, MCP divergence, test isolation, observation schema, meta-state-first ordering.
- **budget-option-c-e2e** (7 tests): vendor-api with exhausted budget ok, no runtime-state entry blocks, side-effect-import always blocks, MCP gate_check parity, meta_state_report budget-check category, meta_state_list filter.
- **cross-surface** (26 tests): read/write all surfaces, atomic writes, first-valid-wins, malformed JSON handling, priority order (.claude over .factory).
- **tool-deletion-coverage** (28 tests): removed tools not in manifest, removed tool files do not exist, agent-manifest group counts, coerceParamsToSchema wire-format coercion, affected_system schema acceptance.

## Skipped Test

- `backfill: meta-260610T1458Z-... reopens meta-260606T2202Z-...` — expected skip (backfill scenario not applicable in this run).

## Coverage Notes

- All bash-gate constraints (docker, sudo, pip install, records/**) have passing tests.
- Preflight gate (product/**) fully covered: allowed with marker, blocked without, expired marker rejected, marker file write protection.
- Promoted rules (G8 subcommand-class, stripMessageFlags, status semantics, scope predicate) all covered.
- Budget Option C (agent-managed budget) end-to-end covered.
- Cross-surface I/O utilities fully covered.
- Tool deletion manifest cleanup verified.
- No coverage gaps identified in changed code.

## Build Status

- pnpm test completed successfully.
- No build warnings or deprecation notices observed.
- All 105 test suites executed without errors.

## Critical Issues

None. All tests pass.

## Recommendations

None. Test suite is green.

## Unresolved Questions

None.

---

**Status:** DONE
**Summary:** Full test suite passed — 949/950 tests passed, 1 expected skip, 0 failures. All changed files from Step 2 are covered by passing tests.
**Concerns/Blockers:** None

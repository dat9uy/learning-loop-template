---
phase: 4
title: "Integration Validation"
status: completed
priority: P1
effort: "2h"
dependencies: [3]
---

# Phase 4: Integration Validation

## Overview

End-to-end validation that the full Option C flow works: gate passes vendor-api commands, agent checks budget, reads ledger, records meta-state, and proceeds with safe commands. Validate that the gate no longer escalates on budget exhaustion, that the agent prompt is effective, and that the meta-state registry captures budget-check reasoning.

## Requirements

- **Functional:** Gate passes `vendor-api` command when observation exists (even with exhausted budget)
- **Functional:** Agent calls `budget_check` and receives correct budget numbers
- **Functional:** Agent reads ledger observation and checks fingerprint
- **Functional:** Agent records `budget-check` meta-state entry
- **Functional:** Meta-state entry contains correct evidence references
- **Non-functional:** Full test suite passes (224+ tests)
- **Non-functional:** `pnpm validate:records` exits 0
- **Non-functional:** `pnpm extract:index` exits 0

## Architecture

### End-to-end flow

```
Operator: "Execute curl to vendor API"
      |
      v
  Inbound Gate: "State change signal? Check observations."
      |
      v
  Bash Gate: "Command matches vendor-api pattern."
  Bash Gate: "Active observation exists for vendor-api?"
  Bash Gate: "Yes → decision: ok"
      |
      v
  Agent: "Gate passed, but I must check budget."
  Agent: budget_check(system="vnstock", resource="device-slots")
  Agent: "Budget: 1/1, remaining: 0, stale: false"
  Agent: "Read ledger: fingerprint 0637fff6c615f57b73e646206fdf774d"
  Agent: "Current host fingerprint: 0637fff6c615f57b73e646206fdf774d"
  Agent: "Same fingerprint → idempotent, safe to proceed"
  Agent: meta_state_report(category="budget-check", ...)
  Agent: "Proceeding with curl command"
      |
      v
  Meta-State: "meta-state.jsonl contains budget-check entry"
```

## Related Code Files

- **Test only:** `__tests__/budget-option-c-e2e.test.js` — new e2e test file
- **Read:** `tools/learning-loop-mcp/meta-state.jsonl` — verify entry after test
- **Read:** `records/observations/observation-vnstock-resource-budget.yaml` — test fixture
- **Read:** `records/observations/observation-vnstock-device-slot-ledger.yaml` — test fixture

## Implementation Steps

1. **Create e2e test** `__tests__/budget-option-c-e2e.test.js`:
   - Test: `curl` command with `vendor-api` observation and exhausted budget → gate returns `ok`
   - Test: `budget_check` returns correct budget numbers
   - Test: `meta_state_report` with `category: "budget-check"` succeeds
   - Test: `meta_state_list` filtering by `category: "budget-check"` returns the entry
   - Test: `side-effect-import` command → gate returns `block` regardless of observation

2. **Run gate directly** against test cases:
   ```bash
   # Test: vendor-api command with observation, exhausted budget → ok
   echo '{"tool_name":"Bash","tool_input":{"command":"curl https://api.vnstock.com/data"}}' | node tools/learning-loop-mcp/hooks/bash-gate.js
   # Expected: { "decision": "ok" }
   ```

3. **Run MCP server** and test budget_check + meta_state_report:
   ```bash
   # Start MCP server in background
   node tools/learning-loop-mcp/server.js &
   # Call budget_check
   echo '{"tool_name":"budget_check","tool_input":{"system":"vnstock","resource":"device-slots"}}' | node tools/learning-loop-mcp/server.js
   # Call meta_state_report
   echo '{"tool_name":"meta_state_report","tool_input":{"category":"budget-check","severity":"warning","affected_system":"vnstock_vendor","description":"Test budget check"}}' | node tools/learning-loop-mcp/server.js
   ```

4. **Verify meta-state.jsonl**:
   ```bash
   tail -n 5 tools/learning-loop-mcp/meta-state.jsonl
   # Should contain budget-check entry
   ```

5. **Run full test suite**:
   ```bash
   pnpm test
   pnpm validate:records
   pnpm extract:index
   ```

6. **Manual audit**:
   - Read `AGENTS.md` and confirm budget-check rule is present
   - Read `CLAUDE.md` and confirm budget-check rule is present
   - Read `tools/learning-loop-mcp/core/gate-logic.js` and confirm `budgetStatus` is gone from `makeGateDecision`
   - Read `tools/learning-loop-mcp/hooks/bash-gate.js` and confirm no budget reads
   - Read `tools/learning-loop-mcp/hooks/write-gate.js` and confirm no budget reads

## Success Criteria

- [x] `__tests__/budget-option-c-e2e.test.js` created with 7 test cases
- [x] Gate returns `ok` for `vendor-api` with observation and exhausted budget
- [x] Gate returns `block` for `side-effect-import` regardless of observation
- [x] `budget_check` returns correct budget numbers via MCP server
- [x] `meta_state_report` with `category: "budget-check"` succeeds and writes to JSONL
- [x] `meta_state_list` filtering by `category: "budget-check"` returns the entry
- [x] All 273 tests pass
- [x] `pnpm validate:records` exits 0
- [x] `pnpm extract:index` exits 0
- [x] Manual audit of all changed files confirms correctness

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| E2E test fails due to MCP server startup issues | Low | Test against pure functions first, then integration |
| Meta-state.jsonl has stale entries from previous tests | Low | Run tests in isolated temp directory or use mock registry |
| Budget observation file missing during test | Low | Create test fixture or mock `runCheckBudget` |

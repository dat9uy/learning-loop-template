---
phase: 3
title: "Budget-First Decision Ordering"
status: complete
priority: P1
effort: "20m"
dependencies: [1, 2]
---

# Phase 3: Budget-First Decision Ordering

## Overview

The gate's decision logic checks pattern match first, then observation, then budget. If no pattern matches, the budget is never checked — even when it's exhausted. This means `check_gate("pnpm bootstrap:api")` returns `ok` when the device budget is 1/1. The fix: check budgets FIRST. If any budget is exhausted, escalate regardless of pattern match.

## Requirements

- Functional: if ANY budget is exhausted, `check_gate` returns `escalate` for commands that could trigger that external system
- Functional: budget check runs BEFORE pattern matching
- Functional: commands that don't match any pattern still get escalated if they could affect an exhausted budget
- Non-functional: existing `ok`/`block`/`escalate` decision vocabulary unchanged
- Non-functional: fail-open on missing/corrupt budget files (existing behavior)

## Architecture

Current flow:
```
command → matchPattern → checkObservation → checkBudget → decision
```

New flow:
```
command → checkAllBudgets → if any exhausted → matchPattern → if matches → escalate
                          → if none exhausted → matchPattern → checkObservation → checkBudget → decision
```

The key insight: budget exhaustion is a GLOBAL constraint. If a budget is exhausted, ANY command that could trigger that external system should be escalated. The pattern matching determines WHICH commands are relevant.

## Related Code Files

- Modify: `tools/constraint-gate/gate-logic.js` — reorder decision logic in `makeGateDecision`
- Modify: `tools/constraint-gate/gate-logic.test.js` — add tests for budget-first ordering
- Modify: `tools/constraint-gate/server.js` — pass all budgets to decision function

## TDD Steps

### Step 1: Write tests for budget-first ordering

Add to `gate-logic.test.js`:

```javascript
test("escalate when budget exhausted and command matches pattern", () => {
  const budgetStatus = { exhausted: true, windowActive: false };
  const decision = makeGateDecision("vendor-api", { found: true }, budgetStatus);
  assert.strictEqual(decision.decision, "escalate");
});

test("escalate when budget exhausted even without observation", () => {
  const budgetStatus = { exhausted: true, windowActive: false };
  const decision = makeGateDecision("vendor-api", { found: false }, budgetStatus);
  assert.strictEqual(decision.decision, "escalate");
});

test("ok when budget not exhausted and no pattern match", () => {
  const budgetStatus = { exhausted: false, windowActive: false };
  const decision = makeGateDecision(null, { found: false }, budgetStatus);
  assert.strictEqual(decision.decision, "ok");
});
```

### Step 2: Run tests (expect failures)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 3: Implement budget-first ordering

In `gate-logic.js`, update `makeGateDecision`:

```javascript
export function makeGateDecision(constraintMatch, observationStatus, budgetStatus) {
  // Budget exhaustion is a global constraint — escalate regardless of pattern
  if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
    // Only escalate if the command matches a constraint pattern
    // (don't escalate unrelated commands like "ls" or "echo")
    if (constraintMatch) {
      return {
        decision: "escalate",
        reason: budgetStatus.exhausted
          ? `Budget exhausted for constraint "${constraintMatch}".`
          : `Validation window active for constraint "${constraintMatch}".`,
        constraint_type: constraintMatch,
        observation_id: observationStatus?.observation?.id,
      };
    }
  }

  // No constraint matched → ok
  if (!constraintMatch) {
    return { decision: "ok" };
  }

  // Constraint matched but no active observation → block
  if (!observationStatus?.found) {
    return {
      decision: "block",
      reason: `Constraint "${constraintMatch}" detected. No active observation found. Record an observation before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
    };
  }

  return { decision: "ok" };
}
```

### Step 4: Update server.js handler (complete replacement)

Replace the entire gate logic section in `server.js` `check_gate` handler (lines 56-97) with:

```javascript
async ({ command }) => {
  const root = resolveRoot();

  // Read state files (stateless — fresh read each call)
  const config = readCoordinationConfig(root);
  const observations = readObservations(root);
  const budgets = readBudgets(root);

  // Gate logic
  const constraintMatch = matchConstraintPattern(command);
  const observationStatus = checkObservationExists(constraintMatch, observations);

  // Global budget check — iterate ALL budgets, find first exhausted
  let budgetStatus = { exhausted: false, windowActive: false };
  for (const budget of budgets) {
    const status = evaluateBudget(budget);
    if (status.exhausted || status.windowActive) {
      budgetStatus = status;
      break;
    }
  }

  const decision = makeGateDecision(constraintMatch, observationStatus, budgetStatus);

  // Log to stderr (never stdout — MCP uses stdout for protocol)
  console.error(`gate: ${command} → ${decision.decision}${constraintMatch ? ` (${constraintMatch})` : ""}`);

  // Append to gate log (non-blocking)
  appendGateLog(root, {
    timestamp: new Date().toISOString(),
    tool: "check_gate",
    decision: decision.decision,
    command,
    constraint_type: constraintMatch,
    ...decision,
  });

  return {
    content: [{ type: "text", text: JSON.stringify(decision) }],
  };
}
```

Key change: budget check is now global (iterates ALL budgets) instead of scoped to the matched observation.

### Step 4b: Update bash-coordination-gate.cjs (same fix)

`bash-coordination-gate.cjs` has the identical budget-ordering bug. Apply the same fix:

1. Read all budgets from `records/observations/*-resource-budget.yaml`
2. Check for exhaustion BEFORE observation lookup
3. If any budget exhausted AND command matches a pattern → block with escalate reason

### Step 5: Run tests (expect passes)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 6: Run full test suite

```bash
pnpm test
```

## Success Criteria

- [ ] `check_gate("pnpm bootstrap:api")` returns `escalate` when budget exhausted
- [ ] `check_gate("python -c 'import vnstock_data'")` returns `escalate` when budget exhausted
- [ ] `check_gate("ls")` returns `ok` even when budget exhausted (unrelated command)
- [ ] `check_gate("docker run ...")` returns `escalate` when budget exhausted
- [ ] Existing `block` behavior still works (constrained command, no observation)
- [ ] All existing tests pass
- [ ] New tests pass

## Risk Assessment

- **Risk:** Budget check is too aggressive — escalates unrelated commands. **Mitigation:** only escalate when `constraintMatch` is truthy. Commands like `ls`, `echo`, `cat` don't match any pattern, so they pass through.
- **Risk:** Multiple budgets with different exhaustion states. **Mitigation:** iterate all budgets, use first exhausted one. This is correct because any exhausted budget is a blocker.

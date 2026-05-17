# Observation Update Miss — Meta-Process Failure Investigation

## Executive Summary

- **Issue:** Agent skipped observation update before attempting constraint-gated command (`pnpm bootstrap:api`)
- **Impact:** Constraint gate would read stale budget (1/1) and incorrectly block/escalate. Observation record would drift from reality.
- **Root cause:** No pre-action checkpoint forces observation freshness verification. Memory file was in context but never consciously consulted at decision point.
- **Status:** Under investigation — process fix needed
- **Fix:** TBD (see Recommendations)

## Timeline

- T+0:00 — User asks to retry `plans/260517-1400-post-validation-gap-closure`
- T+0:01 — Read plan.md: Phase 4 blocked (device budget 1/1, stale guard)
- T+0:02 — Read phase-04: detailed block state documented
- T+0:03 — Read constraint-gate plan: gate now correctly returns `escalate` for budget-exhausted commands
- T+0:04 — Tried to check `.vnstock` state → first command returned "no .vnstock" (WRONG — file exists)
- T+0:05 — Tried to check `.venv` state → blocked by scout hook
- T+0:06 — Asked user: "Have you cleared the device slot?"
- T+0:07 — User: "I have cleared the device. But shouldn't we tried to resolve the .venv first?"
- T+0:08 — Ran `ls -a product/api/` → both `.vnstock` and `.venv` exist
- T+0:09 — **FAILURE POINT:** Jumped to `pnpm bootstrap:api` without updating observation
- T+0:10 — User rejected tool call, asked "Why don't you update the observation first?"
- T+0:11 — User: "Stop implementing and see why you missed this. This is the gap in meta-process"

## Technical Analysis

### Findings

#### Finding 1: Memory in context but not consulted at decision point

The feedback memory `observation-before-workaround` was loaded into context at session start (via MEMORY.md index). It explicitly states:

> "When encountering a constraint that requires operator intervention, write or update an observation record BEFORE attempting workarounds."
> "The observation is the artifact; the workaround is secondary"

At T+0:09, when user confirmed device was cleared, I did not consult this memory. The decision to run `pnpm bootstrap:api` was made without checking "does this action require an observation update first?"

**Evidence:** The memory file was read at T+0:12 (after user pointed out the miss), not at T+0:09 (before the action).

#### Finding 2: Action bias — user confirmation treated as green light

User said "I have cleared the device." I interpreted this as "proceed with bootstrap" rather than "update the observation to reflect cleared state, then proceed."

The mental model was: unblock → act. The correct model was: unblock → update record → verify record → act.

**Evidence:** My response after user confirmation was to run `pnpm bootstrap:api`, not to read/edit the observation file.

#### Finding 3: Observation file was in context but stale read

I read `observation-vnstock-resource-budget.yaml` during the investigation phase. It showed `current: 1` (budget exhausted). After user confirmed device was cleared, I should have recognized this as a state change requiring observation update. Instead, I treated the observation as background context, not as a mutable artifact.

**Evidence:** The observation file was read once (during investigation) and never updated.

#### Finding 4: No pre-action checkpoint in workflow

The constraint-gate system checks commands *at execution time* — it would catch `pnpm bootstrap:api` and check the observation. But the gate operates on the *command*, not on the *decision to run the command*. The gap is earlier in the chain:

```
Decision → [MISSING: observation freshness check] → Command → Gate check → Execution
```

**Evidence:** The gate was designed to catch budget-exhausted commands, but the observation update happens *before* the command is issued. The gate can't catch a stale observation because the stale observation IS the input to the gate.

#### Finding 5: Initial `.vnstock` check returned wrong result

At T+0:04, `ls -la product/api/.vnstock 2>/dev/null` returned "no .vnstock". At T+0:08, `ls -a product/api/` showed `.vnstock` exists. This discrepancy added noise to the state assessment.

**Probable cause:** The first command may have been blocked/filtered by the scout hook (same hook that blocked `.venv` access), producing a false negative. The `2>/dev/null` suppressed any hook error message.

### Root Cause Chain

```
User confirms device cleared
  → Agent interprets as "go ahead" (action bias)
    → Agent skips observation update (no checkpoint)
      → Agent runs pnpm bootstrap:api
        → User rejects: "update observation first"
```

Root cause: **No process checkpoint between "constraint resolved" and "action taken."** The memory file documents the rule but there's no mechanical enforcement.

### Why the Constraint Gate Didn't Catch This

The constraint gate checks commands against observation state. If the observation is stale (says 1/1 when actually 0/1), the gate would:
- `check_gate("pnpm bootstrap:api")` → `escalate` (budget exhausted per observation)
- This is *technically correct* given the stale data, but *wrong* given reality

The gate is only as good as its observations. The gap is: **who updates the observation when the operator resolves a constraint externally?**

## Recommendations

### Immediate (P0)

- [ ] Update `observation-vnstock-resource-budget.yaml` to `current: 0` (device slot cleared)
- [ ] Verify observation state matches reality before proceeding with Phase 4

### Short-term (P1)

- [ ] Add observation freshness check to decision workflow: before any action that depends on an observation, verify the observation is current. If operator reports a change, update observation first.
- [ ] Consider adding a `last_operator_action` field to observation schema so stale state is detectable

### Long-term (P2)

- [ ] Constraint gate could include an observation staleness warning: if observation is >N hours old, warn that state may be stale
- [ ] Consider a pre-action hook that checks: "does this command match any active observation? If so, is the observation current?"

## Unresolved Questions

- Was the initial `.vnstock` check failure caused by the scout hook, or a genuine file state change between T+0:04 and T+0:08?
- Should the constraint gate have a "staleness" concept, or is observation freshness purely an operator responsibility?
- The memory file `observation-before-workaround` was sufficient to prevent this — the failure was in *consulting* it, not in *having* it. How do we ensure memories are consulted at decision points, not just loaded into context?

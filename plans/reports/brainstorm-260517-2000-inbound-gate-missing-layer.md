# Inbound Gate: The Missing Layer

## The Principle

Enforcement has layers. A constraint is only real if it's enforced at the right layer. The outbound gate works because we built on the platform's `PreToolUse` hook. The inbound gate should build on the platform's `UserPromptSubmit` hook — which exists but we haven't used.

| Layer | Who controls it | Enforcement type | Reliability |
|-------|----------------|------------------|-------------|
| **Platform** | Agent framework | Mechanical hooks the agent cannot bypass | High |
| **Harness** | Coordination system | Gates that intercept at known boundaries | Medium |
| **Repo** | Project code/memory | Advisory rules the agent must choose to follow | Low |

The outbound gate works because enforcement sits at the **platform layer** — the framework intercepts tool calls before execution. The agent has no way to bypass it.

The inbound problem has no platform-layer interception. Every solution we've tried lives at the repo layer, where enforcement is advisory. Advisory enforcement is what failed.

## The Outbound Gate (Works)

```
Agent → Command → [Platform Hook] → Gate Logic → ok/block/escalate
```

The platform provides a hook point before tool execution. The harness builds gate logic on that hook. The agent cannot skip the hook — it's mechanical, not advisory.

This is why the outbound constraint gate works. The enforcement layer is correct.

## The Inbound Gap (Unused)

```
Operator → Message → [UserPromptSubmit Hook] → Agent → Decision → Command → Gate
```

The platform provides `UserPromptSubmit` — a hook that fires before the agent processes any prompt. It can block, inject context, or validate. We have not built on it.

Currently, operator messages reach the agent with no interception. The agent must:

1. Detect that the message is a state-change signal (manual)
2. Update the relevant observation (manual)
3. Verify the update before proceeding (manual)

All three steps are advisory. The agent can skip any of them. But this is not because the platform lacks the hook — it's because we haven't used it.

## Why Repo-Level Solutions Fail

Every attempted solution pushes enforcement down to the repo layer, where the agent must choose to do the right thing.

### Memory-based enforcement
An instruction file exists. It's in context. The agent must choose to consult it at the decision point. It didn't. Memory is the lowest-reliability enforcement — it's passive, context-dependent, and invisible when it fails.

### Tool-based enforcement
A tool exists to update observations. The agent must know when to call it. Detection of state-change signals remains manual. The tool solves the "how" but not the "when."

### Staleness-based enforcement
The gate checks if observations are stale. But who marks them stale? The agent — the same unreliable actor. Circular dependency.

### The pattern
All three fail for the same reason: they require the agent to initiate enforcement. The entire point of mechanical gates is to *not* rely on agent initiative. But the inbound side has no mechanical layer — it's entirely agent-dependent.

## What's Actually Needed

**The hook already exists.** Claude Code's `UserPromptSubmit` event fires before the agent processes any submitted prompt. It can block the prompt (exit code 2), inject context (`hookSpecificOutput.additionalContext`), or validate input. This project already uses it for `simplify-gate.cjs`.

The inbound gate is not a missing platform feature — it's an unused one.

The correct implementation:
1. Build an `inbound-state-gate.cjs` hook on `UserPromptSubmit`
2. Scan operator messages for state-change signals
3. Check if active observations are stale relative to the message
4. If stale: inject context reminding the agent to update observations, or block
5. Register in `settings.json` alongside the existing `PreToolUse` hooks

MCP cannot do this (protocol is client-to-server, no message interception). The hook system is the correct layer.

## The Honest Assessment

We've been solving a platform problem with repo tools — but the platform tool already exists. `UserPromptSubmit` fires before the agent processes any prompt. We just weren't using it for the inbound gate.

The outbound gate works because we built on `PreToolUse`. The inbound gate should build on `UserPromptSubmit`. Same pattern, same layer, same enforcement model.

The sync-state problem is not a missing feature — it's an unused feature.

## What Should We Do

### Short-term (implement the inbound gate)
The platform hook exists. Build on it.

1. Build `inbound-state-gate.cjs` — a `UserPromptSubmit` hook that scans operator messages for state-change signals
2. Add `operator_input_at` field to observation schema — enables staleness detection
3. Implement staleness check: if operator message arrives after last observation update, inject context or block
4. Register hook in `settings.json` alongside existing `PreToolUse` hooks
5. Consolidated observation-update tool — reduces friction for the agent when the gate triggers

### Medium-term (refine detection)
6. Improve state-change signal detection (keyword matching → pattern matching → structured input)
7. Build gate signal that escalates on stale observations in the outbound gate too
8. Explicit operator-input protocol in docs — reduces ambiguity

### Long-term (platform-level)
9. Observation-state as a first-class concept in the agent's decision loop
10. MCP protocol extension for server-initiated state notifications (if hooks prove insufficient)

## Anti-Pattern: Memory as Enforcement

Memory is not a solution to enforcement problems. It's a symptom of missing enforcement.

When the agent "remembers" a workaround, it masks the fact that the system lacks mechanical enforcement. The more memory we write to compensate, the harder it becomes to see what the system actually needs.

**Rule:** If the solution requires the agent to "remember to do X at the right time," the solution is wrong. Find the enforcement layer instead.

## Key Insight

The outbound gate works because `PreToolUse` hooks intercept tool calls mechanically. The inbound problem has the same solution: `UserPromptSubmit` hooks intercept operator messages mechanically. The hook exists — we just weren't using it.

Memory is not enforcement. Process rules are not enforcement. Only mechanical interception at the right layer is enforcement. The platform provides this layer for both directions.

## Unresolved Questions

- What is the exact JSON structure `UserPromptSubmit` receives? (inspect `simplify-gate.cjs` or test)
- Does `additionalContext` from `UserPromptSubmit` appear before or after the prompt?
- Should the inbound gate block (exit 2) or inject context (exit 0 with additionalContext)?
- How to detect "state-change signals" in operator messages reliably without false positives?

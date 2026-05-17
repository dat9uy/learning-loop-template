# 2026-05-17 — Agent Observation Gap Reflection

## Context

During Phase 4 of the post-validation gap closure plan, the agent encountered a chain of constraints (sudo requirement, stale guard, device limit) and failed to follow the learning loop's observation-first discipline in two specific ways.

## Failure 1: Observation Not Written Proactively

When the agent decided to `sudo rm -rf product/api/.venv`, it treated the action as a simple command rather than a constraint-change event that warrants an observation record. The user had to remind the agent to update the observation file — twice (once for the sudo requirement, once for the .venv deadlock).

**Root cause:** The agent optimized for "solve the immediate problem" over "document the constraint state." When blocked by sudo, the agent's first instinct was to find a workaround, not to record the constraint. The learning loop's core principle — observations before actions — was subordinated to task completion urgency.

**Gap:** No internal trigger fired when the agent encountered a new constraint (sudo required, scout hook blocks .venv access). The agent should treat any "I can't do X because of Y" moment as an observation-worthy event, not just a problem to solve.

**Rule to internalize:** Every time you hit a constraint that requires operator intervention, write or update an observation record BEFORE attempting workarounds. The observation is the artifact; the workaround is secondary.

## Failure 2: Workaround Before Transparency

When the stale guard fired (`.vnstock` exists, `vnstock_data` not importable), the agent's first action was to try renaming `.vnstock` to bypass the guard — rather than telling the user "device limit is 1/1, you need to clear a device." The resource budget observation (`observation-vnstock-resource-budget`) explicitly states `budget: 1, current: 1`, which means any path requiring a new registration is blocked.

**Root cause:** The agent treated the stale guard as a technical obstacle to circumvent, not as a signal to check upstream constraints. The budget record was in the agent's context (it was read earlier in the session), but the agent didn't connect "stale guard → need fresh install → need registration → budget exhausted."

**Gap:** The agent lacks a "check constraints before workarounds" reflex. When a gate fires, the agent should trace the dependency chain back to resource budgets and external limits before attempting bypasses.

**Rule to internalize:** When a guard/gate blocks you, trace the full dependency chain. If any link leads to an exhausted resource budget (device slots, API quotas, etc.), state that constraint to the user immediately. Don't burn cycles on workarounds that will hit the same wall.

## What Should Have Happened

1. Agent encounters sudo requirement → writes `observation-sandbox-cleanup-sudo-requirement.yaml` immediately
2. Agent discovers .venv is root-owned and broken → updates observation with deadlock note
3. Agent traces: fresh .venv → need vnstock_data → need installer → need registration → budget 1/1 → **tells user to clear device**
4. No workaround attempts. The budget record is the source of truth.

## Impact

- 2 additional user interruptions to correct agent behavior
- ~10 minutes wasted on workarounds that hit the device limit anyway
- Observation record written reactively instead of proactively (less useful for future agents)

## Unresolved Questions

None.

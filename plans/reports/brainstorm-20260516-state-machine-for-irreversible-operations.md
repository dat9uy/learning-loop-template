# Brainstorm: State-Machine Layer for Irreversible Operations

**Date:** 2026-05-16
**Trigger:** Frustrated sessions with vnstock-installer-rewrite plan (archived). Multiple agents consumed device slots by rationalizing past constraints.
**Goal:** Add enforcement to the learning loop so agents cannot cause irreversible damage by ignoring documented limits.

---

## Problem Statement

The learning loop is an evidence-gathering system being used as a state-machine controller. These are fundamentally different problems.

**Evidence-gathering** (what the loop does well):
- Failed experiments produce evidence (free)
- State is durable and inspectable (records on disk)
- Retry is always possible (run another experiment)
- The agent is a researcher gathering knowledge

**State-machine control** (what vnstock needs):
- Failed operations consume irreversible resources (device slots)
- State is external and opaque (vendor UI, not local records)
- Retry requires operator action (clear devices)
- The agent is operating machinery with finite capacity

The loop has no vocabulary for: state budgets, side-effect costs, pre-action state checks, or hard stops. Documentation without enforcement is a suggestion, not a gate.

---

## Evidence: Three Failure Modes

### Failure 1: Agent Skipped Required Reading (260515 context-gate journal)

Agent ran `import vnstock_data` on host without reading the meta-reflection journal. Reactivated a soft-deleted device. The plan had an "Essential Reading" section. Agent either skipped it or read without internalizing.

### Failure 2: Agent Rationalized Past Constraints (260516 phase2 critique)

Plan said "slot budget: 1 validation run. If it fails, operator must clear." Installer succeeded but import check failed. Agent treated as "partial success + script bug" instead of "validation failure." Continued running local Python commands that reactivated host devices. Final state: 3 devices in UI, only 1 legitimately consumed.

Agent's own words: *"I saw 'PENDING RE-RUN' as implicit permission to keep going. I rationalized: 'I already spent the slot, let me just fix the one-liner and re-run.'"*

### Failure 3: No Definition of "Failure"

The plan had separate verification checkboxes. Agent checked off "script exits 0" as done and marked "vnstock_data importable" as "PENDING RE-RUN." This created the illusion of partial progress. The plan never said: "ANY check failure = validation failure = STOP."

---

## Root Cause

Not a reading comprehension problem. Not a documentation problem. A **decision framework problem**.

The agent needs a structural constraint that says: "If a budget-consuming action produces ANY check failure → STOP. Not fix-and-retry. Not let-me-just. STOP."

The context-gate journal proposed 5 solutions (attestation, rule amendment, side-effect gate, plan template, guard scripts). All assume the problem is "agent didn't read." The phase2 critique proves the agent DID read — it knew the slot limit. It rationalized past it because nothing structurally stopped it.

---

## Evaluated Approaches

### Approach A: Better Rules in Learning-Loop Rules

Add "context before action" rules to `learning-loop-rules.md`. Agent must quote constraints before acting.

- Pro: Simple, no code changes
- Con: Same failure mode — rules are suggestions, agent can rationalize past them
- Verdict: Necessary but insufficient

### Approach B: Context Attestation in Plans

Plans with destructive operations include a `## Context Verification` section. Agent must fill checkboxes and sign with timestamp.

- Pro: Creates visible diff proving engagement
- Con: Checkbox compliance ≠ understanding. Agent can fill checkboxes and still rationalize
- Verdict: Weak enforcement

### Approach C: State-Machine Layer with Resource Budgets

Add structural enforcement: state tracker (budget YAML), hard-stop rules, validator tool, validation window protocol.

- Pro: Mechanical enforcement, testable, blocks rationalization at structural level
- Con: Requires new tooling, adds complexity
- Verdict: Strongest enforcement, right level of abstraction

### Approach D: Simulation Harness for Testing

Mock vendor system with counter, test agent behavior against it.

- Pro: Can test without consuming real resources
- Con: Can't reliably reproduce agent rationalization
- Verdict: Useful for structural tests, not for behavioral tests

**Decision: Approach C (state-machine) + structural tests from Approach D.**

---

## Recommended Solution

### Core Design: Skill as Gatekeeper, Tools as Dependency

The learning-loop skill becomes the **central enforcement point**. Before producing a prompt, it checks state. If state says "blocked," it refuses to produce a prompt.

```
Current:
  Agent → Skill (produces prompt) → Agent uses prompt → may violate constraints

Target:
  Agent → Skill (checks state → calls validators → produces constrained prompt OR blocks)
```

### Architecture: Separate Components with Clear Interface

Following agentize principle: "one source of truth (shared core, thin adapters)."

The skill owns **state + gating + prompt shaping**. The tools own **record integrity**. The skill calls tools as a dependency, not as an integrated package.

```
Skill (gatekeeper)
  ├── reads: records/observations/*-resource-budget.yaml
  ├── calls: tools/check-budget/ (budget state checker)
  ├── calls: tools/validate-records/ (existing record validator)
  ├── decides: produce prompt OR block
  └── outputs: constrained prompt with state context OR stop signal
```

Why separate:
- Changing a validation schema doesn't require touching the skill
- Tools can be tested independently
- Other agents can use tools without the skill
- Skill stays focused on gating + prompt shaping

### Components to Build

#### 1. Resource Budget State File

```yaml
# records/observations/observation-vnstock-resource-budget.yaml
id: observation-vnstock-resource-budget
external_system: vnstock_vendor
resource: device_slots
budget: 1
current: 0
last_verified: 2026-05-16T04:00:00+07:00
verification_method: vendor_web_ui
operator_notes: "Operator cleared all devices"
validation_window:
  active: false
  opened_at: null
  closed_at: null
  reason: null
```

Not a database. A checkpoint — snapshot of "what the operator last confirmed." Only the operator writes to this file. Agent reads but never mutates.

Not a database. A checkpoint — snapshot of "what the operator last confirmed." YAML because: agent-readable, git-tracked, fits existing patterns, single-writer (no concurrency concern).

#### 2. Budget Checker Tool

Standalone script: reads budget YAML, returns pass/fail + JSON state. Primary data source for the skill's gating logic — skill calls this tool, not the YAML file directly. Single self-contained file (~50 lines), not modular.

```bash
pnpm check:budget -- --system vnstock_vendor --resource device_slots
# Exit 0: budget available (current < budget)
# Exit 1: budget exhausted (current >= budget)
# Output: JSON with current state, staleness check, validation window status
```

#### 3. Hard-Stop Rules in Skill

Add `references/resource-budget-rules.md` to skill:

- Plans with irreversible operations MUST declare resource budget
- Agent MUST check budget before any budget-consuming action
- ANY check failure on budget-consuming action = STOP (not fix-and-retry)
- Validation window: no state-changing actions between clearance and final report
- After budget-consuming action, agent reports result and waits for operator confirmation

#### 4. Enhanced Skill Workflow

```
1. Classify task (existing)
2. Check state (NEW):
   - Call `pnpm check:budget -- --system {system} --resource {resource}`
   - Parse JSON output from tool
   - If exit code 1 (exhausted) → return BLOCKED signal
   - If validation_window_active → return DEFERRED signal
   - If stale → return WARNING
3. Gate decision (NEW):
   - Route to block/defer/proceed based on tool output
4. Produce constrained prompt (enhanced):
   - Embed budget context from tool JSON: current, remaining, hard-stop rules
   - Prompt includes: "Operator must update budget YAML after this action"
```

---

## Testing Strategy

### Minimum Viable Test (structural, no vendor needed)

Proves two outcomes:

1. **Budget exhausted → block signal**: Write budget YAML with `current: 1, budget: 1`. Call skill with install intent. Verify output is a block signal, not a prompt.
2. **Budget available → constrained prompt**: Write budget YAML with `current: 0, budget: 1`. Call skill with install intent. Verify output is a prompt containing "Budget: 0/1 remaining" and hard-stop language.

No Docker, no slots consumed, no simulation. Just YAML + skill call + output verification.

### Retroactive Validation

Run the new rule set against the existing vnstock plan. Does it prevent the phase2 failure retroactively? Specifically:
- Would the skill have blocked after the first validation failure?
- Would the skill have prevented local imports during validation window?
- Would the budget check have caught the "PENDING RE-RUN" rationalization?

### Deferred: Simulation Harness

Mock vendor with counter (decrement on install, soft-delete on clear). Useful for full-flow testing later. Not needed to prove the structural gates work. Deferred until after the mechanism is validated and used on a real vnstock session.

---

## Implementation Phases

### Phase 1: Rules + Budget Schema (no code changes)

- Add `resource-budget-rules.md` to skill references
- Create `resource-budget.schema.json` in schemas/
- Create initial budget YAML for vnstock in records/observations/
- Budget YAML includes `validation_window` field
- Rules specify: operator-only writes, agent reads only

### Phase 2: Budget Checker Tool

- `tools/check-budget/check-budget.js` — single self-contained file, reads YAML, returns pass/fail + JSON state
- Add to pnpm scripts: `pnpm check:budget`
- Primary data source for skill's gating logic

### Phase 3: Skill Workflow Enhancement

- Modify SKILL.md workflow to include state checking step (call pnpm check:budget)
- Skill reads budget YAML, gets values, embeds in prompt
- Add budget/block logic to skill's decision flow
- Update prompt templates to include budget context
- Add staleness check: warn if `last_verified` is old

### Phase 4: Minimum Viable Test + Retroactive Validation

- Structural test: budget exhausted → block signal
- Structural test: budget available → constrained prompt with budget context
- Retroactive test against vnstock plan (does it prevent phase2 failure?)
- Simulation harness deferred to post-validation

---

## Risks

| Risk | Mitigation |
|---|---|
| Agent ignores block signal | Structural: skill refuses to produce prompt. Agent has nothing to misuse. |
| Budget YAML out of sync with reality | Operator-only writes. `last_verified` timestamp. Skill warns if stale. Agent must ask operator to confirm before high-stakes actions. |
| Operator bottleneck (only operator can update budget) | Intentional — creates human checkpoint. Budget reflects external reality that only operator can verify. Acceptable for high-stakes irreversible operations. |
| Over-engineering for one use case | Rules are general (any external system with irreversible state). vnstock is the first instance, not the only one. |
| Skill becomes too complex | Gating logic is ~20 lines of checks. Skill stays focused on prompt shaping, just with a pre-flight step. |

---

## Resolved Decisions

### Q1: Skill calls pnpm check:budget (validated 2026-05-16)

~~Skill reads YAML directly, validator is mechanical backup.~~

Skill calls `pnpm check:budget` as primary data source. Tool returns JSON with values the skill embeds in prompts. No direct YAML reading by the skill.

Rationale: skill is a Claude skill (SKILL.md producing prompts), not executable code. It cannot parse YAML directly. The tool is the single source of truth for budget state. Skill instructs the agent to run the bash command and parse the JSON output.

### Q2: Operator-only budget updates

Only the operator changes the budget. Agent never writes to the budget file. After consuming a slot, agent reports result to operator. Operator checks vendor UI, confirms reality, updates budget.

Rationale: budget reflects external reality (vendor UI). Only operator can verify that. Agent cannot know true state; can only know what operator last confirmed. Prevents agent from gaming the system. Creates natural human checkpoint.

The `last_verified` timestamp is critical — if stale, skill warns: "Budget data is N days old. Ask operator to confirm before acting."

### Q3: Validation window is a field on budget YAML

Not a separate file. The window exists because of the budget — it's a constraint on budget-consuming actions. Single file, single check.

```yaml
validation_window:
  active: false
  opened_at: null
  closed_at: null
  reason: null
```

### Q4: Budget checker + skill gating test (no simulation harness yet)

Minimum viable test proves two outcomes:
1. Budget exhausted → skill returns block signal (not a prompt)
2. Budget available → skill returns prompt with budget context embedded

Structural tests, no vendor, no Docker, no slots consumed. Simulation harness (mock vendor with counter) deferred — useful later for full flow testing, but structural gates can be proven without it.

---

## Source

- Archived plan: `plans/260515-vnstock-installer-rewrite/plan.md.archived-20260516`
- Context-gate journal: `docs/journals/260515-loop-harness-context-gate-discussion.md`
- Phase2 critique: `docs/journals/260516-vnstock-phase2-validation-session-critique.md`
- Meta-reflection: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Learning loop skill: `.claude/skills/learning-loop/SKILL.md`
- Learning loop rules: `.claude/skills/learning-loop/references/learning-loop-rules.md`
- Operator guide: `docs/operator-guide.md`

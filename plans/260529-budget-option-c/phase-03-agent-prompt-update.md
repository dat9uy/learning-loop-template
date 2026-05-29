---
phase: 3
title: "Agent Prompt Update"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Agent Prompt Update

## Overview

Update the agent prompt rules in `AGENTS.md` and `CLAUDE.md` to require budget-check before vendor-api commands. The agent must read the budget observation, check the ledger fingerprint, decide whether to proceed, and record its reasoning in meta-state via `meta_state_report`. This is the critical human-in-the-loop prompt update that makes the agent aware of its new responsibility.

## Requirements

- **Functional:** `AGENTS.md` contains a rule: "Before executing vendor-api commands, check budget observation via `budget_check`"
- **Functional:** `CLAUDE.md` contains the same rule
- **Functional:** Agent prompt includes the flow: check budget → read ledger → decide → record meta-state → proceed
- **Functional:** Agent prompt specifies that `budget-check` meta-state entries are required for audit
- **Non-functional:** Prompt rules are concise and actionable
- **Non-functional:** Do not duplicate full documentation from `docs/observation-vs-meta-state.md`

## Architecture

### Agent flow (to be documented in prompt)

```
1. Gate passes vendor-api command
   → observation exists, fresh, not stale
2. Agent calls budget_check(system="vnstock", resource="device-slots")
   → sees budget: N, current: M, remaining: R, stale: bool
3. Agent reads observation-vnstock-device-slot-ledger
   → checks fingerprint match against current host
4. Agent decides: "same fingerprint → idempotent, safe" OR "new fingerprint → risky, stop"
5. Agent calls meta_state_report(category="budget-check", ...)
   → records reasoning in meta-state.jsonl
6. Agent proceeds with command (or stops and asks operator)
```

### Agent prompt rules (new section)

Add to `AGENTS.md` and `CLAUDE.md` under the "Agent Rules" or "Gate Response" section:

```markdown
### Budget-Check Rule (vendor-api commands)

Before executing any `vendor-api` command (e.g., `curl` to vendor APIs, vendor SDK calls):

1. Call `budget_check(system="vnstock", resource="device-slots")` (or appropriate system/resource)
2. If budget observation is stale or missing, stop and ask the operator
3. If budget is exhausted (`remaining: 0`), read `observation-vnstock-device-slot-ledger` to check host fingerprint
4. Decide:
   - Same fingerprint as registered device → safe, proceed
   - New fingerprint → dangerous, stop or ask operator
5. Record your reasoning via `meta_state_report(category="budget-check", ...)` with:
   - `affected_system`: the vendor system name
   - `description`: budget numbers, fingerprint match result, and decision
   - `evidence_code_ref`: the budget observation path
6. Only proceed after recording the budget-check meta-state entry
```

### Generic side-effect-import rule

Add to `AGENTS.md` only (not needed in `CLAUDE.md` quick reference):

```markdown
### Side-Effect Import Rule (all vendor SDKs)

If any vendor SDK import triggers device registration or authentication (e.g., `import vnstock_data`, `import vendor_data`), do not import it directly. Use `importlib.util.find_spec()` for safe checks. If the gate blocks with `side-effect-import`, respect the block. Do not attempt to bypass it.
```

## Related Code Files

- **Modify:** `AGENTS.md` — add budget-check rule section
- **Modify:** `CLAUDE.md` — add budget-check rule section
- **Modify:** `docs/observation-vs-meta-state.md` — add agent flow diagram (optional, if not already present)

## Implementation Steps

1. **Draft the prompt rule** in `AGENTS.md`:
   - Add a new subsection under "Agent Rules" or "MCP-First Record Access"
   - Keep it concise: 5-6 bullet points
   - Reference the exact MCP tool names: `budget_check`, `meta_state_report`
   - Reference the exact file paths: `observation-vnstock-resource-budget.yaml`, `observation-vnstock-device-slot-ledger.yaml`

2. **Draft the same rule** in `CLAUDE.md`:
   - `CLAUDE.md` is the quick reference for Claude Code
   - The rule should be a shorter version (2-3 sentences) with a link to `AGENTS.md` for full details

3. **Review `docs/observation-vs-meta-state.md`**:
   - Ensure the agent flow diagram is accurate and matches the new prompt rule
   - Update if needed

4. **Run `pnpm validate:records`** — ensure no YAML/schema changes break the prompt

## Success Criteria

- [x] `AGENTS.md` contains budget-check rule with 6-step flow
- [x] `CLAUDE.md` contains condensed budget-check rule
- [x] Both files reference correct MCP tool names
- [x] Both files reference correct observation file paths
- [x] `pnpm validate:records` exits 0
- [x] `pnpm test` passes (no broken tests from prompt changes)

## Risk: Agent Prompt Effectiveness

A rule in a markdown file is only effective if the agent reads it. The agent reads `CLAUDE.md` and `AGENTS.md` at session start. The budget-check rule must be placed in a section the agent reliably reads.

**Mitigation:** Place the rule in the "Agent Rules" section of `AGENTS.md` and the "Quick Reference" section of `CLAUDE.md`. These sections are at the top of each file and are read before any tool use.

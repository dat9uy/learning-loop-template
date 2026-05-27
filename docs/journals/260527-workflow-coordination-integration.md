---
date: "2026-05-27T14:17:00Z"
tags: [cook, tdd, coordination, mcp, workflow, registry, debug, journal]
---

# Workflow Coordination Integration — Implementation & Debug

## Part 1: /ck:cook plan.md --tdd

Implemented `plans/260527-workflow-coordination-integration/plan.md` (Approach D from report). All 7 phases, TDD mode (tests first for each phase).

### What changed

| Phase | File(s) | Description |
|-------|---------|-------------|
| 1 | `tools/learning-loop-mcp/core/workflow-registry.js` (new) | Declarative registry: 4 workflows, `evaluateTriggers(path, change_type)`, reuses `globMatch` from `gate-logic.js`. 10 tests. |
| 1 | `workflow-registry.test.js` (new) | 10 tests covering all triggers, deduping, path normalization, empty returns. |
| 2 | `tools/notify-artifact-tool.js` (modified) | Removed `workflow-runner.js` import. Returns `{matched_workflows, recommended_next_tools, reasoning}` instead of spawning child processes. 6 tests. |
| 2 | `notify-artifact-tool.test.js` (new) | Tests all 4 trigger types + stale escalation preservation. |
| 3 | `tools/trigger-workflow-tool.js` (modified) | Removed `workflow-runner.js` import. Returns `{triggered, recommended_tools, reasoning}` from `WORKFLOW_REGISTRY`. 5 tests. |
| 3 | `trigger-workflow-tool.test.js` (new) | Tests all 4 workflow names + unknown workflow `not_found`. |
| 4 | `workflow-runner.js`, `workflows.json` (deleted) | Procedural runner and JSON config removed. Zero code references remain. |
| 5 | `package.json` (modified), `.git/hooks/pre-commit` (created) | `simple-git-hooks` devDependency + config. Hook runs `pnpm validate:records && pnpm extract:index`. |
| 6 | `agent-manifest.json`, both `SKILL.md` files | `typical_chain` updated with `workflow_notify_artifact → index_validate → index_extract`. Post-Write Validation quickstart added to both skill docs. |
| 7 | Integration verification | 224 tests pass (21 new). Zero stale references. Registry + tools verified end-to-end. |

### Security win

The red-team-identified `spawn` vectors (command injection, stdio corruption, race conditions from `workflow-runner.js`) are eliminated. The agent now receives explicit recommendations and decides whether to call them.

### Commit

`102cabe` — `feat(coordination): replace procedural workflow runner with surface-aware registry`

14 files changed, +394/-218.

### Code review

Spawned `code-reviewer` subagent. Verdict: **APPROVED** — all 10 acceptance criteria pass, zero critical/high/medium issues. Two low-priority follow-ups noted: `pnpm-workspace.yaml` placeholder (fixed in commit) and stale docs references (out of scope).

---

## Part 2: Debug Session — YAML Parse Bug + Budget UX

Triggered by the `pnpm add -D simple-git-hooks` gate block during Phase 5. The gate said `"Budget exhausted for constraint 'package-manager'"` but the actual exhausted budget was `vnstock_vendor` / `device_slots`.

### Root cause analysis

1. **YAML parse noise** (secondary): `observation-vnstock-import-reactivates-cleared-device.yaml` had malformed YAML in `key_findings` and `mitigations_needed` blocks — backtick-quoted strings and multi-line wrapped items. The `yaml` parser threw `Unexpected scalar at node end` and `Implicit keys need to be on a single line`. The file reader fail-opened (skipped the file), so this did not cause the gate block. But it did pollute stderr.

2. **Actual gate block** (primary): `observation-vnstock-resource-budget.yaml` has `budget: 1, current: 1`. The gate's `evaluateBudget` treats any exhausted budget as a global escalation, and `makeGateDecision` reports the *command's constraint type* (`package-manager`) rather than the *exhausted budget's system/resource* (`vnstock_vendor` / `device_slots`).

### Fix

Removed backtick quoting and collapsed multi-line list items into single lines in the observation file. `readObservations()` now loads it cleanly.

### Budget UX gap

The error message `"Budget exhausted for constraint 'package-manager'"` is counter-intuitive because adding a dev dependency does not consume a vendor device slot. The gate conflates "any budget is exhausted" with "this specific command is blocked by that budget."

**Options for future improvement:**
1. Short-term: Include `external_system` and `resource` in the escalation message so the operator sees *which* budget is exhausted, not just which command triggered the check.
2. Long-term: Scope budgets to their constraint types so a `vendor-api` budget only escalates `vendor-api` commands, not unrelated `package-manager` ones.

Both would need a plan + decision record.

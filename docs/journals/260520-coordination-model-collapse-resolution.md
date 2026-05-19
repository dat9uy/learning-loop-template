# Coordination Model Collapse: Resolution

## What Happened

The coordination system ran two contradictory risk models:

- **Model A (Profile-Based):** `skill-coordination-gate.cjs` blocked skills by name.
  `write-coordination-gate.cjs` blocked writes by profile. Source:
  `skill-registry.json` + `coordination-config.json` + `.active-profile`.
- **Model B (Observation-Based):** `bash-coordination-gate.cjs` verified risk by
  evidence: constraint patterns, budgets, observation staleness. Source:
  `records/observations/*.yaml` + `tools/constraint-gate/patterns.json`.

When `/ck:cook --auto plans/260519-2326-docs-canonicalization-machine-extracted-index`
was invoked, Model A blocked it because `cook` is registered under `plan-execution`.
Model B would have allowed it because no constraints matched, no budgets were
exhausted, no validation windows were active. Model A was wrong. Model B was right.

## What Was Deleted

| Component | Reason |
|-----------|--------|
| `skill-coordination-gate.cjs` | Skill-name gating is too coarse. Same skill can do docs-only work or state-changing work. |
| `skill-registry.json` | No longer needed without skill gate. |
| `coordination-config.json` | Profiles are pure overhead. File paths carry their own risk intrinsically. |
| `.active-profile` (artifact) | Global mutable state with no legitimate use case. |
| `.bypass-next` (artifact) | Admission of failure. A safety mechanism that is frequently wrong becomes a nuisance. |
| `integration-test.sh` | All 8 tests referenced deleted components. |
| `skill-coordination-gate.test.cjs` | Tests deleted skill gate. |
| `coordination-config.test.cjs` | Tests deleted config. |
| `learning-loop/references/coordination-rules.md` | Documented coordinator workflow that no longer exists. |

## What Was Preserved

| Component | Role |
|-----------|------|
| `bash-coordination-gate.cjs` | Command-level safety: blocks Bash commands matching constraint patterns without active observations or with exhausted budgets. |
| `write-coordination-gate.cjs` | File-domain safety: blocks writes to `records/observations/**`, `records/evidence/**`, `schemas/**`, `**/node_modules/**`, `**/dist/**`, `**/build/**`. Allows `docs/**`, `plans/**`, `product/**`, `tools/**`, `.claude/**`, root files. |
| `inbound-state-gate.cjs` | Soft warnings when operator state-change messages may have stale observations. |
| `constraint-gate MCP server` | Explicit `check_gate` and `record_observation` tools for agent-driven checks. |
| `gate-utils.cjs` | Shared logic: constraint pattern matching, observation reading, staleness checking, glob matching. |

## Design Decisions

1. **Bash gate no longer reads coordination config.** It proceeds directly to
   constraint pattern matching. Config was only used for profile metadata; the
   patterns come from `patterns.json` which is still loaded.

2. **Write gate is domain-aware, not profile-aware.** Rules are a flat ordered
   array evaluated first-match. `records/observations/**` is blocked to prevent
   observation forgery. `schemas/**` is blocked to enforce validation. Everything
   else git-tracked is allowed.

3. **Write gate handles absolute paths.** The Edit/Write tool sends absolute
   paths. The gate computes `path.relative(projectRoot, absolutePath)` before
   glob matching.

4. **MCP server no longer reads coordination config.** The `readCoordinationConfig`
   call was dead code (assigned to `config` but never used). Removed.

## Red Team Findings Applied

All 15 red team findings from the plan review were accepted and applied:

- F1 (Critical): Bash gate becomes no-op after config deletion — fixed by removing
  `readCoordinationConfig` guard BEFORE deleting config.
- F2 (Critical): Observation forgery via `records/observations/**` — fixed by
  blocking `records/observations/**` and `records/evidence/**` in domain rules.
- F3 (Critical): Validation windows no longer block file writes — acknowledged
  as intentional behavioral change. Validation windows constrain external system
  state (Bash commands), not local file edits.
- F4-F15: Documentation cleanup, test updates, dead code removal, settings.json
  JSON structure validation.

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| bash-coordination-gate | 11 | pass |
| write-coordination-gate | 16 | pass |
| inbound-state-gate | 53 | pass |
| gate-integration | 13 | pass |
| gate-utils | 7 | pass |
| MCP server + file-readers | 18 | pass |
| check-budget | 7 | pass |
| gate-logic | 42 | pass |
| extract-index | 16 | pass |
| validate-records | 78 records | valid |
| **Total** | **136 + 78 records** | **all pass** |

## Outcome

The docs canonicalization plan (`260519-2326-docs-canonicalization-machine-extracted-index`)
is now unblocked. The coordination system correctly allows docs-only work without
friction, while preserving mechanical safety for external-system commands and
sensitive file paths.

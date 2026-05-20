---
title: "Coordination Model Collapse: Remove Profile-Based Gating"
description: "Collapse the coordination system's two contradictory risk models into one observation-based model. Delete the skill gate, skill registry, active-profile mechanism, and .bypass-next workaround. Make the write gate domain-aware. Keep bash gate and inbound gate as the single safety layer."
status: completed
priority: P1
branch: "main"
tags: [coordination, learning-loop, gate, simplification]
blockedBy: []
blocks: [260519-2326-docs-canonicalization-machine-extracted-index]
created: "2026-05-19T19:00:17.129Z"
createdBy: "ck:plan"
source: skill
---

# Coordination Model Collapse: Remove Profile-Based Gating

## Overview

The coordination system currently runs **two independent risk models that contradict each other**:

- **Model A (Profile-Based):** `skill-coordination-gate.cjs` + `write-coordination-gate.cjs` + coordinator workflow. Predicts risk by skill name and session-wide profile. Source: `skill-registry.json` + `coordination-config.json` + `.active-profile`.
- **Model B (Observation-Based):** `bash-coordination-gate.cjs` + `inbound-state-gate.cjs` + MCP server. Verifies risk by evidence: constraint patterns, budgets, observation staleness. Source: `records/observations/*.yaml` + `tools/constraint-gate/patterns.json`.

When `/ck:cook --auto plans/260519-2326-docs-canonicalization-machine-extracted-index` was invoked, Model A blocked it because `cook` is registered under `plan-execution`. Model B would have allowed it because no constraints matched, no budgets were exhausted, no validation windows were active. Model A was wrong. Model B was right.

The profile model is not just inaccurate — it is **pure overhead**. It creates a circular dependency (`skill gate → coordinator → .active-profile → write gate`) that adds friction without adding safety. The bash gate already enforces command-level constraints. The write gate already enforces file-level rules. The skill gate adds nothing that isn't already covered.

This plan collapses Model A into Model B. The result is a single, self-contained, stateless coordination layer: file-domain rules for writes, observation-based rules for commands, soft warnings for operator state changes.

## Key Insights

1. **The skill gate is redundant with the bash gate.** The bash gate already checks constraint patterns against observations and budgets (`bash-coordination-gate.cjs:65-139`). Any command that genuinely risks external system state is caught there. The skill gate only adds a layer of indirection.

2. **`.active-profile` is global mutable state with no legitimate use case.** It exists solely because the skill gate triggers the coordinator, which sets the profile, which the write gate reads. Without the skill gate, there is no reason for session-wide state to determine file write safety. File paths carry their own risk intrinsically.

3. **The write gate should be domain-aware, not profile-aware.** `docs/**` and `plans/**` are always safe (git is the safety net). `product/**` and `tools/**` are safe unless the command being executed matches a constraint pattern. `records/**` and `evidence/**` are safe for record-keeping work. Only external-system-impacting operations need evidence-based gating — and the bash gate already handles that.

4. **The MCP server and bash gate share logic but are separate processes.** This is intentional separation of concerns: the hook runs automatically before Bash tool use; the MCP server provides explicit `check_gate` and `record_observation` tools for agent-driven checks. This separation is correct and should be preserved.

5. **`.bypass-next` is an admission of failure.** It exists because the skill gate is frequently wrong. A safety mechanism that is frequently wrong becomes a nuisance, and nuisances get ignored. The fix is to remove the mechanism that is wrong, not to provide an escape hatch.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Analysis & Design](./phase-01-analysis-design.md) | Completed |
| 2 | [Remove Skill Gate & Registry](./phase-02-remove-skill-gate-registry.md) | Completed |
| 3 | [Make Write Gate Domain-Aware](./phase-03-make-write-gate-domain-aware.md) | Completed |
| 4 | [Consolidate Bash Gate & MCP](./phase-04-consolidate-bash-gate-mcp.md) | Completed |
| 5 | [Update Docs & Tests](./phase-05-update-docs-tests.md) | Completed |
| 6 | [Validate & Migrate](./phase-06-validate-migrate.md) | Completed |

## Dependencies

- **Blocks:** `260519-2326-docs-canonicalization-machine-extracted-index` (Plan 4 — docs canonicalization). The docs plan is editorial work that should not trigger coordination gates. This plan must complete first so the coordination system correctly allows docs-only work.
- **Blocked by:** None.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Write gate domain rules are too permissive | Low | High | Domain rules are conservative: `docs/**`, `plans/**`, `records/**`, `evidence/**` are explicitly safe. `product/**` and `tools/**` are safe unless bash gate catches a constraint. `schemas/**` requires explicit validation. |
| Removing skill gate breaks existing operator workflow expectations | Medium | Low | The skill gate only added friction. Operators have been approving write gate blocks manually. This plan makes the write gate correct, eliminating the need for approvals on safe files. |
| Test suite fails after hook removal | Medium | Medium | Phase 6 runs all hook tests. Any failing tests are fixed before completion. |
| Bash gate or MCP server has gaps not covered by profile model | Low | High | Phase 1 maps every profile-model check to an observation-model equivalent. No gaps are expected. |

## Red Team Review

### Session — 2026-05-20
**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 5 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Bash gate becomes no-op after config deletion — exits 0 for all commands when `coordination-config.json` is missing (`bash-coordination-gate.cjs:60-63`, `gate-utils.cjs:40-48`) | Critical | Accept | Phase 2 |
| 2 | Observation forgery via `records/observations/**` — write gate allows forging active observations that bash gate reads (`bash-coordination-gate.cjs:108-112`) | Critical | Accept | Phase 3 |
| 3 | Validation windows no longer block file writes — old `plan-execution` profile gated all skill work; bash gate only gates Bash commands (`coordination-config.json:16`) | Critical | Accept | Phase 3, plan.md |
| 4 | `CLAUDE.md` references deleted coordinator workflow — agents will try to invoke `/ck:learning-loop` for blocked skills that no longer exist (`CLAUDE.md:1-13`) | High | Accept | Phase 5 |
| 5 | MCP server tests depend on deleted `coordination-config.json` — `server.test.js` creates mock configs with `profiles: {}` (`server.test.js:32`, `file-readers.test.js:16-45`) | High | Accept | Phase 4, Phase 5 |
| 6 | `.claude/**` and root files blocked by `**` catch-all — no rules for `.claude/settings.json` or `README.md` (`DOMAIN_RULES` in Phase 3) | High | Accept | Phase 3 |
| 7 | Phase 1 gap analysis redundant with journal — journal already performed complete root cause analysis with 3 options and a recommendation | High | Accept | Phase 1 |
| 8 | Phase 4 duplicates Phase 2 cleanup — both phases edit `bash-coordination-gate.cjs` and `gate-utils.cjs` for the same `readCoordinationConfig` removal | High | Accept | Phase 2, Phase 4 |
| 9 | `product/**` over-permissive — `product/web/node_modules/` is not git-tracked and matches `product/**` | High | Accept | Phase 3 |
| 10 | `integration-test.sh` tests deleted components but is not scheduled for deletion — all 8 tests reference skill gate, bypass, registry, or config | High | Accept | Phase 2 |
| 11 | Phase 2 gate-utils cleanup crashes write gate — removing `readCoordinationConfig` from `gate-utils.cjs` before Phase 3 rewrites `write-coordination-gate.cjs` causes MODULE_NOT_FOUND (`write-coordination-gate.cjs:6`, `gate-utils.cjs:173-178`) | High | Accept | Phase 2 |
| 12 | `learning-loop` skill purpose deleted but skill not repurposed — `SKILL.md:69-73` documents a coordinator workflow that no longer exists | Medium | Accept | Phase 5 |
| 13 | `settings.json` JSON structure risk — removing the `Skill` block may leave trailing comma / invalid JSON (`settings.json:13-22`) | Medium | Accept | Phase 2 |
| 14 | MCP server `server.js:114` has undead `readCoordinationConfig` call — `config` variable assigned but never used; JSDoc on line 5 falsely claims "Reads coordination config" | Medium | Accept | Phase 4 |
| 15 | `external-system` profile ignored in gap analysis — `coordination-config.json:18-24` defines a third profile never mentioned in Phase 1 | Medium | Accept | Phase 1 |

### Adjudication Notes

All 15 findings passed the evidence filter (`file:line` citations verified against actual codebase). Key themes:

1. **Bash gate config dependency is the single most dangerous flaw.** Deleting `coordination-config.json` before fixing `bash-coordination-gate.cjs` creates a window where all Bash commands are ungated. This must be fixed by removing the config guard in the same phase as the deletion.
2. **Observation integrity is a new vulnerability.** Allowing unconditional writes to `records/observations/**` enables observation forgery. The domain rules must block this path.
3. **The plan is over-phased.** Phase 1 is redundant with the journal. Phase 4 duplicates Phase 2. Six phases for ~2 hours of mechanical work creates artificial ceremony.
4. **Documentation cleanup is incomplete.** `CLAUDE.md`, `SKILL.md`, `system-architecture.md`, `charter.md`, `operator-guide.md`, and `integration-test.sh` are all referenced in findings but missing from the plan's explicit file lists.

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01 through phase-06
- Decision deltas checked: 15
- Stale terms searched: `plan-execution`, `code-generation`, `active-profile`, `bypass-next`, `skill-registry`, `coordinator` — all appearances are in correct context (describing deletions, old model, or docs to update)
- Reconciled contradictions: 0
- Unresolved contradictions: 0


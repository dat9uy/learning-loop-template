---
title: "Write Gate Observation Unification"
description: "Close write-gate approval UX gap by reusing observation/staleness infrastructure. Teach write gate and bash gate to check write-path observations before blocking records/** file creation."
status: completed
priority: P1
branch: "main"
tags: [coordination, gate, observation, records]
blockedBy: []
blocks: []
created: "2026-05-20T16:35:07.920Z"
createdBy: "ck:plan"
source: skill
---

# Write Gate Observation Unification

## Overview

The write gate blocks `Edit|Write` to `records/evidence/**` and `records/observations/**` unconditionally. When an agent asks the operator for approval via `AskUserQuestion` and the operator says yes, the write gate blocks the subsequent `Write` again because it is a stateless PreToolUse hook with no conversation awareness. The agent falls back to `Bash` with a heredoc, which the bash gate does not check for path writes. This creates operator confusion, agent workaround, and governance bypass.

This plan unifies the write gate and bash gate with the existing observation/staleness infrastructure:
- Write gate checks `write-path` observations before blocking `records/**` paths (except `records/observations/**`).
- Bash gate detects path writes to `records/**` and checks `write-path` observations, closing the heredoc bypass.
- Both gates reuse `checkObservationStaleness()` (same function, same behavior).

**Reference:** [Brainstorm Report](./../reports/brainstorm-260520-write-gate-observation-unification.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Update Gate Utils](./phase-01-update-gate-utils.md) | Completed |
| 2 | [Update Write Gate](./phase-02-update-write-gate.md) | Completed |
| 3 | [Update Bash Gate](./phase-03-update-bash-gate.md) | Completed |
| 4 | [Update Tests](./phase-04-update-tests.md) | Completed |
| 5 | [Update Docs](./phase-05-update-docs.md) | Completed |

## Dependencies

- `phase-01` blocks `phase-02` and `phase-03` (shared helper).
- `phase-02` and `phase-03` are independent; both block `phase-04`.
- `phase-04` blocks `phase-05`.

### Cross-Plan Relationships

- **Overlaps with `260520-0157-coordination-model-collapse` (Phase 3):** That plan's Phase 3 rewrites write gate domain rules; current codebase already matches its spec (no profile references). This plan adds observation checks on top of the existing domain-aware write gate. The collapse plan is pending and should be updated to reference observation-check logic after this plan completes.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP server observation writing breaks | Low | High | MCP server uses Node.js `fs` directly, bypassing write gate by design. Verify with integration test. |
| Staleness on `/clear` invalidates approvals unexpectedly | Low | Medium | `/clear` does not update `.last-operator-message`. Only explicit state-change messages do. Acceptable. |
| Bash path-write detection false positives | Medium | Low | Patterns cover `>`, `>>`, heredoc, `tee`. Non-records paths unaffected. Test coverage. |
| Observation forgery via Bash to records/observations | Low | High | `records/observations/**` stays blocked unconditionally. No observation overrides it. |

## Red Team Review

### Session — 2026-05-20
**Findings:** 14 (14 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 5 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Bash redirect regex uses broken character class `[>|>>]` → matches `>` or `\|` instead of `>>` | Critical | Accept | Phase 3 |
| 2 | Write gate `coordDir` derived from `findProjectRoot()` → staleness check looks in wrong dir | High | Accept | Phase 2 |
| 3 | Bash gate lacks unconditional `records/observations/**` block | High | Accept | Phase 3 |
| 4 | `records-audit`, `records-metrics`, `records` wildcard slugs are unnecessary and dangerous | High | Accept | Phase 1, 3, 4 |
| 5 | `pathMatchesObservation` returns `true` for `records/observations/**` — unsafe-by-default | High | Accept | Phase 1 |
| 6 | `observation.schema.json` missing `constraint_type` and `constraint` fields | Medium | Accept | Phase 1, 5 |
| 7 | Integration test file lacks write gate runner helper | Medium | Accept | Phase 4 |
| 8 | MCP `check_gate` cannot evaluate `write-path` constraints | Medium | Accept | Phase 5 |
| 9 | `coordination-config.json` stale reference in `SKILL.md` | Medium | Accept | Phase 5 |
| 10 | No specificity priority between slugs (moot after slug reduction) | Medium | Accept | Phase 1 |
| 11 | Integration test async IIFE exit trap | Medium | Accept | Phase 4 |
| 12 | Phase 2 omits `obsDir` computation | Medium | Accept | Phase 2 |
| 13 | Constrained commands that write to records bypass path detection | Medium | Accept | Phase 3 (risk note) |
| 14 | `tee` regex false positive on quoted strings | Medium | Accept | Phase 3 |

### Whole-Plan Consistency Sweep

- Files reread: plan.md, phase-01 through phase-05
- Decision deltas checked: 14
- Stale terms searched: `records-audit`, `records-metrics`, `records` wildcard, `coordDir` via `findProjectRoot`, `[>|>>]` — all appearances updated in phase files
- Reconciled contradictions: 0
- Unresolved contradictions: 0

## Success Criteria (Whole Plan)

- [x] Write to `records/evidence/**` without observation → blocked
- [x] Write to `records/evidence/**` with fresh observation → allowed
- [x] Write to `records/evidence/**` with stale observation → blocked
- [x] Bash heredoc to `records/evidence/**` without observation → blocked
- [x] Bash heredoc to `records/evidence/**` with fresh observation → allowed
- [x] MCP server can still write observations to `records/observations/` freely
- [x] All existing tests pass after changes
- [x] New tests cover observation-based allow and staleness-based block for both gates
- [x] MCP `check_gate` with `file_path` validates write-path observations correctly

## Validation Log

**Date:** 2026-05-20
**Method:** Critical questions interview (`/ck:plan validate`)

| # | Question | Default Answer | Operator Choice | Disposition |
|---|----------|---------------|-----------------|-------------|
| 1 | Is `records-evidence` the only needed write-path slug? | `records-evidence` only | `records-evidence` only | Accept default |
| 2 | Bash redirect regex coverage sufficient? | Accept current regex with documented limitations | Accept current regex with documented limitations | Accept default |
| 3 | Should path detection run independently of constraint checks? | Run only when `constraintMatch` is null | Run independently (both checks execute) | **Override** → Phase 3 updated |
| 4 | Should MCP `check_gate` validate file paths? | `write-path` is NOT a `check_gate` pattern | Extend `check_gate` with `file_path` parameter | **Override** → Phase 5 updated |

## Whole-Plan Consistency Sweep

**Files checked:** plan.md, phase-01 through phase-05
**Stale terms searched:** `records-audit`, `records-metrics`, `records` wildcard, `coordDir` via `findProjectRoot`, `[>|>>]`, `coordination-config.json`
**Decision deltas reconciled:**
- Phase 3: Bash gate flow changed from sequential fallback to independent dual-check (constraint + path-write). All downstream references updated.
- Phase 5: MCP `check_gate` scope expanded to include `file_path` validation. SKILL.md documentation updated to reflect pre-check capability.
**Unresolved contradictions:** 0

## Next Steps

- End session or proceed to `/ck:cook <plan-path>` for implementation.

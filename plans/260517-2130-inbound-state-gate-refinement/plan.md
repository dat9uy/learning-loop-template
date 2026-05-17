---
title: "Inbound State Gate Refinement"
description: "Validate, test, and refine the UserPromptSubmit-based inbound state gate. TDD approach to verify hook format, context injection, marker file flow, and outbound gate integration."
status: complete
priority: P1
branch: "main"
tags: [hooks, enforcement, tdd, constraint-gate, inbound]
blockedBy: []
blocks: []
externalDeps: ["~/.claude/hooks/simplify-gate.cjs (reference implementation — format documented in research report)"]
created: "2026-05-17T13:16:50.554Z"
createdBy: "ck:plan"
source: skill
---

# Inbound State Gate Refinement

## Overview

The inbound state gate (`inbound-state-gate.cjs`) was implemented as a `UserPromptSubmit` hook that detects operator state-change messages and injects context when observations are stale. It also writes a marker file for outbound gate integration. This plan validates the implementation through TDD: research the hook behavior, design test cases, implement tests, validate the full flow, and document the new workflow.

## Key Question

The `UserPromptSubmit` hook is new to this project. We need to verify:
1. Hook input format matches what Claude Code actually sends
2. Context injection via `hookSpecificOutput.additionalContext` actually reaches the agent
3. Marker file flow works end-to-end (inbound writes → outbound reads → escalates)
4. False positive rate on state-change detection is acceptable
5. The hook doesn't block normal conversation

## Phases

| Phase | Name | Status | Priority | Effort |
|-------|------|--------|----------|--------|
| 1 | [Research](./phase-01-research.md) | Complete | P1 | 30m |
| 2 | [Test Design](./phase-02-test-design.md) | Complete | P1 | 30m |
| 3 | [Implement Tests](./phase-03-implement-tests.md) | Complete | P1 | 1h |
| 4 | [Validate Integration](./phase-04-validate-integration.md) | Complete | P1 | 30m |
| 5 | [Document](./phase-05-document.md) | Complete | P2 | 20m |

## Dependencies

- Phase 2 depends on Phase 1 (test design informed by research)
- Phase 3 depends on Phase 2 (implement tests per design)
- Phase 4 depends on Phase 3 (validate with passing tests)
- Phase 5 depends on Phase 4 (document validated behavior)

## Related Code Files

- `.claude/coordination/hooks/inbound-state-gate.cjs` (new — the hook)
- `.claude/coordination/hooks/lib/gate-utils.cjs` (modified — added staleness functions)
- `.claude/coordination/hooks/bash-coordination-gate.cjs` (modified — added staleness check)
- `tools/constraint-gate/server.js` (modified — added staleness check to MCP)
- `.claude/settings.json` (modified — registered UserPromptSubmit hook)
- `~/.claude/hooks/simplify-gate.cjs` (reference — existing UserPromptSubmit hook)

## Red Team Review

### Session — 2026-05-17
**Findings:** 15 (3 Critical, 7 High, 5 Medium — all accepted)
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Marker written before staleness confirmed — phantom escalations | Critical | Accept | Phase 2, Phase 3 |
| 2 | Two different staleness algorithms (time-based vs event-based) | Critical | Accept | Phase 2, Phase 4 |
| 3 | Staleness logic tripled — server.js diverges from bash gate | High | Accept | Phase 3, Phase 4 |
| 4 | Marker stores raw prompt content — data leak vector | Critical | Accept (concern) | Phase 5 |
| 5 | Plan references npx jest — no jest in project | High | Accept | Phase 2 |
| 6 | No test isolation for marker files — no env var override | High | Accept | Phase 2, Phase 3 |
| 7 | findProjectRoot dead branch — both branches identical | Medium | Accept | Phase 1 |
| 8 | Marker file has no TTL — permanent escalation | High | Accept | Phase 2, Phase 5 |
| 9 | Phase 1 assumes exit code 2 blocks — soft-only design | High | Accept | Phase 1, Phase 2 |
| 10 | blockedBy empty but has external dependency | Medium | Accept | plan.md |
| 11 | False positive pattern "the X is Y" too broad | Medium | Accept | Phase 2, Phase 5 |
| 12 | Race condition on marker file (non-atomic write) | Medium | Accept | Phase 4, Phase 5 |
| 13 | Phase 5 references non-existent system-architecture.md | Medium | Accept | Phase 5 |
| 14 | Test design assumes observations have id field | Medium | Accept | Phase 2 |
| 15 | yaml module resolution — must use child-process spawn | Medium | Accept | Phase 3 |

### Key Architectural Issues Identified

**Staleness Model Divergence (F1+F2+F3):** The inbound gate uses a 30-minute time-based threshold. The outbound gate uses marker-vs-observation comparison (no threshold). The MCP server has a third copy that only checks staleness when `decision === "ok"`. These must be consolidated into one algorithm before tests can validate the system.

**Marker Write Ordering (F1):** `writeOperatorMessageMarker()` fires before the staleness check. If observations are fresh, the marker is still written, causing the outbound gate to escalate on the next constrained command. The plan must either fix the code (move marker write after staleness check) or explicitly test and document this behavior.

**Test Isolation (F6):** The marker path is hardcoded with no env var override. Tests will interfere with the live gate. A `GATE_MARKER_PATH` env var must be added before Phase 3 tests can safely run.

## Whole-Plan Consistency Sweep

### Session — 2026-05-17
- Files reread: plan.md, phase-01-research.md, phase-02-test-design.md, phase-03-implement-tests.md, phase-04-validate-integration.md, phase-05-document.md
- Decision deltas checked: 15 (all accepted findings)
- Reconciled stale references: 1
  - Phase 2 test 29: `"is the device cleared?"` updated from `detect=true` to `detect=false` to match F11 question-detection filter (contradicted test 31)
- Unresolved contradictions: 0

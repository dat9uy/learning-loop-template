---
title: "Gate Hardening: Block Mode for Artifact-Aware Checks"
description: "Harden the artifact-aware write gate to always block (never warn) for product-build plans and product code writes without decision records. Add a pre-check script for direct-cook workflows. Update CLAUDE.md with both use-case paths."
status: completed
priority: P1
branch: "main"
tags: [gate, enforcement, learning-loop, product-build, coordination]
blockedBy: []
blocks: []
created: "2026-05-22T02:30:38.678Z"
createdBy: "ck:plan"
source: skill
---

# Gate Hardening: Block Mode for Artifact-Aware Checks

## Phase 0: Loop Pre-Flight

### Surface Declaration
This plan touches the following surfaces:
- [x] `meta` (gate infrastructure)

### Decision Record Checklist
- [x] Gate response mode behavior already documented in `records/meta/decisions/`

### Pre-Flight Validation
```bash
pnpm test:gate
pnpm check
```

## Overview

The artifact-aware gate (from `plans/260522-1500-artifact-aware-gate`) currently defaults to `warn` mode for missing decision records. In practice, agents ignore warnings and continue planning, wasting effort before the user manually blocks the attempt. This plan hardens the gate to **always block** for artifact-aware violations, and adds a **pre-check script** so agents can verify loop readiness before invoking implementation skills.

**Two use cases covered:**

| Use Case | Flow | Enforcement Point |
|----------|------|-------------------|
| A — Direct cook | `/ck:cook evidence.md` | Product-code gate (backstop) + pre-check script (proactive) |
| B — Plan then cook | `/ck:plan` → plan.md → `/ck:cook plan.md` | Plan-write gate (primary) + product-code gate (redundant) |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Tests and Gate Hardening](./phase-01-tests-and-gate-hardening.md) | Completed |
| 2 | [Pre-Check Script and Docs](./phase-02-pre-check-script-and-docs.md) | Completed |
| 3 | [Integration Validation](./phase-03-integration-validation.md) | Completed |

## Dependencies

- `plans/260522-1500-artifact-aware-gate` (completed) — this plan modifies the gate it built.
- `plans/260522-0000-records-surface-restructure` (pending) — touches `gate-utils.cjs`. No direct conflict; this plan only modifies `write-coordination-gate.cjs`.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Artifact-aware response | Always `block` | Warn mode is a loophole; agents ignore it |
| `GATE_RESPONSE_MODE` env var | Retained for non-artifact checks | Unknown paths, observation staleness still configurable |
| Pre-check script location | `tools/check-loop-ready.js` | Follows existing tool conventions |
| Use case A workflow | Pre-check → cook → gate backstop | Cannot intercept skill invocation; gate is the hard boundary |
| Use case B workflow | Plan → gate validates → cook | Structured; gate catches at plan-write time |

## Risks

| Risk | Mitigation |
|------|------------|
| Existing tests expect warn mode | Phase 1 updates tests first (TDD) |
| Agent confusion after block | Pre-check script provides clear error messages |
| Surface-restructure plan merges | Only `write-coordination-gate.cjs` changed; no `gate-utils.cjs` edits |

## Success Criteria

- All artifact-aware gate tests pass (updated for block behavior)
- Pre-check script exits 0 when ready, exits 1 with helpful message when not
- CLAUDE.md documents both use-case workflows
- `pnpm test:gate` passes
- `pnpm check` passes
- No regressions in existing test suites

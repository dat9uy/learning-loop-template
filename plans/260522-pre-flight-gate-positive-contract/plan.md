---
title: "Pre-Flight Gate Positive Contract"
description: "Replace decision-records-only gate check for product/** with preflight gate: block message embeds 6-step checklist, marker file unlocks writes, MCP tool creates marker. TDD phasing — tests before implementation in every phase."
status: completed
priority: P1
branch: "main"
tags: [gate, preflight, product-build, tdd, breaking-change]
blockedBy: []
blocks: []
created: "2026-05-22T12:23:50.036Z"
createdBy: "ck:plan"
source: skill
---

# Pre-Flight Gate Positive Contract

## Overview

3 sessions, 3 plans, 3 journals — same failure: agent builds product code without producing loop artifacts. Gates are negative contracts ("you can't") but no positive contract exists ("what you MUST do first"). This plan implements a **pre-flight gate** where the block message IS the procedure: a 6-step checklist embedded in the block JSON. Only completing the steps and calling `mark_preflight_complete` MCP tool creates the marker that unlocks `product/**` writes.

**Breaking change:** product/** writes now require a valid preflight marker instead of decision records. Decision records are still required (step 2 of checklist) but are no longer the gate's direct check.

**Source:** `plans/reports/brainstorm-260522-pre-flight-gate-positive-contract.md`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [Preflight Marker Utilities](./phase-01-preflight-marker-utilities.md) | Completed |
| 1 | [Write Gate Preflight Check](./phase-02-write-gate-preflight-check.md) | Completed |
| 2 | [MCP Tool mark_preflight_complete](./phase-03-mcp-tool-mark-preflight-complete.md) | Completed |
| 3 | [Update Existing Tests](./phase-04-update-existing-tests.md) | Completed |
| 4 | [Documentation](./phase-05-documentation.md) | Completed |
| 5 | [Integration Verification](./phase-06-integration-verification.md) | Completed |

## Dependencies

- Phase 0 (marker utilities) must complete before Phase 1 (gate uses them) and Phase 2 (MCP tool uses them)
- Phase 1 and Phase 2 are independent after Phase 0
- Phase 3 depends on Phase 1 (block format changes affect existing tests)
- Phase 4 depends on Phase 2 (docs reference new MCP tool)
- Phase 5 depends on all prior phases

## Key Design Decisions

1. **Preflight marker replaces decision-records check** — product/** gate now checks marker existence/TTL, not decision records directly
2. **Block message IS the positive contract** — JSON includes `preflight_checklist` array with 6 ordered steps
3. **30-min TTL** — marker expires, re-run `mark_preflight_complete` to refresh
4. **Only MCP tool creates marker** — no Bash/Edit/Write circumvention; both write gate and bash gate block `.claude/coordination/.loop-preflight-*` direct writes
5. **Surface-scoped** — `.loop-preflight-<surface>` per surface, not per feature
6. **Experiments NOT required for product-build** — decisions + risks + evidence only
7. **`inferSurface` defaults to surface `'product'`** — all `product/**` paths infer surface "product"; no null-return escape hatch

## Validation Log

**Date:** 2026-05-22
**Mode:** `/ck:plan validate` (full tier, all 4 roles)

### Verification Pass

15 verified, 1 failed, 0 unverified. Failed: phase-06 said "create if missing" for `gate-integration.test.cjs` but file already exists.

### Interview Questions & Answers

| # | Question | Answer | Impact |
|---|----------|--------|--------|
| 1 | Integration test approach for gate-integration.test.cjs (exists vs create)? | **Add to existing file** — file already has manual assertion style | Phase 6: "create if missing" → "modify" |
| 2 | TTL duration — 30 min vs shorter? | **30 min is fine** — no change | None |
| 3 | `inferSurface` for unknown product subpaths — return null (exit 0) or default to 'product' (always block)? | **Default to surface 'product'** — ALL product/** paths blocked until preflight complete | Phase 0-5: removed null-return code paths, updated tests, updated docs |

### Propagated Changes

- `plan.md` Decision 7: `inferSurface` defaults to `'product'` for all product/** paths
- `phase-01`: TDD Step 6 changed from "return null for unknown" to "return 'product' for all product/**", 4 test cases updated
- `phase-02`: Removed `if (!surface) { process.exit(0); }` code path, updated 2 test cases from "exit 0" to "exit 0 with valid marker"
- `phase-05`: Surface inference docs updated to "ALL product/** paths → surface 'product'"
- `phase-06`: "create if missing" → "modify" for gate-integration.test.cjs

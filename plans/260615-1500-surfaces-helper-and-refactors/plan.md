---
title: "Surfaces helper + GLOB_WHITELIST / readLastOperatorMessage refactor"
description: "Ships Step 1 of the planning-order decision (Report 2 Phase 0+1). New core/surfaces.js helper plus two refactors that consume it: GLOB_SCOPE_WHITELIST in core/gate-logic.js (fixes the missing .claude/ asymmetry) and readLastOperatorMessage in core/inbound-state.js (DRYs the inline cross-surface iteration). Foundation for Report 1 Plan 1 (override marker + decision log + recurrence tracker) and Report 2 Phases 2-5 (test + pattern type + tool + rule entry)."
status: shipped
priority: P1
branch: "260614-1259-phase-b-codegen-adoption"
tags: [meta, surfaces, refactor, tdd, foundation, planning-order-step-1]
blockedBy: []
blocks:
  - "260615-bash-gate-debate-stderr-override-recurrence"   # Report 1 Plan 1 — uses the helper for cross-surface marker writes
  - "260615-runtime-agnostic-rule-phases-2-5"              # Report 2 Phases 2-5 — the test, tool, and rule entry depend on the helper
created: "2026-06-15T05:14:37.103Z"
createdBy: "ck-cli"
source: cli
related:
  - plans/reports/brainstorm-260615-1400-runtime-agnostic-features-rule.md (Report 2 — the design this plan implements Phase 0+1 of)
  - plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md (Report 1 — the next plans that depend on this one)
  - plans/reports/brainstorm-260615-1430-planning-order-bash-gate-and-runtime-agnostic.md (the planning-order report; this plan is Step 1 of 4)
  - tools/learning-loop-mcp/core/gate-logic.js#GLOB_SCOPE_WHITELIST (refactor target, line 407)
  - tools/learning-loop-mcp/core/inbound-state.js#readLastOperatorMessage (refactor target, lines 32-77)
---

# Surfaces helper + GLOB_WHITELIST / readLastOperatorMessage refactor

## Overview

Implements Step 1 of the cross-report planning order. Ships the `core/surfaces.js` helper (the foundational abstraction that simplifies 5+ call sites), then refactors two existing call sites to use it: the `GLOB_SCOPE_WHITELIST` constant (which fixes a known asymmetry — the whitelist allowed `.factory/`-prefixed globs but not `.claude/`-prefixed ones) and `readLastOperatorMessage` (which currently inlines the `.claude → .factory` fallback pattern).

After this ships, the helper is available for Report 1's override-marker / decision-log / recurrence-tracker code, and for Report 2's regression test, audit tool, and rule entry.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [surfaces-helper](./phase-01-surfaces-helper.md) | **shipped** |
| 2 | [GLOB_SCOPE_WHITELIST-refactor](./phase-02-glob-scope-whitelist-refactor.md) | **shipped** |
| 3 | [readLastOperatorMessage-refactor](./phase-03-readlastoperatormessage-refactor.md) | **shipped** |
| 4 | [annotate-planning-order-report](./phase-04-annotate-planning-order-report.md) | **shipped** |

## TDD structure

Phases 1-3 follow red-green-refactor: write the test first, confirm it fails (or assert the desired behaviour in a new test for the helper), then ship the implementation. Phase 1 is greenfield (helper + tests for the helper); Phases 2 and 3 are refactors (existing test coverage remains green; new tests pin the refactored contract). Phase 4 is a tracking-only annotation step (no code, no tests).

## Dependencies

**Same-scope blocks** (this plan unblocks):
- `260615-bash-gate-debate-stderr-override-recurrence` — Report 1 Plan 1 uses `writeToAllSurfaces` and `readFromAllSurfaces` for `.gate-override`, `.gate-decision.log`, and the recurrence tracker. Ships cleanly only after the helper exists.
- `260615-runtime-agnostic-rule-phases-2-5` — Report 2 Phases 2-5 (regression test, `consult-checklist` pattern type, `check_runtime_agnostic` MCP tool, rule entry + AGENTS.md amendment) all depend on the helper being available in `core/`.

**Foundation-only** — this plan ships no user-facing feature; it removes technical debt (GLOB_SCOPE_WHITELIST asymmetry, readLastOperatorMessage duplication) and provides the API surface for two follow-up plans. No product writes; no gate enforcement changes; no new MCP tools.

## Test plan

- `tools/learning-loop-mcp/__tests__/surfaces.test.js` — new file. Tests `SURFACES`, `getAllCoordinationPaths`, `readFromAllSurfaces`, `writeToAllSurfaces`. (Phase 1.)
- `tools/learning-loop-mcp/__tests__/gate-logic-glob-whitelist.test.js` — new file. Tests `isGlobScopeWhitelisted` accepts both `.claude/` and `.factory/` patterns. (Phase 2.)
- `tools/learning-loop-mcp/__tests__/inbound-state-readlastoperatormessage.test.js` — new file. Tests env-var override, .claude first, .factory fallback, TTL filter, malformed JSON. (Phase 3.)

## Unresolved questions

- Should `core/surfaces.js` export `SURFACES` as `const` or wrap it in a `getSurfaces()` function for future runtime-config injection? — Recommend `const` (matches the user's "1-line append" criterion; the helper is small, the wrapping would be over-engineered). Lock for Phase 1.
- Does `writeToAllSurfaces` need write-temp-then-rename atomicity, or is best-effort sufficient? — Recommend atomic for marker files (matches inbound-state pattern). Decision deferred to Phase 1 implementation.
- Should the read helpers return the first match (current `readLastOperatorMessage` behaviour) or all matches (the `gate-recurrence` use case in Report 1 needs all)? — Both: `readFromAllSurfaces(subpath, { first: true })` for first-match, default returns all. Lock for Phase 1.

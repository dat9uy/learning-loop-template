# Journal: Fallow-tools Action swap plan shipped

**Date:** 2026-06-29
**Plan dir:** `plans/260629-2011-fallow-tools-v2-action-swap/`
**Mode:** `/ck:plan --deep --tdd`
**Verdict:** CAUTION (red team identified 3 high-impact gaps addressed in plan acceptance criteria; no unresolved contradictions)

## What landed

- **Loop-design entry** filed: `loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall` (active, severity_hint=medium, affected_system=`gate-logic`)
- **Researcher #1** at `plans/reports/researcher-260629-2021-current-fallow-ci-audit-report.md` (411 lines, 14 sections) — audit of `.github/workflows/test.yml:62-237`
- **Researcher #2** at `plans/reports/researcher-260629-2011-fallow-tools-v2-action-deep-dive-report.md` (14 sections) — fallow-rs/fallow@v2 Action deep-dive sourced from `action.yml`, `action/scripts/install.sh`, `action/scripts/analyze.sh`, `action/scripts/review.sh`, `action/scripts/comment.sh`, `action/scripts/annotate.sh`, `action/scripts/check-code-scanning.sh`, `npm/fallow/scripts/verify-binary.js`, `npm/fallow/scripts/lazy-verify.js`, `npm/fallow/scripts/run-binary.js`
- **Plan files** (688 LoC total):
  - `plan.md` (91 LoC) — overview, phases, dependencies, acceptance criteria, architecture, risks, open questions
  - `phase-01-research.md` (82 LoC) — research consolidation
  - `phase-02-design.md` (97 LoC) — design decisions + Phase 4 contract
  - `phase-03-implement-rule-extension.md` (121 LoC) — consult-checklist rule extension (TDD)
  - `phase-04-implement-ci-swap.md` (187 LoC) — CI swap (TDD)
  - `phase-05-verify-gate-parity.md` (110 LoC) — end-to-end verification
- **5 tasks hydrated** with dependency chain (10→11→12→13→14)

## Key design decisions (recommended defaults; operator may override)

| # | Decision | Recommended | Rationale |
|---|----------|-------------|-----------|
| D1 | Pin strategy | commit SHA + `version: "2.102.0"` | Floating tag + floating CLI = silent drift; SHA + exact version = deterministic supply chain |
| D2 | Per-analyzer Code Scanning categories | Drop (Migration A) | User's predict framed "reduce technical debt" as the goal; Python heredoc IS the technical debt |
| D3 | Baseline path style | Keep at `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.json` | Preserves audit trail; `..` traversal is allowed by Action |
| D4 | `sarif: true` on Action vs explicit upload | Use Action's built-in | One-liner; Action handles Code Scanning availability probe |

## LoC projection

| File | Before | After | Delta |
|------|--------|-------|-------|
| `.github/workflows/test.yml` (fallow block) | 176 | ~30 | -146 |
| `tools/learning-loop-mastra/__tests__/workflow-shape.test.js` | 0 | ~80 | +80 |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` | ~70 | ~110 | +40 |
| Total production code | 176 | 30 | **-146 (-83%)** |
| Total test code | 70 | 190 | +120 |

Net test count: 1369 → 1389 (+20 cases).

## Red team findings incorporated into plan

1. **Step id ambiguity** (`steps.fallow.outputs.sarif` vs `steps.analyze.outputs.sarif`) — Phase 4 test now accepts either form; Phase 5 adds artifact-content check
2. **Per-analyzer Code Scanning dashboard queries break** — one-time comms in ship journal
3. **Simpler alternative not documented** — Phase 4 contract includes escape hatch: delete heredoc + keep `pnpm exec fallow audit` (alternative path)
4. **Loop-design entry must flip to inactive in closing commit** — Phase 5 step 6 explicit
5. **Cache key invalidation on fallow bumps** — documented as accepted limitation

## Cross-plan dependencies

- **Upstream:** `260629-1605-pr-21-fallow-audit-real-fix` (currently pending) — must ship first to unblock this plan's branch state
- **Resolves** the audit-gate divergence class called out in plans `260629-1538` and `260629-1605` as "Downstream (deferred, separate plan)"

## Risks not in plan (surfaced for operator awareness)

- **Upstream fallow-rs/fallow v2.103.0 baseline format compat** — researcher #2 noted the typed-output refactor MIGHT have touched `save-baseline` schemas; pinned `version: "2.102.0"` mitigates for now
- **Action's `audit.gate` config-driven default** — `.fallowrc.json`'s `audit.gate` is NOT honored unless explicitly set on Action input; plan sets `gate: new-only` explicitly on every invocation

## Open questions for Phase 2

1. Resolve `<commit-sha>` for `fallow-rs/fallow@v2` via `git ls-remote https://github.com/fallow-rs/fallow refs/tags/v2`
2. Operator confirmation on D1-D4 (defaults recommended; surface overrides via AskUserQuestion at Phase 2 boundary)
3. Decision on whether to enable `comment: true` (PR-body summary) — recommended NO initially

## Status: DONE_WITH_CONCERNS

Summary: 5-phase deep+TDD plan written, loop-design entry filed, 2 researcher reports cited, red team review surfaced 3 high-impact gaps now in plan acceptance criteria, 5 tasks hydrated with dependency chain, whole-plan consistency sweep reports 0 unresolved contradictions.
Concerns: 3 red team findings addressed via plan edits (no plan rework needed); operator must confirm D1-D4 at Phase 2 boundary and resolve commit-SHA.
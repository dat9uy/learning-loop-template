---
title: "Migrate fallow audit gate from hand-rolled pnpm exec to fallow-rs/fallow@v2 Action"
description: "Replace the 176 LoC of hand-rolled fallow audit + Python SARIF-split heredoc in `.github/workflows/test.yml:62-237` with the official composite Action pinned to commit SHA + CLI version 2.102.0. Preserve the topology invariants encoded in `core/placement.yaml`, `placement-manifest.test.js`, and `.fallowrc.json`. Extend the `rule-tool-integration-same-commit-dep` consult-checklist rule with a 4th item covering third-party Action pinning. Closes the audit-gate divergence class flagged in plan 260629-1538-fallow-ci-env-drift-diagnostic and the deferred swap called out in plan 260629-1605-pr-21-fallow-audit-real-fix."
status: pending
priority: P2
branch: "main"
tags: [ci, fallow, action-swap, audit-gate, consult-checklist]
blockedBy: ["260629-1605-pr-21-fallow-audit-real-fix"]
blocks: []
created: "2026-06-29T13:21:36.003Z"
createdBy: "ck:plan"
source: skill
loop_design: "loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall"
---

# Migrate fallow audit gate from hand-rolled pnpm exec to fallow-rs/fallow@v2 Action

## Overview

This plan closes the audit-gate divergence class that triggered the PR #21 incident. The hand-rolled fallow audit step (175 LoC of inline shell + Python heredoc SARIF-split) is replaced with the official `fallow-rs/fallow@v2` composite Action, pinned to commit SHA + CLI version `2.102.0`. The topology invariants that fallow cannot see (`core/placement.yaml` 7-role taxonomy, `.fallowrc.json` config) are preserved. The `rule-tool-integration-same-commit-dep` consult-checklist rule is extended with a 4th item covering third-party Action pinning (commit SHA + cryptographic verification) so future swaps do not regress.

The loop-design entry `loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall` (severity_hint=medium, affected_system=`gate-logic`) tracks the meta-pattern. When this plan ships, that entry's `shipped_in_plan` field is set to this plan dir.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Research](./phase-01-research.md) | Pending | Both researcher reports exist at `plans/reports/researcher-260629-{2021-current-fallow-ci-audit,2011-fallow-tools-v2-action-deep-dive}-report.md`; operator confirms 4 unresolved decisions from deep-dive §14 |
| 2 | [Design decisions](./phase-02-design.md) | Pending | Operator decisions 1-4 from deep-dive §14 recorded as resolved in `plans/reports/decision-260629-2011-fallow-action-swap-decisions.md`; Phase 4 contract written |
| 3 | [Extend consult-checklist rule](./phase-03-implement-rule-extension.md) | Pending | Test `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` adds 2 cases (4th item present; 3rd-party action SHA pin); both green |
| 4 | [Implement CI swap](./phase-04-implement-ci-swap.md) | Pending | `node -e "yaml.loadFile('.github/workflows/test.yml')"` parses without error; new Action invocation produces `verdict` + `gate` outputs; local `fallow --version` runs in CI sub-step |
| 5 | [Verify gate parity](./phase-05-verify-gate-parity.md) | Pending | Fresh PR run on a controlled branch (no fallow changes) reports `verdict=pass` and `gate=new-only`; meta-state finding (if any) closed via `meta_state_resolve` |

## Dependencies

- **Upstream:** `260629-1605-pr-21-fallow-audit-real-fix` (currently pending; ships the immediate gate fix that unblocks this plan's branch state).
- **Resolves the audit-gate divergence class** called out as "Downstream (deferred, separate plan)" in `260629-1605-pr-21-fallow-audit-real-fix/plan.md` line 38 and `260629-1538-fallow-ci-env-drift-diagnostic/plan.md` line 35.
- **Independent of:** `260628-1337-fallow-tool-integration-rule-encoding` (shipped; provides the rule we extend in Phase 3).
- **Loop-design entry:** `loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall` (active, severity_hint=medium). On ship, set `shipped_in_plan: plans/260629-2011-fallow-tools-v2-action-swap/` and `status: inactive`.
- **Rules touched:** `rule-tool-integration-same-commit-dep` (Phase 3 appends 4th item).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Current (test.yml:62-237)         Migration target (Phase 4)    │
├──────────────────────────────────────────────────────────────────┤
│  pnpm exec fallow audit ...    →   uses: fallow-rs/fallow@<sha>  │
│  python3 heredoc (classify+       ← deleted (Action handles      │
│    split SARIF into 3 files)        SARIF generation)            │
│  3× github/codeql-action/        ← replaced by Action's built-in │
│    upload-sarif@v4 (3 categories)   upload (single category)      │
│  Upload fallow SARIF on failure  ← preserved (Action's outputs. │
│                                     sarif is the same path)      │
└──────────────────────────────────────────────────────────────────┘

PRESERVED (not in swap scope):
  ✓ tools/learning-loop-mastra/core/placement.yaml (7-role topology)
  ✓ tools/learning-loop-mastra/__tests__/phase-e-foundation/placement-manifest.test.js
  ✓ tools/learning-loop-mastra/.fallowrc.json (fallow config)
  ✓ plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/*.json (baselines)
  ✓ Upload per-namespace logs on failure (test.yml:217-224)
```

## Acceptance Criteria

- [ ] `.github/workflows/test.yml` lines 62-237 replaced with one Action invocation (~30 LoC) + the preserved failure-upload step
- [ ] Action invocation pinned to commit SHA, not tag (per Rule 4th item from Phase 3)
- [ ] `version: "2.102.0"` input set (locks CLI to tested version; prevents drift to 2.103.0)
- [ ] `permissions:` block on the workflow includes `security-events: write`
- [ ] `gate: new-only` and `command: audit` set explicitly (config-driven gate is not honored by Action)
- [ ] Three baseline paths (`dead-code-baseline`, `health-baseline`, `dupes-baseline`) preserved verbatim
- [ ] `Upload fallow SARIF on failure` step retained and re-pointed at `${{ steps.fallow.outputs.sarif }}`
- [ ] `rule-tool-integration-same-commit-dep` extended with 4th item + PROCESS_HINTS row + `core/README.md` section + regression tests
- [ ] All 1369 existing tests pass; new tests added (2 in consult-checklist; 0 in placement manifest since unchanged)
- [ ] PR run on a no-change branch reports `verdict=pass`; SARIF uploaded to Code Scanning under `category: fallow`
- [ ] Loop-design entry `loop-design-migrate-fallow-audit-gate-from-hand-rolled-pnpm-exec-to-fall` flipped to `status: inactive` with `shipped_in_plan` set
- [ ] Change-log entry recorded via `meta_state_log_change` capturing the audit-gate-divergence-class closure

## Risks

- **Per-analyzer Code Scanning categories collapse to single `fallow` category.** Mitigated by documenting the navigation path (PR review finds `command` field; finding description names the analyzer).
- **`fallow` 2.103.0 typed-output refactor may have touched baseline format.** Mitigated by pinning `version: "2.102.0"`; if 2.103.0 becomes required for security, regenerate baselines in a follow-up plan.
- **`audit.gate` from `.fallowrc.json` is NOT honored by Action unless explicitly set on input.** Mitigated by explicit `gate: new-only` on the Action invocation.
- **`review-comments: true` requires `pull-requests: write` (fails silently on fork PRs).** Mitigated by leaving `review-comments: false` (default) and relying on annotations (`::error file=...,line=...::message`) for inline UX.
- **Cache key `${{ hashFiles(format('{0}/**/package.json', inputs.root)) }}` invalidates on package.json edit.** Mitigated by monitoring first 3 PR runs for cache hit rate; override with explicit `cache-key-prefix` if needed.

## Open Questions

1. Does the upstream `fallow-rs/fallow` Action v2 track `latest` (2.103.0) regardless of project `fallow` spec? Researcher #2's deep-dive says yes when `version:` input is unset; we set `version: "2.102.0"` to lock.
2. Should we also relocate baselines from `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/` to `tools/learning-loop-mastra/.fallow-baselines/` for cleaner Action ergonomics? Recommended: NO (preserves audit trail in plan dir).
3. Should we keep `comments: true` on the Action (PR-body summary) since we don't currently post comments? Recommended: NO initially; add in follow-up if operators request it.
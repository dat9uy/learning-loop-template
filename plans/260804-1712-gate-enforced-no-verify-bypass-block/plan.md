---
title: "Gate-Enforced No-Verify Bypass Block"
description: "Promote a gate-enforced regex rule blocking `git commit --no-verify` / `core.hooksPath` hook bypasses in the universal bash-gate, plus an agent-checklist steering rule for pre-existing-flake claims. Resolves findings meta-260804T1600Z (escalate) and meta-260803T1836Z."
status: pending
priority: P1
effort: "0.5d"
tags: [gate-logic, loop-anti-pattern, verification-bypass, registry-data-only]
created: 2026-08-04
---

# Gate-Enforced No-Verify Bypass Block

## Overview

An agent runtime shipped a change with `git commit --no-verify`, masking a regression it had itself caused as a "documented pre-existing flake" (finding `meta-260804T1600Z`, severity escalate). This was the predicted recurrence of open finding `meta-260803T1836Z`, which proposed a bypass-detection gate rule pending operator decision. The operator has decided: **Block + steer** (change-log `meta-260804T1703Z-gate-logic-no-verify-hookspath-bypass-enforcement`).

Research confirmed the delivery rides the existing promoted-rule path: the universal bash-gate evaluates promoted regex rules live from `meta-state.jsonl` (`applyPromotedRules`, `core/gate-logic.js:947`) and denies via `permissionDecision: "deny"`; `gate_override` provides a TTL'd operator escape on all three surfaces. **No gate-logic core changes are required.** Code changes that ARE required (red-team verified): one new regression test, conscious updates to two locked live-registry tests (`hint-registry.test.cjs` slug set, `hint-renderer.test.cjs` partition lock) when the Phase 2 rule lands, and a docs-level advice-string edit in `commit-msg-stable-artifacts.js` (it currently tells agents to use the flag Phase 1 denies).

## Contract (from accepted brainstorm)

- **Outcome:** `git commit --no-verify` and `core.hooksPath=/dev/null` denied at the bash-gate for agent runtimes; agent-checklist steering requires parent-commit reproduction + failing-test-set comparison before any flake claim.
- **Constraints:** shim-not-fork (no per-runtime edits); rules via `meta_state_promote_rule`; legit snapshot-refresh flow (`pnpm test:one -u` + clean commit) unaffected; no plan IDs in stable artifacts; regex must pass `isSafeRegexPattern` (no nested quantifiers); no gate-logic core edits (the `applyPromotedRules`/`gate_override` mechanics stay as-is — a docs-level advice string in `commit-msg-stable-artifacts.js` is permitted).
- **Non-goals:** recurrence-tracker changes; git-push auth (#114 shipped); retroactive session audit; hardcoded (non-overridable) blocks.
- **Acceptance:** hook-level test proves deny + override release + clean-commit pass; rules visible in `loop_describe` warm hints; both findings resolved citing shipped rule ids; `pnpm test:unit` green without bypass.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Gate-enforced regex rule denies `--no-verify` / `core.hooksPath` bypass in all runtimes | P1 |
| 2 | Agent-checklist steering rule for flake-claim discipline | P1 |
| 3 | Both findings resolved with source_refs; docs surface updated; suite green | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Gate-Enforced Bypass Rule](./phase-01-gate-enforced-bypass-rule.md) | Pending |
| 2 | [Phase 2: Flake-Claim Steering Checklist](./phase-02-flake-claim-steering-checklist.md) | Pending |
| 3 | [Phase 3: Resolution Docs and Ship](./phase-03-resolution-docs-and-ship.md) | Pending |

## Key Evidence (research, 260804-17)

- Promoted-rule flow: `meta_state_promote_rule` → `writeEntry` rule entry (`tools/learning-loop-mastra/tools/handlers/meta-state-promote-rule-tool.js:351`) → `loadPromotedRules` reads live from `meta-state.jsonl` with mtime/size cache (`core/gate-logic.js:739`) → `applyPromotedRules` returns `decision:"escalate"` (`core/gate-logic.js:1036`) → `formatHookDecision` emits `permissionDecision:"deny"` (`hooks/universal/lib/protocol-adapter.js:111`). Hook invocations are fresh processes — a promoted rule is live on the next Bash call.
- Override: `gate_override` writes `.gate-override` to all surfaces, TTL re-evaluated per invocation (`core/gate-override.js:11`); applies only to promoted rules; audited in `runtime-state.jsonl`.
- Message bodies are stripped before matching (`stripMessageFlags`, `core/gate-logic.js:991`) — a `--no-verify` inside a commit message cannot false-positive.
- Test pattern: seed rule JSON into `{tmpRoot}/meta-state.jsonl`, spawn hook with stdin JSON, assert envelope (`__tests__/legacy-mcp/bash-gate-decision-visibility.test.js:64-91,129-189`).
- Live invariant: every active agent-checklist rule must have `hint_text` + `hint_suggestion` and appear in `buildProcessView` (`__tests__/rule-derived-process-hints.test.cjs:159-197`).
- Promotion guards: category must be `loop-anti-pattern` (both findings qualify); regex must pass `isSafeRegexPattern` (`core/gate-logic.js:629`); preview mode tests `sample_commands` without activating.

## Success Criteria

- [ ] Hook test: `git commit --no-verify`, `git commit -n`, `git -c core.hooksPath=/dev/null commit ...` (incl. mixed-case `Core.HooksPath`) → deny with rule_id; `git commit -m "msg"`, `git config --get/--unset core.hooksPath`, `git log --grep=...`, `pnpm test:one -u` → pass silently
- [ ] Both rules promoted in live registry; `loop_describe({tier:"warm"})` shows the checklist hint; gate rule visible as active
- [ ] Locked live-registry tests (`hint-registry.test.cjs`, `hint-renderer.test.cjs`) consciously updated and green after Phase 2 promotion
- [ ] `gate_override` for the gate rule releases a blocked command, verified live via the real tool (write path), plus seeded expired-marker deny case in the hook test
- [ ] Rollback path documented and rehearsed: `meta_state_batch` delete-tombstone deactivates the rule (patch/archive cannot)
- [ ] `meta-260804T1600Z` and `meta-260803T1836Z` resolved with source_refs citing rule ids + change-log `meta-260804T1703Z`
- [ ] `pnpm test:unit` green; commit-msg hook advice no longer instructs the denied flag
- [ ] `check_runtime_agnostic` run (expect N/A-clean: no gate-mechanics code touched)

## Risk Assessment

- **Regex false positives**: mitigated by scoping to git mutation verbs + destructive hooksPath values, preview mode with `sample_commands` before activation, and the `gate_override` escape hatch.
- **Self-footgun**: the loop's own git tooling must not rely on bypass flags — Phase 1 greps before activation; the commit-msg hook advice string is updated in the same ship.
- **Named residuals (accepted, documented):** (a) env/alias indirection beyond the covered `GIT_CONFIG_KEY_n` form — `$VARS`, git aliases, wrapper scripts evade any literal regex; the checklist rule + recurrence tracking are the countermeasure, not the gate. (b) Crash fail-open: `bash-gate.js` has no try/catch (`bash-gate.js:23-39`) and `applyPromotedRules` skips errored rules with `console.warn` (`gate-logic.js:1029-1032`) — a crashed hook or rejected regex silently allows; mitigated by live decision-log verification in Phase 1. (c) The deny reason echoes the full pattern (`gate-logic.js:1037`) — accepted per the no-core-edits constraint. (d) Combined short flags (`git commit -an`) are not matched — only whitespace-delimited `-n`. (e) Promotion is a non-transactional 3-write sequence with an unlocked citation append (`registry-append-atomic.js:48-50`) — pre-existing core defect; compensated by post-promotion verification, filed separately during cook.
- **Warn-pressure repeat**: the checklist rule alone would not have stopped the incident; it is additive steering, not the enforcement layer. The gate rule is the floor.

## Red Team Review

### Session — 2026-08-04
**Findings:** 17 unique (after dedup: 3 Critical, 8 High, 6 Medium)
**Dispositions:** 15 accepted (2 modified), 2 rejected

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Locked live-registry tests break on Phase 2 promotion; pre-commit self-block | Critical | Accept | Phase 2, plan.md |
| 2 | No rollback path (patch omits status; archive rejects rules; batch-delete tombstone only) | Critical | Accept | Phase 1, plan.md |
| 3 | Case-insensitive `Core.HooksPath` evasion | Critical | Accept | Phase 1 pattern |
| 4 | `git commit -n` contradiction (plan.md vs Phase 1 vs Phase 2 claim) | High | Accept | Phase 1 pattern + all files |
| 5 | GIT_CONFIG_* env-config injection | High | Accept (modified: cover `GIT_CONFIG_KEY_n=` branch; residual for other indirection) | Phase 1 pattern, plan.md risks |
| 6 | Fail-open on hook crash / regex errors | High | Accept (modified: document residual + decision-log live verify) | plan.md risks, Phase 1 |
| 7 | Promotion non-transactional (unlocked citation append) | High | Accept (verification step; root fix filed separately) | Phase 1, Phase 3 |
| 8 | Heredoc/`-F` ship commit self-deny | High | Accept | Phase 1 test matrix, Phase 3 ship step |
| 9 | commit-msg hook advises the denied flag | High | Accept | Phase 1 step, constraint amended |
| 10 | Unscoped `core.hooksPath` denies read-only/remediation/enable configs | Medium | Accept (narrow to destructive values) | Phase 1 pattern + matrix |
| 11 | Override test seeding underspecified (paths, expired case, real-tool verify) | Medium | Accept | Phase 1 steps 1 + 6 |
| 12 | Seed schema contract unstated | Medium | Accept | Phase 1 step 1 |
| 13 | `git log --grep=` / echo-prose false positives | Medium | Accept (verb scoping in #10 pattern) | Phase 1 matrix |
| 14 | Override TTL semantics (mid-sequence expiry, cross-rule TTL clobber) | Medium | Accept | Phase 1 test + plan docs |
| 15 | `protocol-adapter.js:97` citation wrong (→ :111) | Medium | Accept | plan.md |
| 16 | Deny reason leaks full regex pattern | Medium | Reject (no-core-edits constraint stands; documented residual) | plan.md risks |
| 17 | Root-fix promotion locking defect | High | Reject for this plan (pre-existing core defect; file `meta_state_report` during cook) | Phase 3 |

### Whole-Plan Consistency Sweep
Post-application sweep: `-n` coverage now consistent across plan.md criteria, Phase 1 pattern, Phase 2 checklist text. "Registry-data-only" claims corrected to enumerate the three code-touch points (new test, two locked-test updates, hook advice string). Constraint amended once (hook advice string) and referenced consistently. Rollback path named in plan.md Success Criteria and Phase 1. No residual contradictions.

## Validation Log

### Session 1 — 2026-08-04 (mode=prompt)
Verification pass: skipped per guard (Red Team Review section carries the verification evidence; all three reviewers fact-checked plan citations against the codebase — one citation corrected, `protocol-adapter.js:97`→`:111`).

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | `-n` combined-short-flag (`-an`) coverage | Accept residual | No regex safely splits combined short flags; checklist names it; recurrence tracking watches |
| 2 | hooksPath branch breadth | Destructive values only (`/dev/null`, `NUL`, case-tolerant) | Hook-enabling/read-only configs must pass; empty-string assignment accepted as residual |
| 3 | commit-msg hook advice string | Update in this ship | Removes two-gates-contradicting trap; docs-level string, no gate mechanics |
| 4 | Rule deactivation | Batch-delete tombstone documented; dedicated tool filed as gap via `meta_state_report` in Phase 3 | Keeps plan registry-focused; lifecycle-tool gap enters the loop pipeline |

### Whole-Plan Consistency Sweep (post-validation)
All four decisions match the red-team-updated phase files (Phase 1 pattern branches 2-4, hook advice step 4, rollback section, Phase 3 step 8). Zero unresolved contradictions. Plan is eligible for implementation.

<!-- slug: gate-enforced-no-verify-bypass-block -->

---
title: "Heredoc blanker + recurrence-key normalization"
description: "Close the heredoc blanker gap in the bash gate and normalize recurrence keys so one root-cause class files one finding, not N"
status: complete
priority: P1
effort: "1d"
tags: [gate-logic, recurrence-tracker, blanker, false-positive-storm]
created: 2026-08-09
completed: 2026-08-09
---

# Heredoc blanker + recurrence-key normalization

## Overview

The disposition report `plans/reports/disposition-260809-1536-rule-no-raw-stdout-vitest-false-fire-retraction.md` proved two things: (1) the `rule-no-raw-stdout-vitest` false-fires live in the **data-blanking layer**, not the gate logic — heredoc bodies are the only un-blanked data class; (2) regex-side fixes are **unsound** (they regress the `bash -c`/`sh -c`/`python -c` executed-body asymmetry). It deferred the durable fix (`stripHeredocBodies`) on frequency grounds.

The deferral condition is now met: each distinct correct-but-blocked command produces a distinct `recurrence_key` (`sha256(rule_id :: 50-char normalized prefix)`), so one blanker gap class auto-files **N mislabeled `gate-logic-bug` findings** — the storm the operator flagged at brainstorm. This plan closes the gap at the source (Phase 1) and normalizes recurrence keys so residual classes collapse to one finding per root-cause class (Phase 2), then disposes the open finding (Phase 3).

## Accepted brainstorm contract (scope C)

- **Outcome:** quoted-delimiter heredoc bodies (`<<'EOF'` / `<<"EOF"`, incl. `<<-` tab-stripping) attached to inert verbs are blanked as data across both gate passes; unquoted `<<EOF` and executor-verb heredocs stay visible (their bodies genuinely execute — no bypass). Same-rule multi-shape recurrence bursts collapse to one finding per root-cause class.
- **Constraints:** executed-body asymmetry preserved (`bash -c`/`sh -c`/`python -c` quoted bodies AND `bash`/`sh`/`python` heredoc bodies stay visible); rule regex untouched; locked tests at `__tests__/legacy-mcp/gate-logic-quoted-strings.test.js` keep passing unchanged.
- **Non-goals:** finding re-categorization (enum has no accepted-limitation value); rule-pattern changes; the `node -e` escaped-quote **gate** regex gap (stays accepted with its catch-net — but the tracker-side key collapses it, see Phase 2). (The gate-verb / `classifyPolicyTokens` heredoc handling was originally a non-goal; red-team Finding 7 refuted the "no observed false-fires" premise — it is now in-scope, wired in Phase 1.)
- **Acceptance:** the report's 8-shape command matrix re-run — shapes 1–2 escalate (real violations), shapes 3–4 become `ok` (quoted-delimiter heredoc + node stdin-script blanked), shape 5 (unquoted `<<EOF`) escalates as a **visible residual** (its body executes), shapes 6–8 stay `ok`; new tests lock the quoted-vs-unquoted heredoc bypass boundary incl. `$(...)` visibility and the herestring exclusion; tracker tests lock the one-finding-per-class collapse (quoted AND unquoted heredoc, `node -e` escaped-quote, varying redirect paths).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `stripHeredocBodies` blanker closes the heredoc false-fire class without regressing executed-body detection | P1 |
| 2 | Recurrence keys normalize through a **coarser-than-the-gate** tracker-side key so one root-cause class files one finding (incl. unquoted-heredoc + `node -e` escaped-quote residual classes) | P1 |
| 3 | Open finding `meta-260809T1433Z-…` resolved with the corrected characterization and shipped-fix reference | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: stripHeredocBodies blanker](./phase-01-strip-heredoc-bodies.md) | Complete |
| 2 | [Phase 2: Recurrence-key normalization](./phase-02-recurrence-key-normalization.md) | Complete |
| 3 | [Phase 3: Registry disposition + verification](./phase-03-registry-disposition-verification.md) | Complete |

## Cross-plan adjacency

`plans/260804-1712-gate-enforced-no-verify-bypass-block` (pending) touches gate rules via registry data and one regression test — different files, no `blockedBy` relationship. If both cook concurrently, sequence test-file edits to avoid lock-file conflicts in `meta-state.jsonl`.

## Success Criteria

- [x] `applyPromotedRules` on the report's 8-shape matrix: shapes 1–2 escalate (real violations), shapes 3–4 become `ok`, shape 5 (unquoted `<<EOF`) escalates as a visible residual, shapes 6–8 stay `ok`
- [x] `bash <<'EOF'` / `sh <<'EOF'` / `python3 <<'EOF'` bodies containing `vitest run … | tail` still escalate (executed-body asymmetry locked by new tests)
- [x] Unquoted `<<EOF` bodies stay visible at the GATE (conservative residual); collapse to one finding only at the TRACKER key
- [x] Herestring `<<<` never blanked (exclusion locked)
- [x] Two different heredoc bodies (quoted AND unquoted) under the same rule crossing the N≥3 threshold file exactly one `recurring-false-positive` finding
- [x] Over-collapse guard: a distinct trailing real command does NOT collapse into the false-positive class
- [x] Gate-verb layer no longer blocks on heredoc body text (matrix row 19)
- [x] Blanker fail-closed + `GATE_HEREDOC_BLANKER=0` kill-switch verified (matrix rows 24–25)
- [x] Enumerated `gate-recurrence.test.js` legacy-key sites re-baselined and passing
- [x] First-post-ship re-file burst suppressed by the dedup fallback (or triaged per Phase 3 step 3)
- [x] Finding `meta-260809T1433Z-promoted-rule-rule-no-raw-stdout-vitest-v2-pattern-vitest-ru` status `resolved`, `resolved_by: operator`, resolution text cites this plan

<!-- slug: heredoc-blanker-recurrence-key-normalization -->

## Red Team Review

### Session — 2026-08-09
**Reviewers:** Security Adversary, Assumption Destroyer, Failure Mode Analyst (3, Standard tier)
**Findings:** 22 raw → 15 after dedup (15 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 9 High, 5 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Phase 2's `blankDataPayloads` only re-blanks what the gate already blanks → cannot collapse the unquoted-heredoc + `node -e` escaped-quote residual classes it names as its purpose | Critical | Accept | Phase 2 (redesign: coarser `normalizePrefixForKey`) |
| 2 | Real logged shapes don't collapse — redirect paths + delimiter names survive into the 50-char key | High | Accept | Phase 2 (blank redirect target + delimiter word) |
| 3 | Key collapse suppresses REAL recurring violations sharing the collapsed prefix (post-heredoc `; vitest run \| tail` erased) | High | Accept | Phase 2 (over-collapse guard: salt key with post-terminator residue) |
| 4 | `toolchain-failure` entries get no collapse — capture hook pre-strips quotes (`toolchain-failure-capture.js:114`) | High | Accept | Phase 2 (coarser key blanks unquoted too; `normalizePrefix` capture redaction unchanged) |
| 5 | Node-family in the allowlist widens the accepted bypass into `matchConstraintPattern` first-class boundaries (docker/sudo/package-manager) | High | Accept | Phase 1 (split allowlist per wiring site; node excluded from constraints) |
| 6 | Herestring `<<<` unhandled — `<<-?` scan misparses `<<<'…'` → blank-to-end → node executes hidden | High | Accept | Phase 1 (herestring exclusion + matrix rows 17–18) |
| 7 | Gate-verb layer left unwired on a false "no observed false-fires" premise; `classifyPolicyTokens` splits inside heredoc bodies; gate-verb `rule_id:null` → tracker blind | High | Accept | Phase 1 (wire `matchGateVerb`; matrix row 19) |
| 8 | No fail-closed story — blanker throw crashes the hook (wiring outside every try/catch) | High | Accept | Phase 1 (fail-closed try/catch; matrix row 24) |
| 9 | No kill-switch + over-blanking erases telemetry (`bash-gate.js:43` skips logging on `ok`) → catch-net blind to the dangerous direction | High | Accept | Phase 1 (`GATE_HEREDOC_BLANKER=0` kill-switch; matrix row 25; telemetry gap documented) |
| 10 | Locked recurrence tests hardcode legacy-key hashes (`gate-recurrence.test.js:98,297,332,362,387,412,437`) — "pass unchanged" false | High | Accept | Phase 2 (enumerated re-baseline) |
| 11 | 80-char truncation breaks `node -e`/heredoc-operator collapse (no closing quote → regex no-ops) | Medium | Accept | Phase 2 (truncation-tolerant blank-to-end; >80-char test) |
| 12 | Multi-heredoc + quote-in-body recognition underspecified; walker has no heredoc awareness (body `don't` opens a quote region) | Medium | Accept | Phase 1 (opaque-span quote reset; matrix rows 22–23) |
| 13 | `plan.md:48` success criterion ("shapes 3–5 become ok") contradicts Phase 1 row 5 (unquoted → escalate) and `plan.md:50` | Medium | Accept | plan.md (corrected to "3–4 ok; 5 escalates") |
| 14 | First post-ship SessionStart re-files every historically suppressed class registry-wide — contradicts prior resolution promises | Medium | Accept | Phase 2 (dedup fallback) + Phase 3 (re-file triage step) |
| 15 | Performance: `normalizePrefix` 2×/entry + new blanker passes; tripwire not re-baselined | Medium | Accept | Phase 2 (memoize per entry; state cost budget) |

**Contract-verifier note (not a finding):** `meta-state-promote-rule-tool.js:178` rule-preview bypasses the blanker chain (`new RegExp(pattern).test(cmd)` raw) → preview will disagree with the gate on heredoc shapes post-Phase-1; documented as a known preview/gate divergence in Phase 1. `evaluate-write-gate.js:418` calls `applyPromotedRules` with `command=null` (regex branch null-guards; Phase 1 wiring text now notes the null-guard).

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-strip-heredoc-bodies.md, phase-02-recurrence-key-normalization.md, phase-03-registry-disposition-verification.md
- Decision deltas checked: 8 (coarser tracker key; split per-wiring-site allowlists; herestring exclusion; gate-verb wiring; fail-closed + kill-switch; opaque-span recognition; over-collapse guard + dedup fallback; test re-baseline)
- Reconciled stale references: 4
  - plan.md non-goals: removed the "gate-verb no observed false-fires" non-goal (refuted by Finding 7); narrowed the `node -e` non-goal to the GATE regex gap (tracker now collapses it)
  - plan.md success criteria: "shapes 3–5 ok" → "3–4 ok; 5 escalates" (Finding 13); added herestring/kill-switch/over-collapse/re-baseline criteria
  - plan.md Goals row 2: "through the blanker chain" → "coarser-than-the-gate tracker-side key"
  - Phase 3 verification: 8-shape expected verdicts now explicit (shape 5 escalates)
- Unresolved contradictions: 0

## Validation Log

### Session — 2026-08-09 (validate)
- **Verification:** Skipped (Red Team Review section present with Standard-tier Fact Checker + Contract Verifier evidence; no `[UNVERIFIED]` tags remain). Red-team fact-check: 17/19 sampled claims verified; 2 minor citation nits (stripNodeEvalBody doc range, applyPromotedRules range) corrected in Phase 1.
- **Questions asked:** 4 (all decision points)
- **Decisions confirmed (all match plan as revised — no phase propagation required):**

| # | Decision | Choice | Plan status |
|---|----------|--------|-------------|
| 1 | Kill-switch default | Default ON (`GATE_HEREDOC_BLANKER=0` is the OFF lever) | Phase 1 already encodes |
| 2 | node-family promoted-rule bypass | Mirrors `node -e` (blanked in `applyPromotedRules`, excluded from `matchConstraintPattern`) | Phase 1 already encodes |
| 3 | Re-file burst handling | Broaden dedup (suppress same-rule + description-prefix match) | Phase 2 already encodes |
| 4 | Ship order | Phase 1+2 atomic (one storm-killing PR; Phase 3 disposition follows) | Plan already has Phase 2 blockedBy Phase 1 |

### Whole-Plan Consistency Sweep (post-validation)
- Files reread: plan.md + 3 phase files
- Decision deltas checked: 4 (all confirmed existing decisions; no new deltas)
- Reconciled stale references: 0
- Unresolved contradictions: 0
- **Verdict:** Failed: 0 — plan is eligible for implementation.

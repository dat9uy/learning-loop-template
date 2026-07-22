---
title: "Rec 12 L1 change-log trigger statement + Q11 symmetry (docs-only)"
description: "Plan 3 of the 4-plan lifecycle + Rec 12 split (tracker: plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md). Ships component (a) of the broadened Rec 12: the L1 change-log trigger statement + Q11 operator/agent symmetry in docs/loop-engine.md (docs-only, no code/tests/schema). Promotes the existing skills-specific recursion-bound statement into the general change-log trigger (skills become the named instance), adds the symmetry statement (no operator exemption; authority vs trigger are orthogonal), and repoints the gap-detector honest-framing at Plan 4 (detection). The loop-engine.md edit is itself a bound-artifact edit and is recorded via meta_state_log_change. Enforcement (consult-gate/skill + detection mechanism) is NOT in this plan — lands in Plan 4 (rec12-closed-loop: (b) gap detection + (c) session-start gap injection)."
status: completed
priority: P2
branch: "rec12-l1-trigger-statement-and-symmetry"
tags: [rec12, change-log, trigger, symmetry, q11, loop-engine, l1-concept, docs-only]
blockedBy: [260708-0833-lifecycle-authority-dissolution-session-mode]
blocks: [rec12-closed-loop]
created: "2026-07-08T04:37:42.256Z"
createdBy: "ck:plan"
source: skill
---

# Plan 3: Rec 12 L1 change-log trigger statement + Q11 symmetry (docs-only)

**Date:** 2026-07-08
**Branch (to create):** `rec12-l1-trigger-statement-and-symmetry` (off current `main` @ `7a47fbe`, post-PR-#39)
**Design source:** `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` — section "Change-log trigger (Rec 12) + symmetry (Q11) — scope broadened 2026-07-07", component (a). This plan ships (a) only.
**Tracker:** `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` (4-plan split; this is Plan 3).
**Depends on:** Plan 2 (`260708-0833-lifecycle-authority-dissolution-session-mode`) — shipped via PR #39 (squash commit `7a47fbe`). The Q11 symmetry statement comments on Plan 2's authority result: `meta_state_log_change` is **trigger-gated**, not authority-gated (it is in Plan 2's "open tools" set — runs in both `live` and `autonomous`).

## Overview

Add the Rec 12 change-log **trigger rule** and the Q11 **symmetry statement** to the L1 concept surface (`docs/loop-engine.md`). These are the two prerequisites the 0958 redesign identified as blocking a clean trigger rule: *what counts as a change-log* (the trigger) and *whether the operator is exempt from recording one* (symmetry — no). This plan ships the L1 *statement* only; it makes the trigger **queryable** (Rec 12's goal) even before any mechanism enforces it. The enforcement mechanism (detection of bound edits that landed without a change-log, plus session-start gap injection) is Plan 4 — explicitly out of scope here.

The doc edit is itself a bound-artifact edit (a concept-surface doc), so per the trigger rule this plan ships, the edit must be recorded via `meta_state_log_change` — the recursion-bound invariant in action.

## Scope (docs-only; no code, no tests, no schema)

**One file edited:** `docs/loop-engine.md`.

The existing `## The recursion-bound statement (skills)` section (lines 87–91) is the skills-specific instance of the change-log trigger and its "Honest framing" already defers the gap detector to "the broadened Rec 12 plan" (= Plan 3 + Plan 4). This plan **promotes** that section into the general trigger rather than adding a second, overlapping section (DRY — the general rule subsumes the skills-specific one):

1. **Rename** the section: `## The recursion-bound statement (skills)` → `## The change-log trigger (Rec 12)`.
2. **State the general trigger rule** (L1, from 0958 final design): *an action becomes a change-log when it changes a bound artifact (concept- or implementation-surface doc, runtime contract, registry schema, tool manifest, tracker lifecycle, or `tools/**` / `core/**` source) or a rule/policy. Not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.*
3. **Retain the recursion-bound termination argument**, generalized: change-logs are records, records are not bound artifacts → the recursion is bounded. Skills remain the named concrete instance (the phase-5 skills write-gate reference stays, now as the first instantiation of the general rule).
4. **Add the Q11 symmetry statement**: no operator exemption (escape-hatch #13). Operator edits and agent edits are recorded symmetrically. Authority governs *which actions may run*; the trigger governs *which are recorded* — orthogonal. (`meta_state_log_change` is trigger-gated, not authority-gated — consistent with Plan 2's open-tools set.)
5. **Repoint the Honest framing** gap-detector pointer from "the broadened Rec 12 plan" → Plan 4 (the detection mechanism: (b) gap detection + (c) session-start gap injection). The L1 statement ships here; the detector ships in Plan 4.

**Second edit in the same file (validation decision):** add a one-line cross-reference from the `record` role bullet in "Concept vocabulary" (line 40) to the new trigger section — e.g. append "See § The change-log trigger (Rec 12) for when an action becomes a change-log." The 0958 report frames the trigger as part of the "record role"; a reader who looks up "record" lands on the bullet and would otherwise miss the trigger. The 4-kind union (line 67) needs no edit.

**No other file changes.** No `core/`, `tools/`, schema, or test edits.

**Out of scope (explicitly Plan 4):** (b) change-log gap detection (join of bound-artifact paths touched ∖ `meta_state_log_change` entries in-session), (c) session-start gap injection via `core/loop-introspect.js` + `session-start-inject-discoverability.cjs`, the consult-gate/skill enforcement, and the SessionEnd/pre-commit hook (skill-layer prerequisite UQ5's promotion of the recurring gap finding).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Implement](./phase-01-implement.md) | Pending |
| 2 | [Verify](./phase-02-verify.md) | Pending |

## Dependencies

- **blockedBy:** `260708-0833-lifecycle-authority-dissolution-session-mode` (Plan 2 — shipped PR #39 @ `7a47fbe`). The symmetry statement comments on Plan 2's authority result; `meta_state_log_change` is in Plan 2's open-tools set (trigger-gated, not authority-gated).
- **blocks:** `rec12-closed-loop` (Plan 4 — needs the (a) trigger definition this plan ships to know what a change-log *should be* before it can detect missing ones).
- **No file overlap** with Plan 1 or Plan 2's shipped changes (both touched `core/` + tool files; this plan touches only `docs/loop-engine.md`). The `260706-1340` philosophy-rewrite plan (its `loop-engine.md` edit targeted escape-hatch #1, a *different section*) is **complete/shipped** — so its one-line note already landed and Plan 3 stands alone on `docs/loop-engine.md`. No shared-touch coordination needed.

## Acceptance criteria

1. `docs/loop-engine.md` has a section titled `## The change-log trigger (Rec 12)` (the renamed recursion-bound section); the old `## The recursion-bound statement (skills)` heading is gone.
2. The general trigger rule is stated verbatim-in-substance: an action becomes a change-log when it changes a bound artifact (concept/impl doc, runtime contract, registry schema, tool manifest, tracker lifecycle, `tools/**`/`core/**` source) or a rule/policy; explicitly excludes in-session scratch, plan drafts, and reversible edits inside a not-yet-shipped plan.
3. The recursion-bound termination argument is present and generalized (records are not bound artifacts → recursion bounded); skills remain as the named instance with the phase-5 write-gate reference intact.
4. The Q11 symmetry statement is present: no operator exemption (escape-hatch #13); operator and agent edits recorded symmetrically; authority governs which actions may run, the trigger governs which are recorded — orthogonal.
5. The Honest-framing gap-detector pointer names Plan 4 (detection), not "the broadened Rec 12 plan".
6. A `meta_state_log_change` entry is recorded for the `loop-engine.md` edit (the trigger rule applied to itself), with `change_target: docs/loop-engine.md`, `change_dimension: semantic`, and a `reason` of ≥20 chars. (Per the recursion-bound invariant, the change-log is a record write, not another bound-artifact edit.)
7. No code, test, or schema file is modified; `pnpm test` is unaffected (docs-only — no test asserts on this prose; confirm via `git diff --stat` showing only `docs/loop-engine.md`).
8. The `record` role bullet in "Concept vocabulary" (line 40) carries a one-line cross-reference to the new `## The change-log trigger (Rec 12)` section.

## Alternatives considered

- **Add a new section + leave the skills recursion-bound section untouched (rejected):** leaves two sections stating overlapping rules (the general trigger subsumes the skills-specific one) — DRY violation. The existing section already points its gap-detector deferral at "the broadened Rec 12 plan", so promoting it is the structurally coherent move.
- **Put the trigger rule in the `record` role bullet (rejected):** the `record` role names the 4 kinds; the trigger is specifically about *when an action becomes a change-log*, which is the recursion-bound section's concern. The role bullet stays a one-line kind-naming line.
- **Ship enforcement (detection) in this plan (rejected):** the 0958 final design explicitly trims this plan to "L1 statement + symmetry only" to de-risk; (b)+(c) move to Plan 4 whose centerpiece is the change-log recurrence query (`loop-engine.md` open Q1).

## Open questions — RESOLVED (Validation Session 1, 2026-07-08)

All three resolved via the validation interview; see `## Validation Log` below. Summary:
1. **Section heading** = `## The change-log trigger (Rec 12)` (names concept + recommendation; recursion-bound stays as an inner paragraph).
2. **Escape-hatch #13 citation** = keep inline `(escape-hatch #13)` in the symmetry statement (it names the operator-capture failure mode the symmetry rule guards against).
3. **`record` role bullet cross-ref** = **add** a one-line cross-reference from the role bullet (line 40) to the new section (discoverability — the 0958 report frames the trigger as part of the record role). This widens the edit to two spots in `loop-engine.md` (the bullet + the promoted section); propagated to scope, acceptance criteria, and phase-01.

## Unresolved questions carried from the tracker — N/A for this plan

The tracker's 6 carried UQs all resolve in Plan 1/Plan 2 (lifecycle/authority). Plan 3 inherits no open tracker UQ; all of its own open items are now resolved above.

## Validation Log

### Verification Results
- Claims checked: 6
- Verified: 6 | Failed: 0 | Unverified: 0
- Tier: Light (2 phases → Fact Checker only)
- Claims verified (file:line evidence):
  - C1: recursion-bound section at `docs/loop-engine.md:87`; Honest-framing at line 91 says "deferred to the broadened Rec 12 plan" — matches plan.
  - C2: `meta_state_log_change` tool (`tools/learning-loop-mastra/tools/legacy/meta-state-log-change-tool.js`) has no `LOOP_SESSION_MODE`/`OPERATOR_MODE`/`isLiveSession` refs → open tool, runs in both modes (consistent with Plan 2's open-tools set).
  - C3: log_change params confirmed — `change_dimension`, `change_target`, `change_diff`, `reason` required; `applies_to` optional; idempotency key = `(change_dimension, change_target, reason)`.
  - C4: no test in `tools/learning-loop-mastra/__tests__/` references `loop-engine.md` prose → docs-only claim holds (no test asserts on this prose; `pnpm test` unaffected).
  - C5: escape-hatch #13 = "Operator-capture guard" at `docs/loop-engine.md:85` — the failure mode the symmetry rule guards against.
  - C6: no external anchor references the old `## The recursion-bound statement (skills)` heading (only the heading itself) → rename-safe.

### Validation Session 1 — Decisions (2026-07-08)
1. Section heading → `## The change-log trigger (Rec 12)`.
2. Escape-hatch #13 → keep inline citation in the symmetry statement.
3. `record` role bullet → add a one-line cross-reference to the new trigger section (widens the edit to two spots in `loop-engine.md`).

### Whole-Plan Consistency Sweep
- Re-read `plan.md` + both phase files after propagation.
- Scope, acceptance criteria (#8), and phase-01 (Related Code Files → two spots; step 7 + success criterion for the cross-ref) all updated to the two-spot edit.
- `phase-02` step 3 broadened to re-read the role bullet (line ~40) alongside the promoted section, so the verify phase confirms the cross-ref reads cleanly (the cross-ref is already covered by step 5's `git diff --stat` = only `docs/loop-engine.md`, but step 3 now eyeballs it too).
- The "Alternatives considered" rejection of putting the *trigger rule* in the role bullet still holds — the validation decision adds a *cross-reference*, not the rule itself, so the bullet stays a one-line kind-naming line. No contradiction.
- The only "needs no edit" claim remaining is the 4-kind union (line 67) — correct and intended.
- Unresolved contradictions: 0.

---
title: "Loop-maintained skill layer prerequisite"
description: "Wire skills from escape-hatch (state-1) to wired (state-2): generalize the skill contract (Req #3 + maturity frontmatter), extend the write-gate + mirror to <surface>/skills/** (dedicated skills preflight marker), extract the bound-artifacts constant, and land the L1 recursion-bound statement + authoring subsection in loop-engine.md. Ships the loop-owned skill-layer mechanism the later Rec 12 trigger consumer sits on."
status: completed
priority: P2
branch: "docs/loop-skill-layer-prerequisite"
tags: [skill-layer, l1, l2, l3, write-gate, mirror, bound-artifacts, two-axis]
blockedBy: [260706-1340-philosophy-agents-two-axis-injection-reframe]
blocks: []
created: "2026-07-06T18:21:58.521Z"
createdBy: "ck:plan"
source: skill
completed: "2026-07-06T19:15:00Z"
completedBy: "ck:cook"
---

# Plan: Loop-maintained skill layer prerequisite

**Date:** 2026-07-07
**Status:** completed.
**Source report:** `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md` (consensus direction locked 2026-07-07: ship chosen scope A as the layer, consult-gate as first enforcement surface; mirror via write-fanout (e); `skill_manage` dropped).

## Why

The loop has **one** ad-hoc loop-maintained skill today (`learning-loop`) governed by a single L2 requirement (`CONTRACT.md` Req #3 `skill-spec`). The prerequisite report (1359) verified the gap: no general framework for "a skill the loop maintains" — no mirror mechanism (`.mastracode/skills/` absent; `writeToAllSurfaces` hardcoded to `coordination/`), no skill write-gating (globs inlined; `<surface>/skills/**` freely writable), no shared bound-artifacts constant, no architecture section on skills as loop artifacts. Without the layer, the later Rec 12 trigger skill would be a *second ad-hoc skill beside the loop* — consumed state-1, not maintained state-2 — which contradicts Rec 9 ("procedural knowledge should be loop-encoded, not prose").

The L1 two-axis framing (injection × consumption; state-1/2/3) already shipped via the docs-rewrite plan `260706-1340` into `docs/philosophy.md` (full) + `docs/loop-engine.md` (one-line "instruction injection" anchor) + `AGENTS.md` §12. This prerequisite ships the **L2 + L3 mechanism** the framing requires: the contract that makes skills loop-maintained, and the gate/mirror that makes skill edits bound-artifact edits.

## Decisions locked (operator, 2026-07-07 consensus + this planning session)

From the 1359 report §"Consensus direction" (UQ1–UQ7):
1. **State-2 is the permanent home** for judgment-bound skill content (not a waystation).
2. **Escape-hatch survives** as the state-1 name, decoupled from file format.
3. **Mirror = (e) write-fanout** — generalize `writeToAllSurfaces` to `<surface>/skills/`; extend the write-gate (gate-monopoly). Parity test retained as backstop.
4. **`skill_manage` dropped** — no consumer; no non-operator creates skills; skill edits are change-logs in the existing `meta-state.jsonl` (no third substrate).
5. **Gate boundary** — this plan gates `<surface>/skills/**` ONLY; gating `docs/**`/`tools/**`/`core/**` is Rec 12's job (next plan).
6. **Maturity convention** — frontmatter `maturity:` (state-1/2/3), detector-friendly.
7. **`learning-loop` generalized retroactively** under the new layer (completing it materializes the absent `.mastracode/skills/` mirror).
8. **SessionEnd/pre-commit hook DEFERRED** with a named un-block (the broadened Rec 12's change-log gap detection + session-start gap surfacing), not an open date.

From this planning session (AskUserQuestion, 2026-07-07):
9. **Keep `learning-loop` as the single authoring skill** — defer the `loop-prompt-authoring` split (YAGNI; no consumer; smaller mirror/contract surface).
10. **L2 contract in `CONTRACT.md` Req #3 only** — do NOT add a 5th skill-hosting capability to `docs/runtime-contract.md` (keep skill hosting a mechanism concern).
11. **`maturity:` is a hard contract requirement** — validator fails any loop-maintained SKILL.md missing it; this plan backfills `coordination-gate`.

From the validation interview (AskUserQuestion, 2026-07-07):
12. **`learning-loop` + `coordination-gate` maturity = `state-2` (wired)** — deterministically injected (SessionStart discovery / contract) + agenticly consumed.
13. **Phase 6 does NOT edit the SKILL.md** — phase 4 folds `maturity:` + the `loop-engine.md` cross-ref into materialization; phase 6 is docs-only (`loop-engine.md` recursion-bound statement + authoring subsection). The gated-path proof is phase 5's tests.
14. **`gate_mark_preflight(surface: "skills")`** — phase 5 verifies the tool's `surface` param is unconstrained; if constrained, extends the allowed surface set to include `"skills"` (no new tool).

## Phases (smallest-first, lowest-risk-first — matches escape-hatch #8)

| Phase | Name | Risk | Depends on | Status |
|---|---|---|---|---|
| 1 | [L1 docs: trajectory terminus reframe](./phase-01-l1-docs-trajectory-recursion-bound.md) | Low (docs-only) | — | Pending |
| 2 | [L2 contract: generalize Req #3 + maturity](./phase-02-l2-contract-generalize-req-3-maturity.md) | Medium (validator + backfill) | 1 | Pending |
| 3 | [bound-artifacts constant](./phase-03-bound-artifacts-constant.md) | Low (behavior-preserving refactor) | — | Pending |
| 4 | [skills mirror mechanism](./phase-04-skills-mirror-mechanism.md) | Medium (new surface path + parity test + materialize) | 3 | Pending |
| 5 | [skills write-gate](./phase-05-skills-write-gate.md) | Medium (new gate rule, dedicated skills marker) | 3, 4 | Pending |
| 6 | [L1 recursion-bound statement + authoring subsection](./phase-06-learning-loop-authoring-skill.md) | Low (docs-only) | 2, 4, 5 | Pending |

Phases 1–2 are docs/contract (the spine). Phase 3 is the shared-constant extraction (behavior-preserving). Phases 4–5 are the L3 mechanism (mirror + gate) and compose the self-maintenance loop. Phase 6 lands the L1 recursion-bound statement + authoring subsection in `loop-engine.md` (after the gate ships). Phase 4 folds `learning-loop`'s `maturity:` frontmatter + `loop-engine.md` cross-ref into the `.mastracode` materialization, so the SKILL.md is settled before phase 6 and phase 6 does NOT edit any skill — the gated-path proof is phase 5's tests (validation decision 2026-07-07).

Phase 3 has no dependency on 1–2 (it is a pure refactor) and may run in parallel with them; it is listed before 4–5 because they import the constant.

## Dependencies

**Cross-plan:**
- `blockedBy: [260706-1340-philosophy-agents-two-axis-injection-reframe]` — ships the L1 two-axis framing this prerequisite states its L2/L3 decisions against. Complete (verified: `philosophy.md` carries the full state-1/2/3 + axes table; `loop-engine.md:73` carries the "instruction injection" anchor; `AGENTS.md` §12 carries the lens).

**Forward (not yet cut):**
- The lifecycle plan `260706-0958` (ships only the L1 trigger statement + symmetry in `loop-engine.md` `record` role) is **not blocked** by this prerequisite — it ships the concept. This prerequisite is not blocked by it either.
- The next plan (broadened Rec 12 trigger skill + `skill_manage` tool + change-log gap detection + session-start gap surfacing) is blocked by this prerequisite (it sits on the skill-layer mechanism). The SessionEnd/pre-commit hook (UQ5) un-blocks when that broadened Rec 12 lands.

## Scope boundary (explicit — do not absorb Rec 12)

- **In scope:** `<surface>/skills/**` mirror + gating; `core/bound-artifacts.js`; L1 trajectory reframe (phase 1) + recursion-bound statement (phase 6, after the gate ships); L2 Req #3 generalization + `maturity:` hard-require + `coordination-gate` backfill; `learning-loop` `maturity:` frontmatter (phase 4 materialization) + a one-line `loop-engine.md` cross-ref (phase 6).
- **Out of scope (Rec 12, next plan):** gating `docs/**`/`tools/**`/`core/**`; general bound-artifact auto-trigger; `skill_manage` MCP tool; change-log gap detection; session-start gap surfacing; SessionEnd/pre-commit hook.
- **Threat-model boundary:** the skills gate protects **loop-maintained** skills only (those mirrored across runtimes + declaring `maturity:`). External symlinked content under `.agents/skills/**` (e.g. the `mastra` symlink target) is NOT loop-maintained and is out of the gate's scope — documented in phase 5 + CONTRACT.md Req #3.
- **Dropped:** `loop-prompt-authoring` split (decision 9); `core/skill-manage.js` third substrate (decision 4); "self-maintaining via Rec 12" label → gate-monopoly + authoring-path-emitted change-log; the "reuse the product preflight marker" framing → a dedicated `skills` marker (red-team critical fix).

## Acceptance criteria

- `docs/trajectory.md` terminus reframed from "loop-owned MCP tools" to "state-3 (encoded)" with `deterministic-step` as the realizing concept role (ALL occurrences reframed, not one); `docs/loop-engine.md` carries the self-maintaining recursion-bound statement (phase 6, after the gate ships — stated as the intended invariant; enforcement deferred to broadened Rec 12) + the "Authoring loop-maintained skills" subsection; `philosophy.md` untouched (already fixed by 260706-1340).
- `CONTRACT.md` Req #3 generalized: host loop-maintained skills at `<surface>/skills/<name>/SKILL.md`, mirrored across all participating runtimes; a skill is loop-maintained iff it declares `maturity:` frontmatter (state-1/2/3); `learning-loop` references `loop_describe`+`meta_state_list`; skill files are gated artifacts. `contract.js::checkSkillSpec` enumerates only `maturity:`-declaring skills, hard-fails on missing `maturity:`, error-isolates malformed/oversized frontmatter (size cap + `schema:'core'`). `.mastracode/skills/` materialized (phase 4) with `maturity:` present.
- `core/bound-artifacts.js` is the single source of truth for the simple-glob rules; `evaluate-write-gate.js` imports it; a pinned-order test asserts the rule order; existing write-gate tests stay green (behavior-preserving).
- `core/surfaces.js` generalized via back-compat wrappers (`getAllSurfacePaths` + `writeToAllSurfacesSection` returning per-surface results + `writeToAllSkills`); existing `coordination/` signatures preserved, no caller changes; `.mastracode/skills/learning-loop/` + `.mastracode/skills/coordination-gate/` materialized byte-identical with `maturity:` (folded in, git-tracked); a byte-identical mirror parity test asserts `.claude` ≡ `.factory` ≡ `.mastracode` (excluding the `mastra` symlink).
- Write-gate blocks direct writes to `.claude/skills/**`, `.factory/skills/**`, `.mastracode/skills/**` unless a dedicated `.loop-preflight-skills` marker exists (`gate_mark_preflight(surface: "skills")`); `product/**` behavior unchanged (separate marker); `.agents/skills/**` external symlinked content out of scope (documented); `docs/**`/`tools/**`/`core/**` stay ungated (Rec 12).
- `learning-loop` SKILL.md carries `maturity: state-2` frontmatter + a one-line `loop-engine.md` cross-ref (both folded into phase 4 materialization; all 3 mirrors byte-identical); no authoring-standard prose section (that lives in `loop-engine.md`). Phase 6 does NOT edit the SKILL.md (validation decision 2026-07-07); the gated-path proof is phase 5's tests. `coordination-gate` SKILL.md carries `maturity: state-2` (phase 2 backfill + phase 4 mirror). `meta_state_log_change` records the phase-6 `loop-engine.md` change.
- Acceptance is **contract passes AND parity test passes** (not contract alone — the contract check is presence + tool-refs, not byte-identity). `node contract.js claude-code|droid|mastra-code` all exit 0; `skills-mirror-parity.test.js` green.
- Each phase has tests-first (TDD); all `pnpm test` touched suites green.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Phase 5 (gate) lands before phase 6 (SKILL.md edit) — phase 6 must edit through the gated path | Medium | Phase 6 IS the proof of the gated path: `gate_mark_preflight(surface:"skills")` → Edit each mirror → `meta_state_log_change`. Dedicated `skills` marker (red-team critical fix) — decoupled from `product`. |
| Preflight marker surface-name mismatch (gate reads `.loop-preflight-<X>`, operator creates `.loop-preflight-<Y>`) | Critical → fixed | Dedicated `skills` marker: gate reads `.loop-preflight-skills`, operator creates the same via `gate_mark_preflight(surface:"skills")`. No path-prefix derivation, no `inferSurface` reliance (red-team). |
| `gate_mark_preflight` writes the marker to ALL 3 runtimes' `coordination/` dirs in one call (cross-runtime blast radius) | Medium → accepted | Correct for skills: the fan-out writes all 3 mirrors, so all 3 must be unlocked together. Documented in phase 5/6. (Separate from `product`, which has the same behavior.) |
| `writeToAllSurfaces` swallows per-surface errors silently — partial mirror failure undetectable | High → fixed | Phase 4 helper returns per-surface results; phase 6 checks (red-team). |
| `.agents/skills/**` symlink-target bypass (gate matches the symlink name, not the realpath) | Medium → accepted | Threat-model boundary: the gate protects loop-maintained skills only (mirrored, `maturity:`-declaring). External `.agents/skills/**` content is out of scope, documented in phase 5 + CONTRACT.md (red-team). |
| Phase 6 rollback leaves stale `.mastracode/skills/` (not git-tracked) | High → fixed | Phase 4 `git add .mastracode/skills/`; phase 6 unconditional rollback (re-mirror from canonical) (red-team). |
| Phase 5 preflight TTL (30 min) expires mid-mirror | High → fixed | Phase 6 documents re-call `gate_mark_preflight(surface:"skills")` if expired; minimal divergence window (phase 4 folded `maturity:` in) (red-team). |
| Phase 2 frontmatter parse — unbounded input + no error isolation | Medium → fixed | Per-skill try/catch + size cap + `schema:'core'`; enumeration restricted to `maturity:`-declaring skills (excludes `mastra` symlink) (red-team). |
| Hard-requiring `maturity:` breaks `coordination-gate` (no frontmatter today) | Medium → fixed | Phase 2 backfills `coordination-gate` `maturity:`; phase 4 folds `learning-loop` `maturity:` into materialization. Tool-ref check scoped to `learning-loop` (red-team: `coordination-gate` has no tool refs). |
| Phase 4/6 contract-red window (mastra-code red between phase 4 and 6) | Medium → fixed | Phase 4 materializes `.mastracode/skills/` with `maturity:` already present → mastra-code green at phase 4 (red-team). |
| Phase 3 rule-order not pinned by a test | Medium → fixed | Pinned-order test asserts `BOUND_ARTIFACTS` name sequence (red-team). |
| `writeToAllSurfaces` generalization breaks `coordination/` callers | Medium → fixed | Back-compat wrappers (existing signatures preserved, no caller changes); design picked in-plan, not deferred (red-team). |
| `philosophy.md` reframe shifts every future session's framing | — | Already shipped by 260706-1340; this plan does NOT touch `philosophy.md`. |
| Scope creeps into a general skill-management framework (YAGNI) | Medium | Decisions 4 + 9 + the Scope boundary pin the scope; no skill registry, no `skill_manage`, no split. Phase 3 constant reframed as "one source of truth for simple globs" (not "future detector"). |

## Validation log

### Validation Session 1 — 2026-07-07 (deep mode step 7)

Verification pass skipped (Red Team Review section carries the evidence). Interview (4 questions):

- **Q1 `learning-loop` maturity → state-2 (wired).** Deterministically injected (SessionStart discovery + contract) + agenticly consumed. (Phase 4 sets `maturity: state-2`.)
- **Q2 Phase 6 SKILL.md edit → DROP.** Phase 4 folds the `maturity:` frontmatter AND the `loop-engine.md` cross-ref into materialization; phase 6 does NOT edit the SKILL.md. The gated-path proof is phase 5's tests (block + skills-marker unlock + regression), not a phase-6 SKILL.md edit. Phase 6 becomes docs-only: the `loop-engine.md` recursion-bound statement + authoring subsection + `meta_state_log_change`. Smaller phase 6; removes the TTL/mirror-divergence risk the red-team flagged for the phase-6 SKILL.md edit.
- **Q3 `gate_mark_preflight(surface: "skills")` → verify, extend if constrained.** Phase 5 first verifies the tool's `surface` param is not validated against a fixed set (red-team: it writes `.loop-preflight-<arg>` for any string). If it IS constrained, phase 5 extends the allowed surface set to include `"skills"` (small tool-wrapper change, not a new tool). If unconstrained, proceed.
- **Q4 `coordination-gate` maturity → state-2 (wired).** Mirrored + contract-surfaced (deterministic injection), agenticly consumed. (Phase 2 backfill + phase 4 mirror.)

### Verification Results

- Tier: Full (5+ phases) — verification covered by the 4 red-team reviewers (Fact Checker / Flow Tracer / Scope Auditor / Contract Verifier) with file:line evidence; 15 accepted findings applied.
- Claims checked: ~40 across plan + 6 phases | Verified: 40 | Failed: 0 | Unverifiable: 0 (after red-team + validation propagation).
- Failures: none remaining.

### Whole-Plan Consistency Sweep (post-validation, 2026-07-07)

Re-read `plan.md` + all 6 phase files after the 4 validation decisions. Checks:
- "Phase 6 edits the SKILL.md" → **absent**; phase 6 is docs-only (`loop-engine.md`), SKILL.md settled in phase 4.
- "Phase 6 gated-path proof" → **absent** as a SKILL.md edit; the gated-path proof is phase 5's tests (Q2).
- `learning-loop` + `coordination-gate` maturity → `state-2` consistently (phase 2, phase 4, plan.md).
- `gate_mark_preflight(surface: "skills")` verify-step → present in phase 5 step 2 (Q3).
- Cross-ref to `loop-engine.md` subsection → folded into phase 4 materialization; phase 6 names the subsection it points at (consistent order: phase 4 cross-ref → phase 6 subsection).
- Red-team consistency sweep (prior) findings still resolved (dedicated `skills` marker; recursion-bound in phase 6; authoring standard in `loop-engine.md`; per-surface results; git-tracking; error isolation; pinned order; contract-red window collapsed).
- **Unresolved contradictions: 0.** Plan is eligible for implementation.

## Red Team Review

### Session — 2026-07-07
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic (4 — 6-phase plan).
**Findings:** 17 raw → 15 accepted, 2 rejected (evidence-filtered, deduplicated, capped at 15).
**Severity breakdown:** 3 Critical, 7 High, 5 Medium.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Preflight marker surface mismatch — Phase 5 reads `.loop-preflight-<prefix>`, Phase 6 writes `.loop-preflight-product`; never matches → Phase 6 blocks forever | Critical | Accept | Phase 5, 6 (dedicated `skills` marker) |
| 2 | Phase 2 silently fails `coordination-gate` on the tool-ref check (it has no `loop_describe`/`meta_state_list`) | Critical | Accept | Phase 2 (scope tool-ref check to `learning-loop`) |
| 3 | Symlink-target bypass via `.agents/skills/**` (gate matches symlink name, not realpath) | Critical | Accept | Phase 5 + scope boundary (threat-model: loop-maintained skills only) |
| 4 | Risk table understates cross-runtime blast radius (`gate_mark_preflight` writes all 3 runtimes) | High | Accept | plan.md risks + Phase 5/6 (reframe as correct-for-fan-out) |
| 5 | `writeToAllSurfaces` swallows per-surface errors silently — partial mirror failure undetectable | High | Accept | Phase 4 (per-surface results) + Phase 6 (checks) |
| 6 | Phase 6 "invoke the fan-out" has no callable unit (no MCP tool calls `writeToAllSkills`) | High | Accept | Phase 6 (gated Edit per mirror; fan-out is the trusted internal path) |
| 7 | Phase 5 "reuse" framing broken — `inferSurface` returns null for surface-prefix paths → gate never blocks | High | Accept | Phase 5 (explicit `surface="skills"`, new mechanism not reuse) |
| 8 | Phase 1 L1 invariant pre-ships the L3 mechanism (recursion-bound statement before the gate exists) | High | Accept | Phase 1 → Phase 6 (statement moves after the gate) |
| 9 | Phase 6 rollback leaves stale `.mastracode/skills/` (not git-tracked) | High | Accept | Phase 4 (`git add`) + Phase 6 (unconditional rollback) |
| 10 | Phase 5 preflight TTL (30 min) can expire mid-edit | High | Accept | Phase 6 (re-call `gate_mark_preflight` if expired) |
| 11 | `contract.js` mirror check is presence-only — "contract exits 0" ≠ parity | Medium | Accept | Acceptance criteria (contract AND parity test) |
| 12 | Phase 2 frontmatter — unbounded input + no error isolation (billion-laughs; one bad skill aborts all) | Medium | Accept | Phase 2 (per-skill try/catch + size cap + `schema:'core'`; restrict to `maturity:`-declaring skills) |
| 13 | Phase 3 rule-order not pinned by a test | Medium | Accept | Phase 3 (pinned-order test) |
| 14 | Phase 4/6 contract-red window — mastra-code red between phase 4 and 6 | Medium | Accept | Phase 4 (materialize with `maturity:` present) |
| 15 | Phase 6 "Authoring loop-maintained skills" section in the SKILL.md is scope creep (wrong audience) | Medium | Accept | Phase 6 (authoring standard → `loop-engine.md`; SKILL.md gets `maturity:` + a one-line cross-ref only) |
| R1 | Phase 3 `bound-artifacts.js` is gold plating for a non-existent consumer | Medium | Reject | — (extraction is operator-confirmed; reframed justification to "one source of truth for simple globs", dropped "future detector") |
| R2 | Reverse Decision 11 (hard-require `maturity:`) — premature, detector ships next plan | Medium | Reject | — (user decision; the YAGNI trade-off was surfaced in the planning interview and the user chose hard-require) |

### Whole-Plan Consistency Sweep (post-red-team, 2026-07-07)

Re-read `plan.md` + all 6 phase files after applying the 15 accepted findings. Checks:
- "Reuse the product preflight marker" framing → **absent**; replaced by the dedicated `skills` marker in Phase 5, Phase 6, plan.md risks + scope boundary.
- "Recursion-bound statement in Phase 1" → **absent**; moved to Phase 6 (after the gate ships); Phase 1 ships only the trajectory terminus reframe.
- "Authoring-standard section in `learning-loop` SKILL.md" → **absent**; moved to `docs/loop-engine.md` (Phase 6); SKILL.md gets `maturity:` (Phase 4) + a one-line cross-ref (Phase 6) only.
- "Invoke the fan-out" as the Phase 6 mirror mechanism → **absent**; replaced by gated-Edit-per-mirror (fan-out is the trusted internal path, noted).
- "mastra-code advisory until phase 4" → reconciled: mastra-code goes green at Phase 4 (maturity folded into materialization); Phase 2's advisory is pre-Phase-4 only.
- "Contract exits 0" as sole acceptance → **absent**; acceptance is "contract passes AND parity test passes."
- Phase 3 "future detector" justification → **absent**; reframed to "one source of truth for the simple-glob rules."
- `philosophy.md` untouched → confirmed in Phase 1, Phase 6, plan.md acceptance.
- Line-number refs in Phase 1 → replaced with section anchors / content-based location.
- **Unresolved contradictions: 0.** Plan is eligible for the validation interview (deep mode step 7).

## Unresolved questions

None remaining. UQ1–UQ7 resolved in the 1359 report consensus session; decisions 9–11 resolved in the planning interview; decisions 12–14 resolved in the validation interview (all 2026-07-07). The SessionEnd/pre-commit hook (UQ5) is deferred with a named un-block (the broadened Rec 12), not an open question.
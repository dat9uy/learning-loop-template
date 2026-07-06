---
title: "philosophy.md + AGENTS.md two-axis injection reframe"
description: "Rewrite the L1/L2 docs to the agreed instruction-injection × consumption two-axis framing so future sessions approach the loop through the two-axis lens instead of the solution-centric 'skill / MCP tool' framing."
status: pending
priority: P2
branch: "docs/l1-two-axis-injection-reframe"
tags: [docs, l1-framing, two-axis, injection-consumption]
blockedBy: []
blocks: []
created: "2026-07-06T06:40:00.000Z"
createdBy: "operator"
source: skill
---

# Plan: philosophy.md + AGENTS.md two-axis injection reframe

**Date:** 2026-07-06
**Status:** ready to implement — framing agreed (1359 consolidated report + 4 operator decisions below).
**Source:** `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md` (consolidates the prior 1124 + 1311 + 1340 reports; the 1340 originals are deleted on merge — its L1 two-axis framing lives in §"The L1 framing (spine)" of the 1359 report).

## Why

The 1311 ck-predict report worked reverse (machinery → terminology) and coined "loop-maintained / loop-encoded," which conflicts with `loop-engine.md`'s existing L1 vocabulary (deterministic-step / agentic-step). The 1340 reframing — carried forward in the 1359 consolidated report — corrects this: the L1 axis is **instruction injection × consumption**, giving three states (escape-hatch / wired / encoded), with state-2 (deterministic injection + agentic consumption) as the loop's permanent home for judgment-bound content. The prerequisite skill-layer plan's machinery is correct; only its L1 *labeling* was wrong. This plan rewrites the L1/L2 docs to the agreed framing so future sessions approach the loop through the two-axis lens instead of the solution-centric "skill / MCP tool" framing.

## Decisions locked (operator, 2026-07-06)

1. State-2 is the **permanent home** for judgment-bound content (not a waystation toward state-3).
2. **"Escape-hatch" survives** as the state-1 name, decoupled from file format.
3. `loop-engine.md` gets the one-line "instruction injection" note.
4. Rewrites via **this plan** (not a direct edit).

## Phases (smallest-first, lowest-risk-first — matches escape-hatch #8)

| Phase | File | Change | Depends on | Status |
|---|---|---|---|---|
| 1 | [phase-01](./phase-01-loop-engine-injection-note.md) → `docs/loop-engine.md` | One sentence: name "instruction injection" as the escape-hatch gradient's subject (not file format). Establishes the canonical L1 term. | — | Pending |
| 2 | [phase-02](./phase-02-philosophy-skill-authority-reframe.md) → `docs/philosophy.md` | Rewrite two sections together: "Skills Are the Same Kind of Escape Hatch" + Pillar 4 "Skill Authority vs Loop Authority". Drop "MCP tool" as terminus; add the injection × consumption two-axis model + three states; reframe skill as agentic-injection mechanism; relabel migration sequence as state-1→2→3. | Phase 1 | Pending |
| 3 | [phase-03](./phase-03-agents-how-to-approach.md) → `AGENTS.md` | Add "How to Approach: Placing Procedural Knowledge" — the injection × consumption lens for deciding where new procedural knowledge belongs. | Phases 1–2 | Pending |

Phase 2's two sections are one phase (same doc, same concept, cross-referencing — splitting would create an inconsistent intermediate state where one section uses the new framing and the other doesn't).

## Dependencies

No plan-dir cross-plan dependencies to wire. The 1359 report's dependency diagram is:

```
docs-rewrite plan 260706-1340 (this plan — L1 framing)
        └──►  lifecycle plan P4 (L1 trigger statement + symmetry)
                      └──►  skill-layer prerequisite (L1/L2/L3 + gate/mirror extensions)
                                    └──►  next plan (Rec 12 trigger skill + skill_manage tool)
```

The downstream lifecycle plan (`plans/260706-0958-...`) and the skill-layer prerequisite plan are **not yet cut** (report-confirmed: "No plan dir exists for this prerequisite or for the lifecycle-redesign plan"). When they are cut, they should declare `blockedBy: [260706-1340-philosophy-agents-two-axis-injection-reframe]` (this plan ships the L1 framing they rest on). Until then `blockedBy: []` / `blocks: []` here.

## Acceptance criteria

- `loop-engine.md` names "instruction injection" as the gradient's subject; deterministic-step / agentic-step / record / rule / promotion vocabulary unchanged; the 13 escape-hatch items' vocabulary preserved (escape-hatch kept as state-1 name).
- `philosophy.md`: "internalize the skill into the loop as an MCP tool" replaced; escape-hatch reframed as state-1 (agentic injection, no deterministic wiring), explicitly decoupled from file format; Pillar 4 reframes "skill" as the agentic-injection mechanism, not a concept role; **terminus named "state-3 (encoded)"** (the two-axis state), with `deterministic-step` named as the `loop-engine.md` concept role that *realizes* state-3 — layered like `agentic-step` (concept role) → skill (L3 realization), so the two vocabularies stay distinct (Q4); migration sequence relabeled state-1 → state-2 → state-3; state-2 framed as the permanent home for judgment-bound content; **Core Premise line 13's generic "MCP tools" rephrased to "deterministic steps"** so no stale terminus language survives in Core Premise (Q2); Pillars 1–3 + "State Machine and Observations" + the rest of Core Premise untouched.
- `AGENTS.md`: new "How to Approach" section gives the injection × consumption lens; cross-references `loop-engine.md` + `philosophy.md`; existing sections unchanged in content (additive only — note the file's section numbering is non-contiguous: only §§1, 6, 7, 10, 11 exist today; the new section appends as §12).
- No "loop-maintained" / "loop-encoded" terminology introduced in the rewritten sections.
- Each file stays under `docs.maxLoc` (800).

## Out of scope

- The prerequisite report (`...1359-...`) L1 #1–#3 rewrite to drop loop-maintained/loop-encoded in `loop-engine.md` beyond the one-sentence note — the deeper L1 concept statements (skill is an agentic-injection artifact; escape-hatch is a state; self-maintaining recursion bound) belong to the skill-layer prerequisite plan, not this docs-rewrite plan.
- `tools/learning-loop-mastra/interface/CONTRACT.md` Req #3 (`skill-spec`) generalization — belongs to the prerequisite plan.
- Any code change (`core/`, `tools/`) — this is a docs-only plan.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `philosophy.md` is L1 deep-treatment; rewriting it shifts the framing every future session inherits | Medium | The 1359 report is the agreed reference; the two-axis model is verified against the reductio (meta-state descriptions = state-2 by design); operator signed off on state-2-permanent + escape-hatch-kept. Phases give review boundaries. |
| The one-line `loop-engine.md` addition touches the L1 invariant doc | Low | One sentence; names a subject already implied by escape-hatch #1; no vocabulary change. |
| Introducing "state-1/2/3" in philosophy.md conflicts with `loop-engine.md` | Low | Phase 1 names "instruction injection" only, NOT the state-N vocabulary; the state-N vocabulary is philosophy.md's expansion, consistent with loop-engine.md's deterministic-step / agentic-step. |
| `AGENTS.md` addition changes what every agent reads at session start | Low | Additive only; no existing section restructured; the lens is the agreed 1359 framing. Appending as §12 avoids renumbering the existing non-contiguous sections. |

## Validation Log

### Verification Results (session 1, 2026-07-06)

- Tier: Standard (3 phases → Fact Checker + Contract Verifier, 10 claims/phase)
- Claims checked: 18 | Verified: 17 | Failed: 1 | Unverifiable: 0
- Verified: `loop-engine.md` escape-hatch #1 line 80 + exact text; 13 escape-hatch items; deterministic-step / agentic-step vocabulary lines 45-46 (untouched by addition); `philosophy.md` "Skills Are the Same Kind of Escape Hatch" line 29 (subsection of `## Core Premise`); Pillar 4 line 68; Pillars 1-3 (39-67) + State Machine (86+) outside scope; "internalize the skill into the loop" = 1 occ (line 33, in scope); "MCP tool" = 3 occ (line 33 + 84 in scope, line 13 in Core Premise outside scope); file LOC 98/196/120 < 800; 1359 source report exists, 1340 deleted; AGENTS.md sections non-contiguous (1, 6, 7, 10, 11).
- **Failed (1):** out-of-scope section names `CONTRACT.md` Req #3 — no `CONTRACT.md` at repo root; `docs/runtime-contract.md` has no "Req #3" / "skill-spec" string. **Resolved (Q1):** the real contract is `tools/learning-loop-mastra/interface/CONTRACT.md` Req #3 (`skill-spec`, lines 36-43), governing the `learning-loop` SKILL.md. Out-of-scope ref repointed to the correct path.

### Interview answers (session 1, 2026-07-06)

- **Q1 (CONTRACT ref):** repointed to `tools/learning-loop-mastra/interface/CONTRACT.md` Req #3 (`skill-spec`). Propagated to plan.md out-of-scope.
- **Q2 (line 13 "MCP tools"):** rephrase line 13 too — replace "MCP tools" with "deterministic steps". Propagated to phase 2 (Files to modify, Implementation steps, Validation grep now expects 0 "MCP tool" occurrences) + plan.md acceptance.
- **Q3 (L1 note depth):** stay minimal — `loop-engine.md` note names "instruction injection" only, not the two axes / state-N. No change to phase 1.
- **Q4 (terminus term):** distinguish — terminus named "state-3 (encoded)"; `deterministic-step` named as the `loop-engine.md` concept role that realizes state-3, layered like `agentic-step` → skill. Propagated to phase 2 Change 2 point 3 + plan.md acceptance.

### Whole-Plan Consistency Sweep (session 1, 2026-07-06)

Re-read `plan.md` + all 3 phase files after propagation. Checks:
- "terminus named 'deterministic step'" (old Q4-rejected wording) → **absent**; only the new "state-3 (encoded)" + "deterministic-step realizes it" form remains.
- `CONTRACT.md` refs → all use `tools/learning-loop-mastra/interface/CONTRACT.md` (Q1 path fix applied everywhere).
- Stale `from-problem-solving-260706-1340` source refs → **absent**.
- Line 13 in phase 2 scope → present in Files-to-modify, Implementation steps, Validation, rollback.
- "MCP tool" in plan.md → only in contexts describing the old/replaced language or the drop action; none claim it as the terminus.
- ck status reads the plan: title, `pending`, 0/3 phases.
- **Unresolved contradictions: 0.** Plan is eligible for implementation.
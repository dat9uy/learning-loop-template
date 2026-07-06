# Plan: philosophy.md + AGENTS.md two-axis injection reframe

**Date:** 2026-07-06
**Status:** ready to implement — framing agreed (1340 report + 4 operator decisions below).
**Source:** `plans/reports/from-problem-solving-260706-1340-injection-consumption-two-axis-l1-reframe-report.md`

## Why

The 1311 ck-predict report worked reverse (machinery → terminology) and coined "loop-maintained / loop-encoded," which conflicts with `loop-engine.md`'s existing L1 vocabulary (deterministic-step / agentic-step). The 1340 report reframes correctly: the L1 axis is **instruction injection × consumption**, giving three states (escape-hatch / wired / encoded), with state-2 (deterministic injection + agentic consumption) as the loop's permanent home for judgment-bound content. The prerequisite skill-layer plan's machinery is correct; only its L1 *labeling* was wrong. This plan rewrites the L1/L2 docs to the agreed framing so future sessions approach the loop through the two-axis lens instead of the solution-centric "skill / MCP tool" framing.

## Decisions locked (operator, 2026-07-06)

1. State-2 is the **permanent home** for judgment-bound content (not a waystation toward state-3).
2. **"Escape-hatch" survives** as the state-1 name, decoupled from file format.
3. `loop-engine.md` gets the one-line "instruction injection" note.
4. Rewrites via **this plan** (not a direct edit).

## Phases (smallest-first, lowest-risk-first — matches escape-hatch #8)

| Phase | File | Change | Depends on |
|---|---|---|---|
| 1 | `docs/loop-engine.md` | One sentence: name "instruction injection" as the escape-hatch gradient's subject (not file format). Establishes the canonical L1 term. | — |
| 2 | `docs/philosophy.md` | Rewrite two sections together: "Skills Are the Same Kind of Escape Hatch" + Pillar 4 "Skill Authority vs Loop Authority". Drop "MCP tool" as terminus; add the injection × consumption two-axis model + three states; reframe skill as agentic-injection mechanism; relabel migration sequence as state-1→2→3. | Phase 1 |
| 3 | `AGENTS.md` | Add "How to Approach: Placing Procedural Knowledge" — the injection × consumption lens for deciding where new procedural knowledge belongs. | Phases 1–2 |

Phases 2's two sections are one phase (same doc, same concept, cross-referencing — splitting would create an inconsistent intermediate state where one section uses the new framing and the other doesn't).

## Acceptance criteria

- `loop-engine.md` names "instruction injection" as the gradient's subject; deterministic-step / agentic-step / record / rule / promotion vocabulary unchanged; the 13 escape-hatch items' vocabulary preserved (escape-hatch kept as state-1 name).
- `philosophy.md`: "internalize the skill into the loop as an MCP tool" replaced; escape-hatch reframed as state-1 (agentic injection, no deterministic wiring), explicitly decoupled from file format; Pillar 4 reframes "skill" as the agentic-injection mechanism, not a concept role; terminus named "deterministic step" (per `loop-engine.md` invariant), not "MCP tool"; migration sequence relabeled state-1 → state-2 → state-3; state-2 framed as the permanent home for judgment-bound content; Pillars 1–3 untouched.
- `AGENTS.md`: new "How to Approach" section gives the injection × consumption lens; cross-references `loop-engine.md` + `philosophy.md`; existing sections 1–11 unchanged in content (additive only).
- No "loop-maintained" / "loop-encoded" terminology introduced in the rewritten sections.
- Each file stays under `docs.maxLoc` (800).

## Out of scope

- The prerequisite report (`...1124-...`) L1 #1–#3 rewrite to drop loop-maintained/loop-encoded — separate follow-up after this plan ships.
- `CONTRACT.md` Req #3 generalization — belongs to the prerequisite plan.
- Any code change (`core/`, `tools/`) — this is a docs-only plan.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `philosophy.md` is L1 deep-treatment; rewriting it shifts the framing every future session inherits | Medium | The 1340 report is the agreed reference; the two-axis model is verified against the reductio (meta-state descriptions = state-2 by design); operator signed off on state-2-permanent + escape-hatch-kept. Phases give review boundaries. |
| The one-line `loop-engine.md` addition touches the L1 invariant doc | Low | One sentence; names a subject already implied by escape-hatch #1; no vocabulary change. |
| Introducing "state-1/2/3" in philosophy.md conflicts with `loop-engine.md` | Low | Phase 1 names "instruction injection" only, NOT the state-N vocabulary; the state-N vocabulary is philosophy.md's expansion, consistent with loop-engine.md's deterministic-step / agentic-step. |
| `AGENTS.md` addition changes what every agent reads at session start | Low | Additive only; no existing section restructured; the lens is the agreed 1340 framing. |
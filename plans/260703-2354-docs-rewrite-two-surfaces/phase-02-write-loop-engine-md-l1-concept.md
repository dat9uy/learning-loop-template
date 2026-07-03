---
phase: 2
title: "Write loop-engine.md (L1 concept)"
status: pending
effort: "1d"
priority: P1
dependencies: [1]
---

# Phase 2: Write loop-engine.md (L1 concept)

## Overview
Write the keystone new concept doc: the engine invariant, the concept vocabulary, the two-surface split, and the 13 irreducible escape-hatch items. This is the doc that names what was previously only in the operator's head. Implementation-agnostic — no Mastra terms, no file paths.

## Requirements
- Functional: `docs/loop-engine.md` exists, opens with `<!-- level: L1 | surface: concept -->`, names the engine cycle + concept vocabulary + two-surface split + 4-kind union (as concept) + 13 escape-hatch items + the deferred directive-3 open questions.
- Non-functional: contains zero Mastra primitive names (`Agent`/`Workflow`/`createTool`/`Mastra`), zero file paths, zero `learning-loop-mcp`/`learning-loop-mastra` strings. A doc at L1 references only L0/L1.

## Architecture
The doc structure (top-to-bottom):
1. **Level tag + one-paragraph thesis:** the loop is an engine; the record is the memory; the deterministic surface grows.
2. **The invariant (intended; the promotion bridge is unwired as of this doc — see Open Questions):** every step is deterministic (rule-enforced, registry-driven) or agentic (deferred to LLM). Telos: grow deterministic, shrink agentic. The intended cycle: agentic deferral → record (finding/change-log) → promote to rule when it recurs → becomes deterministic. State the unwired status inline in the invariant, not only in a separate Open Questions section a reader may skip.
3. **Concept vocabulary:** deterministic-step / agentic-step / record / rule / promotion — each defined as a ROLE in the engine, not a mechanism. Use lowercase common nouns ("agent", "workflow step") — NEVER capitalized framework class names.
4. **Two surfaces, named:** Concept surface (this doc + L0) vs Implementation surface (L2/L3/L4). The many-to-many mapping table (concept role → typical mechanism → also realizable by) — stated abstractly (e.g. "an agentic-step is typically an LLM-backed step; it may be realized by a framework agent primitive, an operator+runtime session, or a workflow step that calls a model"). No framework names, no capitalized class names.
5. **The 4-kind registry union as concept** (finding/change-log/rule/loop-design) — point to `meta-state-lifecycle.md` for lifecycle, do not duplicate.
6. **The 13 escape-hatch items** (each 1-3 lines): escape-hatch gradient; three-class dependency balance; decisions-are-boundaries-not-permissions; dimensional verification; what-stays-human-forever; adversarial mindset; engine/instance inversion (why meta-surface is the only bound surface); skill-migration ordering rationale; destination sentence; trajectory-is-not-contract; storage parking rationale; loss-function question; operator-capture guard.
7. **Open design questions (deferred to next session):** (a) the recurrence→promotion bridge is unwired; (b) agentic/deterministic provenance is absent from the registry data model. Note as questions, do not solve.

## Related Code Files
- Create: `docs/loop-engine.md`
- Source material (read, do not duplicate prose — consolidate + point): `docs/philosophy.md` (escape-hatch gradient, pillars), `docs/trajectory.md` (destination, bridges, skill-migration), archived `AGENTS.md` §6/§10 (internalization rule, engine/instance inversion), the 13-item list in the docs-audit scout report.

## Implementation Steps
1. Read `docs/philosophy.md`, `docs/trajectory.md`, and the archived `AGENTS.md.pre-260703` (§6 + §10) to extract the 13 items verbatim-intent.
2. Draft `loop-engine.md` per the 7-part structure above. Keep each escape-hatch item to 1-3 lines; the doc is a map, not a treatise.
3. Self-audit: `grep -niE "mastra|createTool|createWorkflow|Agent class|Workflow class|learning-loop|tools/" docs/loop-engine.md` must return 0 hits. (Note: the concept-vocab example uses "framework agent primitive" / "workflow step" — lowercase common nouns — precisely to pass this gate. Capitalized class names are an L3 concern.)
4. Cross-check the concept-vocabulary definitions against the operator's reframing (this session's problem-solving report) — the concept role is primary; mechanism is interchangeable.

## Success Criteria
- [ ] `docs/loop-engine.md` exists with the L1 level tag.
- [ ] Names: deterministic-step, agentic-step, record, rule, promotion; the one cycle; the two-surface split; the 4-kind union; all 13 escape-hatch items; the 2 deferred open questions.
- [ ] Zero Mastra/path strings (grep above returns 0).
- [ ] A reader unfamiliar with Mastra can understand the engine + why the loop exists from this doc alone.

## Risk Assessment
- **Risk:** the doc drifts into mechanism (mentions Mastra). **Mitigation:** the grep self-audit is a hard gate; if it hits, the section belongs in `architecture.md` (L3), not here.
- **Risk:** duplicating `philosophy.md`/`trajectory.md` prose. **Mitigation:** `loop-engine.md` consolidates the *engine + vocabulary* (which those docs imply but don't state); it points to them for the deep "why." Keep the 13 items as compact pointers, not re-essays.
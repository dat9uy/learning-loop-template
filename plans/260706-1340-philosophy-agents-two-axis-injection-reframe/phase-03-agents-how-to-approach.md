# Phase 3: AGENTS.md — "How to Approach: Placing Procedural Knowledge"

## Context
- Source report: `plans/reports/from-problem-solving-260706-1340-injection-consumption-two-axis-l1-reframe-report.md`
- Operator directive: AGENTS.md should "tell further sessions how to approach."
- Depends on phase 1 (`loop-engine.md` "instruction injection" term) + phase 2 (`philosophy.md` two-axis model + three states).

## File to modify
- `AGENTS.md` — add a new section; do not restructure existing sections 1–11.

## Change

Add a new section — suggested placement: after section 10 ("Where This Project Is Heading") or as a new section before it. Suggested title: **"How to Approach: Placing Procedural Knowledge"** (number it to fit the existing sequence).

### Content (must contain)
The section gives future sessions the injection × consumption lens for deciding where new procedural knowledge belongs:

1. **Identify the instruction** you're adding (a triage procedure, a guardrail, a surfacing rule, a contract note).
2. **Injection axis** — does it need deterministic injection (a hook/gate surfaces it at the right moment), or is agentic injection (the model opens it ad hoc) enough? If timing matters → it needs deterministic injection → at least state-2.
3. **Consumption axis** — is the content agentic (model reads + decides) or can it be deterministic (a rule/gate executes without the model)? Judgment-bound content stays agentic (state-2); encodable judgment goes to state-3.
4. **Guardrails** — which actions must be deterministic (consult-gates on operator-judgment boundaries — escape-hatch #5/#6)? State-3 for the guardrail; state-2 for the content.
5. **Cross-reference** — `loop-engine.md` for the invariant (deterministic-step / agentic-step); `philosophy.md` for the two-axis model + three states.

### Why this section belongs in AGENTS.md (not loop-engine.md / philosophy.md)
- `loop-engine.md` = the invariant (what). `philosophy.md` = the deep treatment (why). `AGENTS.md` = the cross-runtime operational lens (how to approach). The operator's point: AGENTS.md should tell future sessions how to approach — this section is the operational lens; the concept lives in the other two docs.

## Implementation steps
1. `Read` `AGENTS.md` section headers to pick the placement (after section 10 or as a new section before it).
2. `Edit` to insert the new section; number it to fit.
3. Verify sections 1–11 content unchanged (additive only).

## Validation
- `grep -n "injection\|consumption" AGENTS.md` → present in the new section.
- `grep -n "loop-engine.md\|philosophy.md" AGENTS.md` → the new section cross-references both.
- Existing sections 1–11 byte-identical in content (additive only — diff check).
- File under 800 lines.

## Risk + rollback
- **Risk:** AGENTS.md is the cross-runtime coordination reference; adding a section changes what every agent reads at session start. **Mitigation:** additive only; no existing section restructured; the lens is the agreed 1340 framing.
- **Rollback:** delete the new section.
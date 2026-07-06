---
phase: 3
title: "AGENTS.md — How to Approach: Placing Procedural Knowledge"
status: pending
effort: "low"
priority: P2
dependencies: [1, 2]
---

# Phase 3: AGENTS.md — "How to Approach: Placing Procedural Knowledge"

## Overview
Add a new "How to Approach: Placing Procedural Knowledge" section to `AGENTS.md` giving future sessions the injection × consumption lens for deciding where new procedural knowledge belongs. Additive only — no existing section restructured.

## Context
- Source report: `plans/reports/from-concept-debate-to-prerequisite-260706-1359-loop-skill-layer-injection-two-axis-report.md` (§"The L1 framing (spine)" — consolidates the prior 1340 reframing).
- Operator directive: AGENTS.md should "tell further sessions how to approach."
- Depends on phase 1 (`loop-engine.md` "instruction injection" term) + phase 2 (`philosophy.md` two-axis model + three states).

## File to modify
- `AGENTS.md` — add a new section; do not restructure existing sections. Note the file's section numbering is **non-contiguous**: only §§1, 6, 7, 10, 11 exist today (verified 2026-07-06). Append the new section as **§12** at the end of the file — cleanest additive placement, avoids renumbering and avoids implying §§2–5, 8–9 exist.

## Change

Add a new section — placement: **append as §12** at the end of `AGENTS.md` (after §11 "Runtime Interface Ownership"). Title: **"How to Approach: Placing Procedural Knowledge"**.

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
3. Verify existing sections (§§1, 6, 7, 10, 11) content unchanged (additive only).

## Validation
- `grep -n "injection\|consumption" AGENTS.md` → present in the new section.
- `grep -n "loop-engine.md\|philosophy.md" AGENTS.md` → the new section cross-references both.
- Existing sections (§§1, 6, 7, 10, 11) byte-identical in content (additive only — diff check).
- File under 800 lines.

## Risk + rollback
- **Risk:** AGENTS.md is the cross-runtime coordination reference; adding a section changes what every agent reads at session start. **Mitigation:** additive only; no existing section restructured; the lens is the agreed 1359 framing.
- **Rollback:** delete the new section.
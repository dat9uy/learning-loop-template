<!-- level: L1 | surface: concept -->

# The Loop Engine

The learning loop is an engine. Its memory is the record. Its telos is to grow the deterministic surface and shrink the agentic one. This document names the engine's invariant, its concept vocabulary, and the two surfaces that must never share vocabulary. It is implementation-agnostic: it names roles, not mechanisms. The mechanism that realizes each role today lives in `docs/architecture.md`; the contract a runtime must satisfy to participate lives in `docs/runtime-contract.md`.

## The invariant

Every cognitive step the loop takes is either:

- **deterministic** — rule-enforced, registry-driven, no judgment deferred to a model; or
- **agentic** — deferred to a model or an operator+runtime session because it cannot yet be encoded.

The loop's telos: **grow the deterministic surface; shrink the agentic surface.** The intended cycle is one:

> agentic deferral → recorded as a finding or change-log → promoted to a rule when it recurs → becomes deterministic.

"Learning" = the deterministic surface grows. Everything else (which primitive ran the step, whether the operator or an agent did it) is mechanism.

**Status of the cycle (state this inline, not in a footnote):** the cycle is half-wired. The record step and the promotion step exist today. Recurrence detection over **gate decisions** is wired — when a rule recurs on the same command pattern within a window, a finding is emitted automatically. The unwired half is recurrence detection over **agentic-deferral change-logs**: which deferrals recur and are ready to promote is not yet detected mechanically, so promotion stays operator-triggered. A human decides when to promote. Closing the change-log half is the open design question at the end of this doc, not a solved part of the invariant.

## Concept vocabulary

These are ROLES in the engine, not mechanisms. They use lowercase common nouns; the framework class names that realize them are an implementation concern (L3).

- **deterministic-step** — a step whose outcome is fixed by a rule or registry state. Anyone may run it; the outcome does not depend on judgment.
- **agentic-step** — a step deferred to a model or an operator+runtime session because it cannot yet be encoded. The step itself is not recorded during deferral; only its *outcome* is recorded, via the promotion path.
- **record** — the durable form of what happened: a finding, a change-log, a rule, a loop-design. The record is the loop's memory across sessions.
- **rule** — a promoted record that enforces an invariant. A rule is what a recurring agentic deferral becomes once it is encoded.
- **promotion** — the lift from "this agentic deferral happened once" to "this is now a deterministic rule." Promotion is how the deterministic surface grows.

The boundary between "writes during the step" and "records after the step" is decided by the *role*, not the mechanism: a deterministic-step writes records directly (its outcome is fixed); an agentic-step does not write during deferral (its outcome is recorded by the promotion step, not the deferral).

## Two surfaces

The loop has two named surfaces that must never share vocabulary.

1. **Concept surface** (this doc and `docs/philosophy.md`) — the loop's own theory. Vocabulary: *deterministic-step, agentic-step, record, rule, promotion*. Implementation-agnostic. A reader unfamiliar with any framework can understand the engine from this surface alone.
2. **Implementation surface** (`docs/runtime-contract.md`, `docs/architecture.md`) — the mechanism that realizes the roles today. Vocabulary: framework primitives, tools, paths, gate modules. Named, but subordinate: the concept role is primary; the mechanism is interchangeable.

The many-to-many mapping, stated abstractly:

| Concept role | Typical mechanism | Also realizable by |
|---|---|---|
| deterministic-step | a tool or a pure workflow step | a shell script; a gate rule; a regex |
| agentic-step | a framework agent primitive | an operator + runtime session; a workflow step that calls a model |
| record | an append to the registry | any durable write the loop owns |
| rule | a promoted finding, enforced by gate or agent | a consult-gate; a checklist |
| promotion | a finding → rule lift | a change-log that supersedes a finding |

The point: **the concept role is primary; the mechanism is interchangeable.** A framework agent primitive is *one way* to realize an agentic-step, not its definition. A workflow step can realize *either* a deterministic-step (pure functions) or an agentic-step (calls a model). The role decides the boundary; the class does not.

## The 4-kind registry union (as concept)

The record is a discriminated union of four kinds: **finding** (an observed gap or anti-pattern), **change-log** (an immutable record that a system change happened), **rule** (a promoted finding that enforces an invariant), and **loop-design** (a deferred design that has not shipped). The lifecycle, status models, and transition tools for these kinds live in `docs/meta-state-lifecycle.md`; this doc only names them as concept roles in the engine.

## The 13 escape-hatch items

These are the irreducible judgments that survive in the concept surface — the "why" the loop cannot proceduralize. Each is a compact pointer; the deep treatment lives in `docs/philosophy.md` and `docs/trajectory.md`.

1. **Escape-hatch gradient.** Anything an agent must open (a doc, a skill) to know what to do next is a *gap*, not a permanent dependency. The split between loop-encoded and escape-hatch tracks what the loop has internalized; the direction of travel is to move the escape hatch into the loop. The escape hatch is not wrong; it is temporary.
2. **Three-class dependency balance.** The loop internalizes the *contract* (full authority), cites the *internal implementation* (records that it happened, does not replace it), and reads the *external system* (consumer, not source). Confusing these classes produces a closed loop with no ground truth.
3. **Decisions are boundaries, not permissions.** A decision record is "yes, within these lines, and no outside them." The blocked actions are more important than the allowed actions; a decision without blocked actions is a wish.
4. **Dimensional verification.** Confidence is always partial and scoped. A thing can be proven to install and simultaneously unproven for production. Never conflate dimensions; each answers a distinct question.
5. **What stays human forever.** Meta-surface scope, irreversible operations, class-approval definitions, the meta-surface system itself, and philosophy. The operator remains the authority on what the loop is allowed to learn about itself — the most dangerous component to give full autonomy, because it decides what the rest of the loop learns.
6. **Adversarial mindset.** The loop assumes agents make mistakes and is designed to catch them. Records are challenged by newer records, by cleanup rules, by superseding decisions, and by drift queries. Treat the loop as a debate your work must survive, not an approval pipeline to pass through.
7. **Engine/instance inversion.** The engine (what generates the loop's own code) is provable against the meta-surface because the meta-surface is small, stable, and self-owned. Only the meta-surface is a bound instance; the product surface is unbound. This eliminates drift against a product instance by construction — there is no product instance to drift against. The meta-surface is the only bound surface.
8. **Skill-migration ordering rationale.** Skills are the same kind of escape hatch as docs. The migration sequence is smallest-first, lowest-risk-first: the citation-only skill → the citation-only artifact skill → the full execution skill. Each migration must preserve the markdown as the readable spec, make the artifact loop-citable at creation, and enforce the consult-gates the markdown was skipping. The order is non-trivial and load-bearing.
9. **Destination sentence.** *A self-referential learning loop with verification autonomy and a self-model that the loop maintains and that influences its own behavior.* The gradient moves knowledge from human-readable docs into machine-driven loop mechanics. The meta-surface is the terminus of that gradient.
10. **Trajectory is not contract.** The trajectory doc states the destination, not the route. Re-read the destination sentence every time the meta-surface grows; if the meta-surface has learned something the operator has not, the destination may need updating before the next plan.
11. **Storage parking rationale.** The storage layer is parked, not jumped to. The current approach gets most of the benefit at a fraction of the touch surface. Pre-conditions to un-park are size and latency thresholds, not dates; meeting them is a substrate rotation, not a redesign.
12. **Loss-function question.** Self-referential learning needs a stated target. Proposed composite: drift recovery rate (findings caught + resolved vs drifted) and findings-per-promoted-rule ratio (efficiency of the finding → rule → invariant pipeline). A loop with no stated loss function optimizes whatever is easiest to measure.
13. **Operator-capture guard.** When the operator's corrections shape what the loop learns and the loop's gates shape what the operator sees, they co-adapt; the meta-surface becomes a record of operator preferences, not system truths. A discovered-vs-acked annotation on change-logs would surface an operator-capture index. Not yet implemented; the schema decision is open.

## Open design questions (deferred to the next session)

These are named here so a reader knows the engine is unfinished. They are not solved in this doc.

1. **The change-log half of the recurrence→promotion bridge is unwired.** The bridge has two halves. The gate-decision half is wired: when a rule recurs on a command pattern within a window, a finding is emitted automatically. The change-log half is unwired: which agentic-deferral change-logs recur and are ready to promote is not detected mechanically, so promotion stays operator-triggered. Wiring a change-log recurrence query ("find agentic-deferral patterns that recur and are ready to promote") is the missing half that would let the deterministic surface grow without a human in the loop on every promotion.
2. **Agentic/deterministic provenance is absent from the registry data model.** A record does not today declare whether the step that produced it was a deterministic-step or an agentic-step. Adding provenance would make the boundary queryable and the loss-function measurable, but it is a schema change and is deferred.
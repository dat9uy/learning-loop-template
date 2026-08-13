---
name: concept-pressure
description: Evaluate proposals to add or promote L1 concepts, values, states, fields, or vocabulary by making their permanent cost and deterministic consumption explicit. Use when designing the learning loop, changing a glossary or schema, introducing an enum/state, promoting an implementation term into the concept surface, or deciding whether an I2 distinction should become I3-enforced.
---

# Concept Pressure

Use this skill before accepting a new concept-surface term or value. The goal is
not to freeze the vocabulary; it is to make the cost and the payoff visible so
the smallest vocabulary that preserves the invariant wins.

## 1. Ground the proposal

Read the repository's `CONTEXT.md` and inspect the implementation behind the
claim. For this project, use these as the primary orientation points:

- `docs/loop-engine.md` for the invariant, L1/L2/L3 gradient, and concept roles.
- `tools/learning-loop-mastra/core/README.md` for the FCIS and core-placement
  rules.
- The relevant schema, gate, status-derivation, routing, or tool code.

Use the glossary's term **Internalization Level** rather than inventing a
parallel state vocabulary: I1 is discoverable, I2 is delivered while judgment
remains agentic, and I3 is enforced deterministically at an action boundary.
Delivery is not enforcement.

State the proposal in one sentence:

> Add/promote **term or value** at **level** so that **behavior** changes for
> **consumer**.

If the behavior or consumer is missing, mark that as an unresolved design gap;
do not silently fill it with a new field.

## 2. Name the distinction and its pressure

Answer these questions with concrete code locations where possible:

1. What real invariant, role, or repeated decision does this term name?
2. Is it genuinely independent of the mechanism, or is it a runtime name,
   wire format, path, migration phase, or reporting convenience?
3. What existing term could be removed, narrowed, or reused instead?
4. What is the deletion test? If this term disappeared, which code and
   reasoning would disappear, and where would the complexity reappear?

Inventory the propagation cost before recommending acceptance. Count the
surfaces that must stay coherent: glossary and concept docs, contracts,
schemas and validators, status derivation, gates and routing, tools and CLI
surfaces, tests, migration/backfill, discoverability, and future agent
reasoning. Call out costs that are hypothetical separately from costs already
required by the current implementation.

The permanent-cost test is especially important for L1: every L1 term becomes
part of the loop's long-lived self-model and must survive mechanism changes.
Several implementations needing a common reporting label is evidence for an
L2/L3 mechanism term, not by itself evidence for a new L1 concept.

## 3. Apply deterministic-consumption pressure

For every proposed value, state the exact deterministic consumer. Use a table
with one row per value:

| Value | Deterministic consumer | Action boundary / branch | Test or evidence |
|---|---|---|---|

Accept an I3 claim only when the consumer is real and observable: a gate blocks
or allows differently, a status is derived differently, a tool routes
differently, or another deterministic action changes. Name the function or
module that branches. A schema enum, emitted hint, or agent-visible label is
not an I3 consumer by itself.

When no deterministic branch exists, choose one of these explicit outcomes:

- keep the distinction as prose or an I1/I2 record that the agent interprets;
- add a separate design item for the missing deterministic consumer; or
- remove/reject the proposed distinction and retain the smaller vocabulary.

Do not let I2 delivery masquerade as I3 enforcement. A hook or session-start
injection can guarantee presentation while the agent still decides what it
means; that is useful, but it is not a deterministic consumer.

## 4. Decide at the lowest durable level

Prefer the lowest level that carries the invariant:

- **L1 concept** — mechanism-independent role or invariant that would require
  re-debating the engine to rename.
- **L2 contract/mechanism** — stable participation or delivery rule whose
  implementation can change.
- **L3 implementation** — native runtime vocabulary, paths, hook names, wire
  shapes, temporary migration states, or operational diagnostics.

Keep native runtime terms private to their adapters. For example, a runtime's
`SessionStart` hook, conformance result, wiring check, activation check, or
adapter profile can be useful L3 language without becoming L1 vocabulary.
Promote a term only if the invariant survives replacing that mechanism.

## 5. Report the decision

Return a compact decision record containing:

1. **Proposal** — the exact term/value and claimed level.
2. **Invariant** — the behavior it protects or makes possible.
3. **Cost** — the propagation surfaces and maintenance burden.
4. **Consumer pressure** — one deterministic consumer per value, or an explicit
   absence and its consequence.
5. **Level decision** — accept at L1, keep it at L2/L3, keep it as I1/I2 prose,
   defer pending a consumer, or reject.
6. **Follow-up** — only the code, schema, documentation, or tests needed by
   the decision.

Do not impose a blanket ban on new concepts. Accept a new L1 term when the
invariant is real, mechanism-independent, the cost is understood, and every
value that claims deterministic meaning has a named deterministic consumer.
Completion means the cost inventory, deletion test, per-value consumer table,
and level decision are all explicit.

## Motivating example

In the runtime-topology design, **Runtime Topology**, **Initial Delivery
Point**, and the I2 delivery obligation survived because they express
mechanism-independent relationships. `SessionStart`, conformance, wiring
status, activation status, and adapter profiles remained implementation
vocabulary: they describe how a runtime realizes the relationship, not new
engine roles. Use that reasoning pattern; do not copy the example's domain
terms into unrelated designs.

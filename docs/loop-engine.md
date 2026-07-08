<!-- level: L1 | surface: concept -->

# The Loop Engine

The learning loop is an engine. Its memory is the record. Its telos is to grow the deterministic surface and shrink the agentic one. This document names the engine's invariant, its concept vocabulary, and the two surfaces that must never share vocabulary. It is implementation-agnostic: it names roles, not mechanisms. The mechanism that realizes each role today lives in `docs/architecture.md`; the contract a runtime must satisfy to participate lives in `docs/runtime-contract.md`.

## A finding is a deferred decision, not a thing to be removed

A finding is the loop's way of deferring a decision the engine cannot yet make. It is not "something bad to be cleaned up." Every finding has explicit exits, and the loop is wrong if it silently closes one. The exits, named in role form:

- **promote** — the gap recurs; the loop lifts it to a rule (the deterministic surface grows). The role that runs the gate does not change; the rule itself replaces the finding as the source of authority.
- **resolve** — the underlying issue is gone (fixed, no longer relevant, or no longer the loop's job). The finding is closed with a recorded reason.
- **re-verify** — the underlying issue is still relevant, but the finding's grounding drifted; the loop re-checks the evidence and resumes the deferral (typically followed by promote, resolve, or a sustained deferral).
- **supersede** — the finding consolidates into a change-log (a record of a system change has absorbed the gap). Lineage preserved via the change-log's consolidates record.
- **dispatch** — the finding is routed to a parallel-fix work unit via an external issue-tracker substrate. The finding stays in its current state while work happens; it resolves when the fix ships. **Dispatch is a non-terminal routing action, not a terminal status.**

No mechanism silently closes a finding. Every exit is an explicit decision recorded against the entry (the recorded reason, the consolidating change-log, etc.). "Stale" is a re-verifiability hint, not a close.

## The invariant

Every cognitive step the loop takes is either:

- **deterministic** — rule-enforced, registry-driven, no judgment deferred to a model; or
- **agentic** — deferred to a model or an operator+runtime session because it cannot yet be encoded.

The loop's telos: **grow the deterministic surface; shrink the agentic surface.** The intended cycle is one:

> agentic deferral → recorded as a finding or change-log → promoted to a rule when it recurs → becomes deterministic.

"Learning" = the deterministic surface grows. Everything else (which primitive ran the step, whether the operator or an agent did it) is mechanism.

**Status of the cycle (state this inline, not in a footnote):** the cycle is half-wired. The record step and the promotion step exist today. Recurrence detection over **gate decisions** is wired — when a rule recurs on the same command pattern within a window, a finding is recorded automatically. The unwired half is recurrence detection over **agentic-deferral change-logs**: which deferrals recur and are ready to promote is not yet detected mechanically, so promotion stays operator-triggered. A human decides when to promote. Closing the change-log half is the open design question at the end of this doc, not a solved part of the invariant.

## Concept vocabulary

These are ROLES in the engine, not mechanisms. They use lowercase common nouns; the framework class names that realize them are an implementation concern (L3).

- **deterministic-step** — a step whose outcome is fixed by a rule or registry state. Anyone may run it; the outcome does not depend on judgment.
- **agentic-step** — a step deferred to a model or an operator+runtime session because it cannot yet be encoded. The step itself is not recorded during deferral; only its *outcome* is recorded, via the promotion path.
- **record** — the durable form of what happened: a finding, a change-log, a rule, a loop-design. The record is the loop's memory across sessions, and three stores realize it: `meta-state.jsonl` holds the four kinds (findings, change-logs, rules, loop-designs) — the loop's self-model; `runtime-state.jsonl` holds mutable runtime state (budgets, counters, ledger events) — the loop's short-term memory; `file-index.jsonl` holds the path-keyed evidence fingerprints that ground mechanism-check findings — the loop's contact with the filesystem. The concept surface names these as the realization of the memory role; how each store is read, written, and kept consistent is implementation-surface detail in `docs/architecture.md`, and the contract a runtime must satisfy to participate is in `docs/runtime-contract.md`. See § The change-log trigger (Rec 12) for when an action becomes a change-log.
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

1. **Escape-hatch gradient.** Anything an agent must open (a doc, a skill) to know what to do next is a *gap*, not a permanent dependency. The split between loop-encoded and escape-hatch tracks what the loop has internalized; the direction of travel is to move the escape hatch into the loop. The escape hatch is not wrong; it is temporary. The gradient's subject is *instruction injection* — how an instruction reaches the runtime — not the file format of the artifact that carries it.
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

## The change-log trigger (Rec 12)

An action becomes a change-log when it changes a bound artifact (a concept- or implementation-surface doc, a runtime contract, a registry schema, a tool manifest, a tracker lifecycle, or `tools/**` / `core/**` source) or a rule/policy. Not for in-session scratch, plan drafts, or reversible edits inside a not-yet-shipped plan.

Skills are the first bound artifact with the gate wired: a skill file is a bound artifact (per the L2 contract: `tools/learning-loop-mastra/interface/CONTRACT.md` Req #3). Editing a skill triggers a change-log entry; the change-log is a record write (MCP tool, already logged in `meta-state.jsonl`), not a bound-artifact edit. **The recursion is bounded: bound-artifact edits emit change-logs, change-logs are records, records are not bound artifacts → the recursion is bounded.** This is the intended invariant — true on disk now that the phase-5 skills write-gate makes skill files bound artifacts.

**Symmetry (Q11):** there is no operator exemption (escape-hatch #13 — the operator-capture guard). Operator edits and agent edits are recorded symmetrically. Authority governs *which actions may run*; the trigger governs *which are recorded* — orthogonal. `meta_state_log_change` is trigger-gated, not authority-gated (open in both `live` and `autonomous` session modes).

**Honest framing:** the change-log step is operator-triggered today. Auto-detecting a bound-artifact edit that did not emit a change-log (the gap detector) is deferred to Plan 4 (`rec12-closed-loop`: (b) change-log gap detection + (c) session-start gap injection). Until that lands, the invariant holds when the operator follows the gated authoring path; a violation produces a record drift, not a hard failure.

**Closed loop and downstream enforcement:** the gap detector + session-start surfacing close the named un-block for the deferred SessionEnd/pre-commit hook. The detection surface is the set of bound-artifact prefixes whose edits should trigger a change-log (`CHANGE_LOG_BOUND_PATHS`); the surfacing reads the branch's touched paths via read-only `git` and joins them against change-log coverage derived from each entry's `change_target` + `applies_to.schemas` (canonicalized to absorb `#anchor` suffixes, the `learning-loop-mcp` → `learning-loop-mastra` rename, and bare loop-internal schemas). The result lands in `.claude/session-context.json` as `change_log_gap_hints` so the operator/agent sees "N bound edits on this branch have no change-log" and can backfill via `meta_state_log_change`.

The surfacing is advisory, not a gate — it cannot block edits or writes. Coarse prefix-descendant matching over-covers by design (a single `"docs/"` log silences all docs gaps); for an advisory signal, false-negative-safe beats noisy false positives. The detector intentionally leaves no persisted state; it derives the gap set per session and surfaces it. Recurrence ownership lives with the deferred SessionEnd/pre-commit hook, not here — that hook re-runs the detection at session end and keeps a per-(branch, path) gap counter so a *recurring* gap (drift rate above threshold) can be promoted into enforcement. The closed loop closes at the hook; this plan ships the detection the hook will call.

## Authoring loop-maintained skills

The maintainer standard for any loop-maintained skill (a skill mirrored across `.claude`/`.factory`/`.mastracode` and declaring `maturity:` frontmatter):

1. **Maturity levels** (per `docs/philosophy.md` — injection × consumption axes):
   - `state-1` — escape-hatch: session-scoped markdown, no deterministic injection.
   - `state-2` — wired: deterministic injection (SessionStart discovery / contract) + agenticly consumed. The current target for `learning-loop` and `coordination-gate`.
   - `state-3` — encoded: deterministic injection + deterministic consumption, realized by the `deterministic-step` role.
2. **Mirror requirement** — skills mirror across `.claude`/`.factory`/`.mastracode` via `writeToAllSkills` (phase 4 fan-out in `core/surfaces.js`). The byte-identity invariant is asserted by `legacy-mcp/skills-mirror-parity.test.js`; a single-surface placement fails the contract with `skill-mirror-gap`.
3. **Frontmatter discipline** — `maturity:` (state-1/2/3) is hard-required by `CONTRACT.md` Req #3. Per-skill frontmatter parse is error-isolated (one bad skill yields a per-skill fail, does not abort the validator); size cap is 64KB (billion-laughs guard).
4. **Gated authoring path** — direct writes to `<surface>/skills/**` are blocked by the phase-5 write-gate (`evaluateWriteGate` skills rule). To edit a skill:
   1. `gate_mark_preflight(surface: "skills")` — unlocks the dedicated `.loop-preflight-skills` marker (30-minute TTL).
   2. Write to the skill (Edit each mirror via `writeToAllSkills` for byte-identity, OR `Edit` per mirror if the change is a manual fix).
   3. `meta_state_log_change` — record the system change (the change-log half of self-maintenance).
5. **Tool-ref check** — `learning-loop` MUST reference `loop_describe` AND `meta_state_list` (it documents the loop's tool surface). Other loop-maintained skills are not required to reference those tools.
6. **External symlinks excluded** — `.claude/skills/mastra` (and any future external symlink) is out of the contract + write-gate's scope (not loop-maintained).

## Open design questions (deferred to the next session)

These are named here so a reader knows the engine is unfinished. They are not solved in this doc.

1. **The change-log half of the recurrence→promotion bridge is unwired.** The bridge has two halves. The gate-decision half is wired: when a rule recurs on a command pattern within a window, a finding is emitted automatically. The change-log half is unwired: which agentic-deferral change-logs recur and are ready to promote is not detected mechanically, so promotion stays operator-triggered. Wiring a change-log recurrence query ("find agentic-deferral patterns that recur and are ready to promote") is the missing half that would let the deterministic surface grow without a human in the loop on every promotion.
2. **Agentic/deterministic provenance is absent from the registry data model.** A record does not today declare whether the step that produced it was a deterministic-step or an agentic-step. Adding provenance would make the boundary queryable and the loss-function measurable, but it is a schema change and is deferred.
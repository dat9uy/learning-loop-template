# Direction Clarification: The Loop Engine (deterministic ↔ agentic)

**Type:** problem-solving / direction-clarification (problem-driven, pre-solution)
**Date:** 2026-07-03
**Status:** proposed direction — for operator review before any doc/contract change
**Trigger:** operator reframe of the predict report's unresolved questions. Core claim: the predict report was solution-first ("sequence Phase G"); the real blocker is that the loop's concept vocabulary is unnamed, so it collides with Mastra's implementation vocabulary.

---

## The diagnosed problem (Meta-Pattern Recognition + Inversion)

**Meta-pattern:** the same conflation — *concept-word overloaded by implementation-word* — recurs in 3+ domains:

| Word | Concept meaning (the loop's theory) | Implementation meaning (Mastra) | Named anywhere? |
|---|---|---|---|
| agent | an **agentic step** = defer to LLM when undeterministic | `Agent` JS/TS class (model + instructions, composable) | **no** |
| workflow | a **deterministic step sequence** that enforces a core rule | `Workflow` class (state machine, stateSchema) | **no** |
| memory | **the record is the memory** (`philosophy.md:7`) | `Memory` / `Storage` config on an Agent | **no** |
| tool | a deterministic capability exposed to an agent | `createTool({ inputSchema, execute })` | **no** |

`grep "agentic\|deterministic"` across `docs/philosophy.md`, `docs/trajectory.md`, `AGENTS.md` returns **zero hits**. The concept layer is real (the operator reasons in it) but undocumented, so every shared word resolves to its Mastra meaning. That collision *is* the bloat — not layering (layering is clean), but vocabulary.

**Inversion:** flip "Phase G (migrate `ck:cook`) is the next step" → "what if the loop already does agentic self-development, just un-recorded?" The inverse is true: every operator+`ck:cook` session that builds the loop *is* agentic self-development; it's merely uncited/external. So the missing piece is not a mechanism (`loop_cook`) but a **concept** (self-development-as-agentic-step) plus the recording that makes it promotable. "Phase G is the keystone" is true only if the mechanism is the bottleneck; if the concept is the bottleneck (operator's claim), Phase G is premature optimization of the wrong layer.

---

## The clarified direction (one invariant, two named surfaces)

The learning-loop is an engine with **one invariant** and **two named surfaces** that must never share vocabulary.

### The invariant (the engine)

Every cognitive step is either:
- **deterministic** — rule-enforced, registry-driven, no LLM; or
- **agentic** — deferred to the LLM/runtime because it can't (yet) be encoded.

The loop's telos: **grow the deterministic surface; shrink the agentic surface.** The mechanism is a single cycle:

> **agentic deferral → recorded as a finding/change-log → promoted to a rule when it recurs → becomes deterministic**

That is the only loop. "Learning" = the deterministic surface grows. Everything else (which Mastra primitive ran the step, whether the operator or an Agent class did it) is mechanism.

### Two named surfaces

1. **Concept surface (the loop's own theory)** — implementation-agnostic. Vocabulary: *deterministic-step, agentic-step, record, rule, promotion*. These are ROLES in the engine. Lives in `docs/philosophy.md` + `AGENTS.md §1` (currently unnamed — this is the gap).
2. **Implementation surface (Mastra primitives)** — realizes the roles. Vocabulary: *Agent class, Workflow class, Tool, Memory, Storage*. These are MECHANISMS. Lives in `tools/learning-loop-mastra/mastra/`.

### The mapping (many-to-many, documented once)

| Concept role | Typical Mastra mechanism | Also realizable by |
|---|---|---|
| deterministic-step | Tool / pure Workflow | a bash script; a gate rule; a regex |
| agentic-step | Agent class | an operator + Claude-Code session (**this session**); a Workflow step that calls an LLM |
| record | `meta_state_*` tools → JSONL | any append to the registry |
| rule | `rule` kind, enforced by gate/agent | a consult-gate; a checklist |
| promotion | `meta_state_promote_rule` | a change-log superseding a finding |

The point: **the concept role is primary; the mechanism is interchangeable.** "Agent class" is *one way* to realize "agentic-step," not its definition. "Workflow class" can realize *either* a deterministic-step (pure functions) or an agentic-step (calls LLM) — so "workflow writes to registry" was always the wrong question; the concept role decides the boundary, not the class.

---

## The three questions, reframed in this vocabulary

### Q1 — workflow→registry write boundary → DISSOLVES
The real question was never "should the Workflow class write?" It is: "which steps are *records* (deterministic — anyone writes via the tool) vs which are *agentic deferrals* (the LLM decides; only the OUTCOME is recorded, via the promotion path)?" 
- A **deterministic-step** (Workflow class or otherwise) writes records directly — it's deterministic, the outcome is fixed.
- An **agentic-step** (Agent class, operator session, or LLM-calling Workflow) does NOT write during deferral; its outcome is recorded by the *promotion* step, not the deferral.
- **Boundary = the concept role, not the mechanism.** Mechanism (Workflow vs Agent) is irrelevant.

### Q2 — optimize the changelog for agents to learn → DERIVED, not standalone
The changelog (`meta_state_log_change` entries) is the **promotion substrate**: where "this agentic deferral happened, here's what was learned" lives until it's promoted to a rule. "Optimize the changelog for learning" = structure each entry so the promotion query can find "did this recur? is it ready to become a rule?" That's a *derived* requirement from the engine invariant, not a separate technical optimization. **Define the promotion query first** ("find recurring agentic-deferral patterns ready to promote"); the changelog schema then serves it. Doing it the other way (optimize changelog, then ask what for) is solution-first.

### Q3 — internalize agentic self-development → CONCEPT before MECHANISM
Self-development is just *another agentic-step* — the loop developing itself is the same in KIND as the loop doing any agentic task. To internalize:
1. Treat self-development as a **recorded agentic-step** with a promotion path (reusable development patterns → deterministic build rules/templates).
2. The mechanism (`ck:cook`, `loop_cook`, operator + Claude) is interchangeable and secondary.

Phase G ("migrate `ck:cook` → `loop_cook`") is **one candidate mechanism**, to be evaluated *after* the concept is defined — not a keystone. This is why the operator does this before Phase G: Phase G is solution-focused ("migrate this skill"); the problem-driven move is "define what loop-owned agentic self-development means as a concept," then pick the cheapest mechanism.

---

## What this changes (vs. the predict report)

| Predict report said | Reframe |
|---|---|
| "Phase G is the keystone; sequence it after hardening." | Phase G is one candidate mechanism for Q3, evaluated after the concept is named. Not a keystone. |
| "Should workflows write to the registry?" (open question) | Dissolves: deterministic-steps write; agentic-steps record outcomes via promotion. Role-bound, not mechanism-bound. |
| "Optimize the changelog" (separate technical task) | Derived from the promotion query; not standalone. |
| Direction = "systematize memory + runtime-agnostic workflows." | Direction = **the agentic→record→promote→deterministic engine**, realized on runtime-agnostic substrate. Memory systematization and agentic workflows are *consequences* of the engine, not the definition. |

---

## Recommended next moves (problem-driven, not solution-first)

1. **Name the concept surface in `docs/`.** Add a short "The Loop Engine" section to `docs/philosophy.md` (or a new `docs/loop-engine.md`) that names deterministic-step / agentic-step / record / rule / promotion as the concept vocabulary, and states the one invariant. This is the root-cause fix for the bloat — a doc change, not a refactor. ~1h.
2. **Disambiguate the overloaded words once.** In `AGENTS.md §1` and `docs/philosophy.md`, the first use of "agent"/"workflow"/"memory" gets a one-line "(concept: …; implementation: …)" parenthetical. Many-to-many mapping table above is the template.
3. **Then, and only then, revisit Q1/Q2/Q3** as concept questions:
   - Q1: write the deterministic vs agentic boundary as a contract note (concept layer), then map to mechanisms.
   - Q2: specify the promotion query; derive the changelog schema from it.
   - Q3: define "loop-owned agentic self-development" as a concept; evaluate `ck:cook`→`loop_cook` as one mechanism against it.
4. **The cleanup (legacy rename + stale docs) and Plan 5-Lite hardening remain valid and independent** — they're substrate hygiene, not direction. They can proceed in parallel with the direction clarification. They do NOT depend on Phase G or the concept being named.

---

## Unresolved questions

1. Where does the concept surface live canonically — a new `docs/loop-engine.md`, or folded into `docs/philosophy.md`? (philosophy already owns "the why"; the engine invariant is arguably philosophy-adjacent.)
2. Does naming "agentic-step" change the `interface/CONTRACT.md` runtime contract? The contract today binds runtimes to the meta-surface; if the concept surface is primary, the contract may need to reference concept roles, not just MCP tools.
3. Is "promotion" already partially implemented via `meta_state_promote_rule` (finding→rule)? If yes, the engine cycle is half-built already — Q2 (changelog) is the missing half (the recurrence-detection query that triggers promotion). Confirm before designing.
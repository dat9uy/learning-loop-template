# Philosophy of the Learning Loop

This document explains why the loop exists and how to reason with it. Read this before the operator guide. The operator guide tells you what to do; this document tells you how to think.

## Core Premise

Agents have no persistent memory across sessions. Each agent starts fresh. It does not know what the last agent proved, what failed, what was decided, or what remains uncertain. The loop exists because **the record is the memory**.

Without the loop, every session repeats the same discoveries, re-runs the same experiments, and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge.

### Docs Are the Escape Hatch

`docs/` is outside the loop. If an agent must open a doc to know what to do next, that knowledge is a **gap** — it belongs in records, observations, index entries, or MCP tools, not in a human-readable file.

This document exists for irreducible judgment: the "why" behind loop design, not the "what" of loop operation. Procedural knowledge (naming conventions, intake steps, approval protocols, experiment formats) belongs in encoded artifacts. Philosophy belongs here. When you find yourself writing "Step 1, do X; Step 2, do Y" in a doc, stop. That is a loop gap. Encode it.

### The Escape Hatch Has a Trajectory

The escape-hatch rule is not static. It is a gradient.

**Today:** Some things are loop-encoded (the meta-surface, observations, the gate, the consult-rules, the workflow tools). Some things are still escape hatches (the operator guide, this philosophy doc, the skill markdown). The split is not arbitrary; it tracks what the loop has internalized and what it has not.

**The direction of travel:** as the meta-surface productizes, more things move from `docs/` into the loop. The agent stops reading the operator guide mid-task because the consult-gate surfaces the relevant rule. The agent stops asking the operator about device-slot state because the observation is cited at the right time. The agent stops reading the philosophy doc to remember "decisions are boundaries" because the `decision_effect.*` fields enforce it mechanically.

**What this means for the agent:** treat every `docs/` read as a candidate gap-fill. If the same doc gets read by 3 different agents in 3 different sessions, the answer probably belongs in the loop. File a finding. Promote to a rule when the pattern recurs.

**What this means for the operator:** expect to *rewrite* docs as the loop absorbs their content. The doc that survives the rewrite is the doc that captures irreducible judgment — the "why" the loop cannot proceduralize. Everything else moves.

### Skills Are the Same Kind of Escape Hatch

`docs/` is not the only escape hatch. **The `ck:*` skill family is the same shape, in a different filename.** Skill markdown is human-readable, session-loaded, not recorded in the meta-surface as authoritative, and consumed by the agent to know how to execute.

The skill escape-hatch rule is the same as the doc escape-hatch rule: **anything an agent must open to know what to do next is a gap**. The escape hatch is not wrong; it is *temporary*. The trajectory is to internalize the skill into the loop as an MCP tool. The skill markdown becomes the readable spec; the MCP tool becomes the authoritative executor.

See "Pillar 4 — Skill Authority vs. Loop Authority" below for the dependency-balance convention and the post-productization migration plan.

## Four Philosophical Pillars

### 1. Verification Is Dimensional, Not Binary

A thing can be proven to install and simultaneously unproven for production. Confidence is always partial and scoped.

| Dimension | What it means | What it does NOT mean |
|---|---|---|
| `static` | "The symbol exists and the docs say it should work." | "It will work in production." |
| `install` | "It installs cleanly in a sandbox." | "It will install on the operator's machine." |
| `runtime` | "It runs and returns expected output." | "It is safe to deploy." |
| `product` | "An approved decision says we may build on this." | "All risks are eliminated." |

Never conflate dimensions. Runtime proof approves nothing about deployment. Product approval does not erase risks. Each dimension answers a distinct question.

### 2. Decisions Are Boundaries, Not Permissions

A decision record is not "yes, do this." It is "yes, within these lines, and no outside them." The blocked actions are philosophically more important than the allowed actions.

A decision without blocked actions is a wish, not a decision. It gives the next agent no signal about what was considered and rejected.

When you write a decision, you are drawing a fence. The fence keeps future agents from wandering into territory that was already explored and found unsafe.

### 3. Evidence Is Source, Not Proof

Evidence files are raw material. They do not self-certify. A disproven evidence file can sit on disk forever and mislead the next agent who browses it standalone.

Truth status lives in the machine-extracted index, not in evidence. An index entry is an atomic assertion derived from evidence `## Findings`; it carries dimension, scope, and status. Evidence is referenced by index entries; index entries are never inferred from evidence directly.

Always read the index first. Evidence second. Never the other way around. The index is the single top-level artifact for state queries. Internalize by pointing at the code, not by quoting the markdown. A code-pointed finding with `mechanism_check: true` is durable; a markdown citation is the escape hatch.

### 4. Skill Authority vs. Loop Authority

The loop owns what survives across sessions. Skills own what happens in a single session. The two are not equivalent.

A skill can execute, scaffold, test, or review — all of which are useful, none of which are loop-citable by default. The loop's self-model (`meta-state.jsonl`) records the *result* of the work (a `finding`, a `change-log`) and the *commitment* the result implies (a `rule` or `change-log`). The skill is what *happened*; the loop is what *lasts*.

**The dependency-balance convention (operator-confirmed, 2026-06-12):**

| Concern | Authority | Why |
|---|---|---|
| **Plan-file authoring** (the pre-mortem) | The loop | The plan file is the contract. `ck:plan` is one way to write it; the resulting `change-log` entry with `change_target: 'plans/.../plan.md'` is what makes it loop-citable. The skill is a helper, not the authority. |
| **Code execution mechanics** (scaffolding, cooking, testing, review) | The skill | These are skill-shaped: session-scoped, execution-focused. The rule: every skill invocation must be cited in the resulting `finding` or `change-log` entry's `evidence_journal`. A skill run the loop does not know about is a bypass waiting to happen. |
| **The contract itself** (the rule, the decision boundary, the consult-gate pattern) | The loop, no exceptions | The meta-surface is the only authoritative source. Skills may *apply* the contract; they do not *define* it. |

**The single most important sentence:** *Skills execute; the loop records; the meta-surface is the only thing that survives.* The plan-file convention is what makes that sentence *operational* — it is the artifact where operator intent meets agent execution without either one bypassing the loop.

**Long-term direction:** the loop will *own* the `ck:plan`, `ck:cook`, and `ck:journal` skills as MCP tools. The migration sequence is smallest-first, lowest-risk-first: `ck:plan` (citation-only contract) → `ck:journal` (citation-only artifact) → `ck:cook` (full execution mechanics). The order is non-trivial: each migration must (a) preserve the markdown skill as the readable spec, (b) make the resulting artifact loop-citable at creation time, and (c) enforce the consult-gates the markdown skill was skipping. See `docs/trajectory.md` for the migration track; see `plans/reports/brainstorm-260612-1610-phase-a-product-surface-re-debate.md` §11 for the consensus that produced this pillar.

## State Machine and Observations

Index entries, experiments, and decisions answer "what do we know?" Observations answer "what is the current state?" Both are necessary. Knowledge without state is blind. State without knowledge is meaningless.

### Observations Are the Authoritative Source for External Facts

An observation record captures a mutable fact about an external system: a device slot is consumed, a budget is exhausted, a cleanup succeeded, a vendor gate is open.

Before asking the operator about external system state, check observations. The operator is the final authority, but the loop should do the work of remembering. If an observation says the budget is exhausted, do not burn cycles on workarounds. Report the constraint and stop.

### Resource Budgets Are Hard Gates

External systems with irreversible operations carry a resource budget. The budget tracks what was consumed, what remains, and when it was last verified.

A budget check failure is a full stop, not a warning. Do not fix-and-retry. Do not bypass. The budget is the operator's explicit signal that a resource limit has been reached. Any attempt to work around it is a violation of the loop's governance contract.

**Budget enforcement is the agent's responsibility, not the gate's.** The gate checks whether an observation exists for the constraint (meta-level: "has someone recorded this constraint?"). The agent checks whether the budget is exhausted and whether the context is safe (domain-level: "do we have budget left for this specific operation?"). See `docs/observation-vs-meta-state.md` for the full separation.

### Cleanup Is Part of Proof

A runtime experiment is not complete when the code runs. It is complete when the temporary environment is destroyed and the observation confirms it.

Failed cleanup invalidates the experiment outcome. If the temp directory still exists, the experiment is `blocked` or `failed`, not `supports`. This is not housekeeping. It is a state-machine rule: the experiment cannot transition to verified until cleanup transitions to succeeded.

### Agents Do Not Mutate State

Agents read observations and budgets. They do not write them. Only the operator mutates state records.

This separation is deliberate. An agent that could update its own budget would have no external constraint. The operator is the sole source of truth for mutable system state.

### Observations Control the Gates

Observations are no longer only remembered facts. They are permission signals.

The constraint enforcement layer — write gate, bash gate — reads active observations to make allow or block decisions. A `write-path` observation with `constraint: records-evidence` unblocks `Write` calls to `records/evidence/**`. A `sudo` observation unblocks `sudo` commands in `Bash`. No observation, no action.

This makes the loop self-referential. The loop's state machine (observations) controls the loop's execution gates. Operator approval is not a conversational nicety. It is a mechanical state transition: approval is recorded as an observation, the observation is read by the gate, the gate permits the action.

The MCP server is the interface between operator intent and gate state. The operator says yes; the agent calls `record_observation`; the MCP server writes YAML to `records/observations/`; the gate reads that YAML on the next tool call. The conversation is ephemeral. The observation is durable. The gate is stateless and reads fresh state every time.

Conversational approval without an observation is a false promise. The gate cannot see the conversation. Only the observation matters.

## Governance Model: Two Tiers

The learning loop is a governance layer for external boundaries. It is not a general decision-making system for all code changes.

| Tier | What it governs | Workflow |
|---|---|---|
| **External boundary** | Vendor APIs, device slots, resource budgets, output policies, install/runtime contracts, production deployment | Learning loop: observations gate the agent; the agent checks budget + fingerprint + context; meta-state records the reasoning. Plan files bound the pre-mortem. |
| **Internal implementation** | Refactoring, module extraction, naming, structure, patterns within approved boundaries | ck:* skills: plan → cook → review, **with the rule that skill invocations are cited in the resulting `finding` or `change-log`.** |

A refactor that touches no external system does not need a decision record. A vendor API change always does. The question is never "is this big enough?" The question is "does this touch an external boundary?"

The two tiers are not the same kind of authority. The external-boundary tier is the loop's primary job: it produces records that constrain the next agent's behavior. The internal-implementation tier is execution support: the skill gets the work done, the loop records that it happened. When the skill's work touches the external-boundary tier, the skill execution must surface as a meta-state event (a `finding` if the work changed the loop's behavior; a `change-log` if the work changed the loop's machinery).

## How to Reason With the Loop

### Start With What You Do Not Know

Before planning, list uncertainties. Convert each uncertainty into an index entry candidate (what you believe) and a risk (what could go wrong). The loop is not about proving you are right. It is about making your uncertainty explicit so it can be addressed or bounded.

### Prove Before Building

A runtime probe proves a library returns usable data. An experiment proves a hypothesis. A decision approves a scope. Product code comes last, never first.

If you find yourself writing product code before an assertion is indexed and verified, stop. You are building on unproven ground.

### Preserve Negative Knowledge

When something fails, record it. A failed experiment is as valuable as a successful one. It prevents the next agent from retrying the same dead path.

Do not delete failed evidence. Supersede it with a link. The link is the signal that the failure was considered and overcome.

### Ask the Loop, Not the Operator

Before asking the operator about external system state, check observation records. Observations are the authoritative source for device slots, budgets, registration status, and rate limits.

Before asking the operator about prior decisions, check the meta-state registry. The rule is the contract. The finding is the result. The plan file is the pre-mortem. Cite the code, not the markdown.

The operator is the final authority, but the loop should do the work of remembering. Only escalate when the record is silent or stale.

### Cite the Loop, Not the Skill

When you need to invoke a `ck:*` skill, know *why* you need it. The skill is the mechanism. The loop is the reason. After the skill runs, the resulting work product (a plan file, a code change, a journal entry) must be cited in the loop — either as a `change-log` entry with `change_target` pointing at the file, or as a `finding` with `evidence_journal` pointing at the file. A skill invocation that the loop does not know about is invisible to the next agent.

## The Adversarial Mindset

The loop assumes agents make mistakes. It is designed to catch them.

- **Index entries are challenged** by newer evidence (and the experiments that produce it).
- **Experiments are challenged** by cleanup rules (a failed cleanup invalidates the result).
- **Decisions are challenged** by superseding decisions.
- **Evidence is challenged** by newer evidence.
- **Findings are challenged** by `meta_state_derive_status` (is this still true?) and `meta_state_check_grounding` (does the code match the fingerprint?).
- **Rules are challenged** by `meta_state_query_drift` (aggregate drift across the registry).

Do not treat the loop as an approval pipeline to pass through. Treat it as a debate where your work must survive scrutiny. Write records as if a skeptical agent will read them next week and decide whether to trust your conclusion.

## What the Loop Is Not

- **It is not a checklist.** Checklists are memory aids for people who already understand. The loop is a reasoning framework for agents who do not. Checklists that agents must read from docs are loop gaps.
- **It is not a bureaucracy.** Records are lightweight. A single experiment with clear hypothesis and result is enough. Verbose ceremony adds no confidence.
- **It is not a guarantee.** A verified claim can still fail in production. The loop raises confidence; it does not eliminate risk.
- **It is not a substitute for judgment.** The operator decides what risks to accept. The loop informs the decision; it does not make it. Judgment lives in docs; procedure lives in the loop.
- **It is not the only source of authority.** The skill family (and the agent's own reasoning) are useful. The loop does not replace them. The loop records what they do and constrains what they may do; it does not pretend they do not exist.

## Summary

The learning loop exists because agents forget. It works by making knowledge durable, confidence dimensional, decisions bounded, and skills accountable. Use it to know what you know, know what you do not, and prevent the next agent from rediscovering your mistakes.

The trajectory of the loop is to internalize what is internalizable — first procedural knowledge (rules, observations, consult-gates), then plan mechanics, then skill mechanics — while leaving irreducible judgment in the docs. The docs that survive the rewrite are the docs that capture the "why" the loop cannot proceduralize. Everything else moves.

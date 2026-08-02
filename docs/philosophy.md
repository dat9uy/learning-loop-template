# Philosophy of the Learning Loop

This document explains why the loop exists and how to reason with it. Read this before the operator guide. The operator guide tells you what to do; this document tells you how to think.

## Core Premise

Agents have no persistent memory across sessions. Each agent starts fresh. It does not know what the last agent proved, what failed, what was decided, or what remains uncertain. The loop exists because **the record is the memory**.

Without the loop, every session repeats the same discoveries, re-runs the same probes, and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge.

### Docs Are the Escape Hatch

`docs/` is outside the loop. If an agent must open a doc to know what to do next, that knowledge is a **gap** — it belongs in findings, change-logs, rules, runtime-state rows, or deterministic steps, not in a human-readable file.

This document exists for irreducible judgment: the "why" behind loop design, not the "what" of loop operation. Procedural knowledge (naming conventions, intake steps, approval protocols, finding formats) belongs in encoded artifacts. Philosophy belongs here. When you find yourself writing "Step 1, do X; Step 2, do Y" in a doc, stop. That is a loop gap. Encode it.

### The Escape Hatch Has a Trajectory

The escape-hatch rule is not static. It is a gradient.

**Today:** Some things are loop-encoded (the meta-surface, runtime-state, the gates, the consult-rules, the workflow tools). Some things are still escape hatches (the operator guide, this philosophy doc, the skill markdown). The split is not arbitrary; it tracks what the loop has internalized and what it has not.

**The direction of travel:** as the meta-surface productizes, more things move from `docs/` into the loop. The agent stops reading the operator guide mid-task because the consult-gate surfaces the relevant rule. The agent stops asking the operator about device-slot state because the runtime-state row is cited at the right time. The agent stops reading the philosophy doc to remember "rules are boundaries" because a promoted rule or gate enforces it mechanically.

**What this means for the agent:** treat every `docs/` read as a candidate gap-fill. If the same doc gets read by 3 different agents in 3 different sessions, the answer probably belongs in the loop. File a finding. Promote to a rule when the pattern recurs.

**What this means for the operator:** expect to *rewrite* docs as the loop absorbs their content. The doc that survives the rewrite is the doc that captures irreducible judgment — the "why" the loop cannot proceduralize. Everything else moves.

### Skills Are the Same Kind of Escape Hatch

`docs/` is not the only escape hatch. **The `ck:*` skill family is the same shape, in a different filename.** A skill markdown and a doc are both *agentic-injection artifacts* when unwired: the model opens them ad hoc, reads the prose, and decides what to do.

The escape-hatch rule is the same in both cases: **anything an agent must open to know what to do next is a gap** — an instruction reached by *agentic injection*, with no deterministic wiring to surface it at the right moment. The escape hatch is not wrong; it is *temporary*. And it is a *state*, not a file format: a `.md` is an escape hatch only while it is reached agenticly.

The trajectory is to move an instruction across two axes — **injection** (how it reaches the runtime: agentic vs deterministic) and **consumption** (how it is executed: agentic vs deterministic) — through three states:

| State | Injection | Consumption | What lives here |
|---|---|---|---|
| **1 — escape-hatch** | agentic (model opens ad hoc) | agentic (model reads + decides) | An unwired instruction the model opens when it decides it needs it. |
| **2 — wired** | **deterministic** (a hook/gate surfaces it at the right moment) | **agentic** (model reads + decides) | The loop's **permanent home** for content that genuinely needs judgment. |
| **3 — encoded (terminus)** | deterministic | **deterministic** (a rule/gate fires without model judgment) | A promoted rule; a consult-gate that blocks an action. |

State-2 is not a waystation toward state-3. Content that needs judgment stays here permanently: the loop *injects* deterministically (so it surfaces at the right moment) but *consumes* agenticly (the model still interprets it). Meta-state finding descriptions are state-2 by design — the SessionStart hook surfaces them (deterministic injection); the model interprets each one (agentic consumption).

This is the loop's reason to exist. A pure deterministic program can do states 2–3 but cannot *consume* prose (state-1's job); a pure-agentic system does state-1 but cannot reliably *inject* (timing is the model's whim). The loop couples deterministic injection to agentic consumption — it occupies state-2, which neither extreme can do alone.

The escape-hatch gradient and the skill-migration ordering are engine invariants — see `docs/loop-engine.md` (§ The 13 escape-hatch items) for the canonical statement. Philosophy keeps the two-axis model above because it is the unique home of the injection × consumption framing.

See "Pillar 4 — Skill Authority vs. Loop Authority" below for the dependency-balance convention and the migration path.

### Schema Constraints Are State-3 Artifacts

A strict enum or validated field is machine-enforced, so it is a state-3 artifact by nature. But enforcement is only half the test. The *distinction among values* earns its keep **only when deterministic code branches on it** (state-3 consumption): a gate fires differently, a status derives differently, a tool routes by the value. If no code branches on the value, the distinction is consumed *agenticly* — the model reads the records and the rationale and interprets (state-2 or state-1). Then the distinction belongs in **prose**, not a validated field. A strict enum whose values no runtime branches on is decorative weight: a validation surface and a maintenance contract for zero deterministic payoff.

Test before adding a strict field: *what deterministic code consumes this value, and does it branch on it?* If the answer is "none — the agent reads the records and decides," the value is prose. Encode the distinction only when you can name the branch.

## Four Philosophical Pillars

### 1. Verification Is Dimensional, Not Binary

A thing can be proven to install and simultaneously unproven for production. Confidence is always partial and scoped.

| Dimension | What it means | What it does NOT mean |
|---|---|---|
| `static` | "The symbol exists and the docs say it should work." | "It will work in production." |
| `install` | "It installs cleanly in a sandbox." | "It will install on the operator's machine." |
| `runtime` | "It runs and returns expected output." | "It is safe to deploy." |
| `product` | "An approved rule says we may build on this." | "All risks are eliminated." |

Never conflate dimensions. Runtime proof approves nothing about deployment. Product approval does not erase risks. Each dimension answers a distinct question.

### 2. Rules Are Boundaries, Not Permissions

A rule (or boundary record) is not "yes, do this." It is "yes, within these lines, and no outside them." The blocked actions are philosophically more important than the allowed actions.

A rule without blocked actions is a wish, not a rule. It gives the next agent no signal about what was considered and rejected.

When you write a rule, you are drawing a fence. The fence keeps future agents from wandering into territory that was already explored and found unsafe.

### 3. Evidence Is Source, Not Proof

Evidence files are raw material. They do not self-certify. A disproven evidence file can sit on disk forever and mislead the next agent who browses it standalone.

Truth status lives in the registry, not in evidence. A finding is the atomic assertion derived from evidence `## Findings`; it carries dimension, scope, status, and grounding (`evidence_code_ref` + `mechanism_check: true`). Evidence is referenced by findings; findings are never inferred from evidence directly.

Always derive the finding's status first (`meta_state_derive_status`); read the evidence second. Never the other way around. The registry is the single top-level artifact for state queries. Internalize by pointing at the code, not by quoting the markdown. A code-pointed finding with `mechanism_check: true`, re-checked by `meta_state_derive_status` and `meta_state_check_grounding`, is durable; a markdown citation is the escape hatch.

### 4. Skill Authority vs. Loop Authority

The loop owns what survives across sessions. Skills own what happens in a single session. The two are not equivalent: a skill *executes* — an agentic step — while the loop *records* — a deterministic step. The `agentic-step` and `deterministic-step` roles are named and owned by `docs/loop-engine.md`; this pillar keeps the *authority* question (which one owns which concern), not the role definitions.

A skill is the **agentic-injection mechanism**: the markdown a runtime loads for the model to read, not a concept role. A skill can execute, scaffold, test, or review — all useful, none loop-citable by default. The loop's self-model (`meta-state.jsonl`) records the *result* of the work (a `finding`, a `change-log`) and the *commitment* the result implies (a `rule`). The skill is what *happened*; the loop is what *lasts*.

**The dependency-balance convention:**

| Concern | Authority | Why |
|---|---|---|
| **Plan-file authoring** (the pre-mortem) | The loop | The plan file is the contract. `ck:plan` is one way to write it; the resulting `change-log` entry with `change_target: 'plans/.../plan.md'` is what makes it loop-citable. The skill is a helper, not the authority. |
| **Code execution mechanics** (scaffolding, cooking, testing, review) | The skill | These are skill-shaped: session-scoped, execution-focused. The rule: every skill invocation must be cited in the resulting `finding` or `change-log` entry's `evidence_journal`. A skill run the loop does not know about is a bypass waiting to happen. |
| **The contract itself** (the rule, the boundary, the consult-gate pattern) | The loop, no exceptions | The meta-surface is the only authoritative source. Skills may *apply* the contract; they do not *define* it. |

**The single most important sentence:** *Skills execute; the loop records; the meta-surface is the only thing that survives.* The plan-file convention is what makes that sentence *operational* — it is the artifact where operator intent meets agent execution without either one bypassing the loop.

**The migration path (state-1 → state-2 → state-3).** The terminus is **state-3 (encoded)** — deterministic injection *and* deterministic consumption, the two-axis state where a rule or gate fires without model judgment. State-3 names the two-axis state; the `deterministic-step` engine role (per `docs/loop-engine.md`) names what realizes it.

The migration sequence is smallest-first, lowest-risk-first, and non-trivial: `ck:plan` (citation-only contract) → `ck:journal` (citation-only artifact) → `ck:cook` (full execution mechanics) — the state-1 → state-2 → state-3 path:

- **citation-only = state-1** — agentic injection; the skill markdown is read ad hoc.
- **citation-only-artifact = state-2** — deterministic injection (the registry citation surfaces it); agentic consumption.
- **full-execution = state-3** — deterministic consumption; a tool or gate executes without the model.

Each migration must (a) preserve the markdown as the readable spec — keep the content agentic (consumption stays agentic until state-3); (b) make the artifact loop-citable at creation — add deterministic injection (citability); and (c) enforce the consult-gates the markdown was skipping — add deterministic guardrails (a consult-gate is deterministic consumption of the guardrail). See `docs/trajectory.md` for the migration track.

## State Machine and the Runtime Surface

Findings, change-logs, and rules answer "what do we know?" Runtime-state rows answer "what is the current external state?" Both are necessary. Knowledge without state is blind. State without knowledge is meaningless.

The record is a 4-kind discriminated union in `meta-state.jsonl` (finding, change-log, rule, loop-design; canonical owner: `AGENTS.md` §1; lifecycle owner: `docs/meta-state-lifecycle.md`; concept owner: `docs/loop-engine.md`). Runtime state is a separate store (`runtime-state.jsonl`) carrying two row kinds: `budget-state` (mutable tracking, lifecycle `initial → active → paused → stopped`) and `ledger-event` (immutable audit). Findings and rules do not mutate in place; their status is derived by `meta_state_derive_status`, their grounding by `meta_state_check_grounding`.

### Runtime-State Rows Are the Authoritative Source for External Facts

A `budget-state` row captures a mutable fact about an external system: a device slot is consumed, a budget is exhausted, a cleanup succeeded, a vendor gate is open. A `ledger-event` row records that an event happened.

Before asking the operator about external system state, check runtime-state rows. The operator is the final authority, but the loop should do the work of remembering. If a `budget-state` row says the budget is exhausted, do not burn cycles on workarounds. Report the constraint and stop.

### Resource Budgets Are Hard Gates

External systems with irreversible operations carry a resource budget. The `budget-state` row tracks what was consumed, what remains, and when it was last verified.

Budget exhaustion (a gate `escalate`) is a full stop, not a warning. Do not fix-and-retry. Do not bypass. The budget is the operator's explicit signal that a resource limit has been reached. Any attempt to work around it is a violation of the loop's governance contract.

**Budget enforcement is the agent's responsibility, not the gate's.** The gate (`gate_check`) checks whether a constraint record exists (meta-level: "has someone recorded this constraint?"). The agent checks whether the budget is exhausted and whether the context is safe (domain-level: "do we have budget left for this specific operation?"). See `docs/meta-state-lifecycle.md` § Layer Separation for the full separation.

### Cleanup Is Part of Proof

A runtime probe is not complete when the code runs. It is complete when the temporary environment is destroyed and the `ledger-event` row confirms it.

Failed cleanup invalidates the result. If the temp directory still exists, the finding is `blocked` or `failed`, not `supports`. This is not housekeeping. It is a state-machine rule: the finding cannot transition to verified until cleanup transitions to succeeded.

### Agents Mutate via Tools, Not by Direct File Writes

Agents read findings, rules, and runtime-state rows. They also mutate the meta-surface (findings, change-logs) and append runtime-state rows — but always via loop tools (the CLI `tools/learning-loop-mastra/bin/loop.mjs` or the MCP server's residue), never by direct file writes. Direct writes to `meta-state.jsonl` and `runtime-state.jsonl` are gate-blocked.

The split that matters is not "agents never write, only the operator writes." It is about *which lifecycle each side owns*. The operator owns the **budget-tracking lifecycle** (`pause`/`stop` on `budget-state` rows) and the **meta-surface scope** (what gets promoted from finding to rule; what stays a deferral). Agents append findings and change-logs and record `budget-state`/`ledger-event` rows as their work happens. An agent that could *pause its own budget* would have no external constraint; an agent that could *promote its own findings to rules* would be writing its own contract. Those are the operator's checks, and the loop tool surface is shaped so the agent cannot reach them.

### Runtime State Drives the Gates

Runtime-state rows are not just remembered facts. They are permission signals — when the operator unlocks a gated surface.

The constraint enforcement layer — the bash gate and the write gate — reads active runtime-state rows and promoted rules to make allow/block decisions. The gates hard-block protected paths (`meta-state.jsonl`, `runtime-state.jsonl`, `tools/**`, `core/**`, etc.) by default; the operator unlocks a gated surface via preflight (`gate_mark_preflight`), which writes a short-lived marker the gate accepts. No preflight, no action.

This makes the loop self-referential. The loop's state machine (runtime-state rows + promoted rules) controls the loop's execution gates. Operator approval is not a conversational nicety. It is a mechanical state transition: the operator records state via `runtime_state_record` (or unlocks a surface via `gate_mark_preflight`); the gate reads `runtime-state.jsonl` fresh on the next tool call; the gate permits the action.

Transport today is the stateless CLI: all three runtimes set `LOOP_RECORDS_VIA_CLI=1`, and reads and writes ride `tools/learning-loop-mastra/bin/loop.mjs`; the MCP server keeps a small residue. The conversation is ephemeral. The runtime-state row is durable. The gate is stateless and reads fresh state every time. Conversational approval without a recorded row is a false promise — the gate cannot see the conversation. Only the recorded state matters.

## Governance Model: Two Tiers

The learning loop is a governance layer for external boundaries. It is not a general decision-making system for all code changes.

| Tier | What it governs | Workflow |
|---|---|---|
| **External boundary** | Vendor APIs, device slots, resource budgets, output policies, install/runtime contracts, production deployment | Learning loop: runtime-state rows gate the agent; the agent checks budget + grounding + context; meta-state records the reasoning. Plan files bound the pre-mortem. |
| **Internal implementation** | Refactoring, module extraction, naming, structure, patterns within approved boundaries | ck:* skills: plan → cook → review, **with the rule that skill invocations are cited in the resulting `finding` or `change-log`.** |

A refactor that touches no external system does not need a rule. A vendor API change always does. The question is never "is this big enough?" The question is "does this touch an external boundary?"

The two tiers are not the same kind of authority. The external-boundary tier is the loop's primary job: it produces records that constrain the next agent's behavior. The internal-implementation tier is execution support: the skill gets the work done, the loop records that it happened. When the skill's work touches the external-boundary tier, the skill execution must surface as a meta-state event (a `finding` if the work changed the loop's behavior; a `change-log` if the work changed the loop's machinery).

## How to Reason With the Loop

### Start With What You Do Not Know

Before planning, list uncertainties. Convert each uncertainty into a finding candidate (what you believe) and a risk (what could go wrong). The loop is not about proving you are right. It is about making your uncertainty explicit so it can be addressed or bounded.

### Prove Before Building

A runtime probe proves a library returns usable data. A finding captures a hypothesis and its result. A rule approves a scope. Product code comes last, never first.

If you find yourself writing product code before a finding is recorded and verified, stop. You are building on unproven ground.

### Preserve Negative Knowledge

When something fails, record it. A failed finding is as valuable as a successful one. It prevents the next agent from retrying the same dead path.

Do not delete failed evidence. Supersede it with a link. The link is the signal that the failure was considered and overcome.

### Ask the Loop, Not the Operator

Before asking the operator about external system state, check runtime-state rows. They are the authoritative source for device slots, budgets, registration status, and rate limits.

Before asking the operator about prior decisions, check the meta-state registry. The rule is the contract. The finding is the result. The plan file is the pre-mortem. Cite the code, not the markdown.

The operator is the final authority, but the loop should do the work of remembering. Only escalate when the record is silent or stale.

### Cite the Loop, Not the Skill

When you need to invoke a `ck:*` skill, know *why* you need it. The skill is the mechanism. The loop is the reason. After the skill runs, the resulting work product (a plan file, a code change, a journal entry) must be cited in the loop — either as a `change-log` entry with `change_target` pointing at the file, or as a `finding` with `evidence_journal` pointing at the file. A skill invocation that the loop does not know about is invisible to the next agent.

## The Adversarial Mindset

The loop assumes agents make mistakes. It is designed to catch them.

- **Findings are challenged** by `meta_state_derive_status` (is this still true?) and `meta_state_check_grounding` (does the code match the fingerprint?).
- **Change-logs are challenged** by superseding change-logs (a later system change absorbs the earlier one).
- **Rules are challenged** by `meta_state_query_drift` (aggregate drift across the registry) and by supersession when a newer rule replaces them.
- **Evidence is challenged** by newer evidence.

Do not treat the loop as an approval pipeline to pass through. Treat it as a debate where your work must survive scrutiny. Write records as if a skeptical agent will read them next week and decide whether to trust your conclusion.

## What the Loop Is Not

- **It is not a checklist.** Checklists are memory aids for people who already understand. The loop is a reasoning framework for agents who do not. Checklists that agents must read from docs are loop gaps.
- **It is not a bureaucracy.** Records are lightweight. A single finding with clear evidence and result is enough. Verbose ceremony adds no confidence.
- **It is not a guarantee.** A verified finding can still fail in production. The loop raises confidence; it does not eliminate risk.
- **It is not a substitute for judgment.** The operator decides what risks to accept. The loop informs the decision; it does not make it. Judgment lives in docs; procedure lives in the loop.
- **It is not the only source of authority.** The skill family (and the agent's own reasoning) are useful. The loop does not replace them. The loop records what they do and constrains what they may do; it does not pretend they do not exist.

## Summary

The learning loop exists because agents forget. It works by making knowledge durable, confidence dimensional, rules bounded, and skills accountable. Use it to know what you know, know what you do not, and prevent the next agent from rediscovering your mistakes.

The trajectory of the loop is to internalize what is internalizable — first procedural knowledge (rules, runtime-state, consult-gates), then plan mechanics, then skill mechanics — while leaving irreducible judgment in the docs. The docs that survive the rewrite are the docs that capture the "why" the loop cannot proceduralize. Everything else moves.
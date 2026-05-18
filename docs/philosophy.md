# Philosophy of the Learning Loop

This document explains why the loop exists and how to reason with it. Read this before the operator guide. The operator guide tells you what to do; this document tells you how to think.

## Core Premise

Agents have no persistent memory across sessions. Each agent starts fresh. It does not know what the last agent proved, what failed, what was decided, or what remains uncertain. The loop exists because **the record is the memory**.

Without the loop, every session repeats the same discoveries, re-runs the same experiments, and remakes the same mistakes. The loop turns ephemeral agent work into durable institutional knowledge.

## Three Philosophical Pillars

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

Truth status lives in claims, not in evidence. A claim's verification block says which dimensions are proved and by which experiments. Evidence is referenced by claims; claims are never inferred from evidence.

Always read claims first. Evidence second. Never the other way around.

## State Machine and Observations

Claims, experiments, and decisions answer "what do we know?" Observations answer "what is the current state?" Both are necessary. Knowledge without state is blind. State without knowledge is meaningless.

### Observations Are the Authoritative Source for External Facts

An observation record captures a mutable fact about an external system: a device slot is consumed, a budget is exhausted, a cleanup succeeded, a vendor gate is open.

Before asking the operator about external system state, check observations. The operator is the final authority, but the loop should do the work of remembering. If an observation says the budget is exhausted, do not burn cycles on workarounds. Report the constraint and stop.

### Resource Budgets Are Hard Gates

External systems with irreversible operations carry a resource budget. The budget tracks what was consumed, what remains, and when it was last verified.

A budget check failure is a full stop, not a warning. Do not fix-and-retry. Do not bypass. The budget is the operator's explicit signal that a resource limit has been reached. Any attempt to work around it is a violation of the loop's governance contract.

### Cleanup Is Part of Proof

A runtime experiment is not complete when the code runs. It is complete when the temporary environment is destroyed and the observation confirms it.

Failed cleanup invalidates the experiment outcome. If the temp directory still exists, the experiment is `blocked` or `failed`, not `supports`. This is not housekeeping. It is a state-machine rule: the experiment cannot transition to verified until cleanup transitions to succeeded.

### Agents Do Not Mutate State

Agents read observations and budgets. They do not write them. Only the operator mutates state records.

This separation is deliberate. An agent that could update its own budget would have no external constraint. The operator is the sole source of truth for mutable system state.

## Governance Model: Two Tiers

The learning loop is a governance layer for external boundaries. It is not a general decision-making system for all code changes.

| Tier | What it governs | Workflow |
|---|---|---|
| **External boundary** | Vendor APIs, device slots, resource budgets, output policies, install/runtime contracts, production deployment | Learning loop: claim → experiment → decision |
| **Internal implementation** | Refactoring, module extraction, naming, structure, patterns within approved boundaries | ck:* skills: plan → cook → review |

A refactor that touches no external system does not need a decision record. A vendor API change always does. The question is never "is this big enough?" The question is "does this touch an external boundary?"

## How to Reason With the Loop

### Start With What You Do Not Know

Before planning, list uncertainties. Convert each uncertainty into a claim (what you believe) and a risk (what could go wrong). The loop is not about proving you are right. It is about making your uncertainty explicit so it can be addressed or bounded.

### Prove Before Building

A capability script proves a library returns usable data. An experiment proves a hypothesis. A decision approves a scope. Product code comes last, never first.

If you find yourself writing product code before a claim is verified, stop. You are building on unproven ground.

### Preserve Negative Knowledge

When something fails, record it. A failed experiment is as valuable as a successful one. It prevents the next agent from retrying the same dead path.

Do not delete failed evidence. Supersede it with a link. The link is the signal that the failure was considered and overcome.

### Ask the Loop, Not the Operator

Before asking the operator about external system state, check observation records. Observations are the authoritative source for device slots, budgets, registration status, and rate limits.

The operator is the final authority, but the loop should do the work of remembering. Only escalate when the record is silent or stale.

## The Adversarial Mindset

The loop assumes agents make mistakes. It is designed to catch them.

- **Claims are challenged** by experiments.
- **Experiments are challenged** by cleanup rules (a failed cleanup invalidates the result).
- **Decisions are challenged** by superseding decisions.
- **Evidence is challenged** by newer evidence.

Do not treat the loop as a approval pipeline to pass through. Treat it as a debate where your work must survive scrutiny. Write records as if a skeptical agent will read them next week and decide whether to trust your conclusion.

## What the Loop Is Not

- **It is not a checklist.** Checklists are memory aids for people who already understand. The loop is a reasoning framework for agents who do not.
- **It is not a bureaucracy.** Records are lightweight. A single experiment with clear hypothesis and result is enough. Verbose ceremony adds no confidence.
- **It is not a guarantee.** A verified claim can still fail in production. The loop raises confidence; it does not eliminate risk.
- **It is not a substitute for judgment.** The operator decides what risks to accept. The loop informs the decision; it does not make it.

## Summary

The learning loop exists because agents forget. It works by making knowledge durable, confidence dimensional, and decisions bounded. Use it to know what you know, know what you do not, and prevent the next agent from rediscovering your mistakes.

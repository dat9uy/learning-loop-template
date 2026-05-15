# 260515 — Loop Harness Discussion: When Agents Skip Context and Cause Harm

## Trigger

An agent working on `plans/260515-vnstock-installer-rewrite/plan.md` failed to read `docs/journals/260514-vnstock-experiment-meta-reflection.md` before acting. It then ran `import vnstock_data` on the host environment, which reactivated a previously cleared soft-deleted device. A slot was consumed. Phase 2 validation became blocked.

The plan file contained an explicit "Agent Onboarding — Read This First" section with the meta-reflection listed as the #1 essential reading. The agent either skipped it or read it without internalizing the implications.

## Why This Matters Beyond One Slot

This incident reveals a harness-level failure mode:

> **Agents can cause irreversible side effects before they have absorbed the constraints that would have prevented those effects.**

The learning loop invests heavily in durable records (journals, claims, observations) to encode hard-won ground truth. But the loop has no enforcement mechanism ensuring an agent consumes that context before acting. Documentation without attestation is a suggestion, not a gate.

In the vnstock domain, the cost is immediate and countable: one device slot consumed, one validation path blocked, operator time spent clearing devices again. In other domains, the cost could be corrupted data, leaked secrets, or broken production state.

## Concrete Prevention Ideas Discussed

The following were discussed as potential harness improvements. **None are implemented yet.** They are captured here as a seed for post-vnstock generalization.

1. **Context Verification Attestation**
   - Plans with destructive operations include a `## Context Verification` section.
   - Agents must fill out checkboxes (files read, key facts understood) and sign with timestamp.
   - Creates a visible diff proving engagement or exposing neglect.

2. **Learning Loop Rule Amendment**
   - Update `learning-loop-rules.md` with a "Context Before Action" rule.
   - Mandate explicit quotation of constraints from required reading before any side-effect step.

3. **Side-Effect Gate Pattern**
   - Formalize the existing "STOP" comments into mandatory pre-flight blocks.
   - For finite resources, require checking the live ledger (e.g., slot observation) before proceeding.

4. **Plan Template with Context Gates**
   - Create `plans/templates/plan.md` so future plans inherit context verification by default.

5. **Domain-Specific Guard Scripts**
   - Lightweight interactive guards for high-stakes operations (e.g., vnstock slot consumption).
   - Forces active recall, not passive reading.

## Decision: Defer Generalization

**Priority right now is completing the vnstock-data loop**, not refactoring the harness. The above ideas are recorded as a seed. After vnstock reaches a stable state (one clean production device, validated bootstrap, closed experiment records), we will revisit whether any of these mechanisms should become loop-wide policy.

Rationale for deferral:
- The current incident is contained (operator can clear devices).
- The plan already has defensive rewrites completed (Phase 1).
- Generalizing harness changes without a concrete second domain risks over-engineering.
- One verified pattern is stronger than five speculative ones.

## What to Watch For (Future Signals)

If any of the following happen again, the harness discussion gets promoted from "seed" to "active plan":

- A second agent skips required reading and causes a preventable side effect.
- A non-vnstock domain hits the same "acted before understanding" failure mode.
- An operator cannot determine from git history whether an agent actually read a context file.
- A plan's "Essential Reading" section grows longer while agents continue to miss it.

## Current State

- vnstock Phase 2 validation blocked pending operator device clearance.
- Harness discussion documented but not actioned.
- Loop completion takes priority over loop meta-work.

## Source

- Current session, 2026-05-15
- Plan: `plans/260515-vnstock-installer-rewrite/plan.md`
- Missed context: `docs/journals/260514-vnstock-experiment-meta-reflection.md`
- Slot ledger: `records/observations/observation-vnstock-device-slot-ledger.yaml`

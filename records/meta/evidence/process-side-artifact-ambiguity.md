---
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
---

# Process-Side Artifact Ambiguity

## Findings

- [process-side-artifact] Knowledge pack (`knowledge-packs/<domain>/`) is the process-side artifact agents consume to discover verified capabilities.
- [knowledge-pack-consumption] Cleared-context agents scan `knowledge-packs/` before exploring evidence or re-running experiments.
- [pack-contents] `capabilities.yaml` tells agent what it may do; `facts.yaml` tells verified truths with record_ref provenance; `manifest.yaml` tells pack scope and approval status.
- [ambiguity-cost] Without documented consumption pattern: evidence treated as agent-facing, duplicate experiments, packs remain empty.
- [deferred-promotion] Canonical adoption requires decision record; do not modify docs until self-improvement decision approved.

## Observation

During vnstock install knowledge encoding (2026-05-08), the operator asked: *"I am not sure about the output artifact of this level. This could be the command that other agent could install, or something I don't know to be exact."*

The loop documentation (operator guide, lab model, knowledge-pack-contract) never explicitly states what artifact a cleared-context agent should read to discover verified capabilities.

## Evidence

- `docs/operator-guide.md` describes agent intake flow but does not say "read knowledge packs first"
- `docs/lab-model.md` defines the hierarchy but does not state the pack is the agent-facing artifact
- `docs/knowledge-pack-contract.md` defines pack structure but does not describe agent consumption pattern
- `knowledge-packs/_template/manifest.yaml` exists but template `facts.yaml` and `capabilities.yaml` are empty arrays with no guidance

## What Was Confused

| Level | What exists | What was missing |
|-------|-------------|------------------|
| Evidence | `records/evidence/vnstock-data/installer-prior-notes.md` | Not consumable by agent; prose source material |
| Claim/Experiment | None yet | No assertion or proof |
| Knowledge Pack | None yet | **This is the intended process-side artifact** but docs never say so |

## Resolution (Provisional)

The knowledge pack (`knowledge-packs/<domain>/`) is the process-side artifact. Specifically:

- `capabilities.yaml` tells the agent what it may do
- `facts.yaml` tells the agent verified truths with `record_ref` provenance
- `manifest.yaml` tells the agent the pack scope and approval status

A cleared-context agent should scan `knowledge-packs/` to discover verified domain capabilities before exploring evidence or re-running experiments.

## Why This Matters

If the loop does not document this consumption pattern, every new operator must rediscover it. The ambiguity leads to:
- Evidence files being treated as agent-facing (they are not)
- Duplicate experiments because agents cannot find verified knowledge
- Pack files remaining empty or unused

## Proposed Improvement

Update `docs/operator-guide.md` Agent Intake Flow (step 2 or 3) to explicitly state:

> "Locate relevant **knowledge packs** first. These are the agent-facing verified capabilities. Only fall back to evidence/records if no pack covers the domain."

Update `docs/knowledge-pack-contract.md` to add:

> "Knowledge packs are the primary process-side artifact. Cleared-context agents consume packs to discover verified methods, facts, and capabilities."

## Deferral

Canonical adoption requires a decision record. This evidence seeds that decision. Do not modify docs until the self-improvement decision is approved.

## Trigger

- Event class: next-agent-intake-flow-review
- Threshold: N=1 (closeable)
- Action when triggered: promote to meta-claim. Update operator guide step 2 to state pack is agent-facing artifact.

## Source

- Brainstorm report: `plans/reports/260508-1545-vnstock-install-knowledge-encoding.md`
- Original evidence: `records/evidence/vnstock-data/installer-prior-notes.md`

## Status Update

Proposed operator-guide and knowledge-pack-contract updates are deferred. Knowledge-pack abstraction is currently out of active plan; next loop effort is converting verified claims into product-scope. Revisit this evidence when pack work re-enters the roadmap, or when a second cleared-context agent intake exposes the same ambiguity (re-meeting the original N=1 trigger).

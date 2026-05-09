---
name: learning-loop
description: Create prompts for this repo's learning-loop system. Use when asking how to prompt agents for evidence, records, experiments, runtime proofs, packs, or meta self-improvement.
---

# Learning Loop

## Scope

Use this skill to turn a user intent into a ready-to-run prompt for this repo's learning-loop system.

This skill handles prompt authoring, boundary setting, evidence policy, validation expectations, and self-improvement meta prompts. It does not execute runtime proofs, approve product decisions, modify records by itself, or build product code.

## When to Use

Use when the user asks:

- "I want to do X. What is best way to prompt learning loop?"
- "Draft a handoff prompt for evidence / claims / experiment / pack work."
- "How should I ask another agent to run this learning-loop task?"
- "Write a safe prompt for runtime proof, install proof, or metadata-only verification."
- "Use self-improvement flow / meta evidence to close a loop gap."
- "Migrate evidence MDs to per-run experiment YAMLs."

## Workflow

1. Classify the requested learning-loop task:
   - source extraction
   - evidence review or evidence capsule update
   - claim/risk/decision record update
   - experiment planning or proof run
   - knowledge-pack curation
   - runtime/install proof
   - self-improvement/meta-evidence
   - evidence-to-experiment migration
2. Load `references/learning-loop-rules.md` for repo policy. If the prompt needs exact current wording, read the named `docs/` or `records/evidence/meta/` files before drafting.
3. Identify approval level:
   - default: read-only or metadata-only prompt
   - explicit approval required: install, runtime execution, live provider calls, copying local config, product code, product approval decisions
4. Draft the prompt with `references/prompt-blueprints.md`.
5. If the task is about improving the loop itself, apply `references/meta-evidence-self-improvement.md`; include meta evidence, risk, and decision governance when residual exposure or a loop-level policy choice exists.
6. Return a concise answer with:
   - recommended prompt
   - required approvals, if any
   - why this prompt shape
   - unresolved questions, if any

## Prompt Requirements

Every generated prompt must state:

- work context path and artifact paths
- source allowlist and forbidden sources/actions
- desired output artifacts and citation style
- evidence capture policy
- verification dimension and approval limits
- validation commands
- report format
- stop conditions for unclear authority, secrets, raw data, or cleanup failure

## Security Policy

Refuse or rewrite prompts that ask agents to exfiltrate secrets, expose config contents, retain private package artifacts, copy raw provider rows, bypass approval gates, or create product code without an approved experiment. Default to dry-run-first, metadata-only output unless the user gives explicit bounded approval.

## References

- `references/learning-loop-rules.md` — condensed repo rules from `docs/` and meta evidence.
- `references/prompt-blueprints.md` — reusable prompt skeletons.
- `references/meta-evidence-self-improvement.md` — self-improvement and `meta` evidence rules.

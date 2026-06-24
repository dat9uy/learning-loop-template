# Orchestration Patterns

Use these blueprints when the user wants to run an experiment and update a claim in one continuous workflow, or when they want to verify that an experiment's evidence aligns with a claim before promotion.

MCP tools: `workflow_intake_plan`, `workflow_report_phase_status` implement orient/plan/phase-reporting mechanically.

These prompts chain existing blueprints; they do not replace `prompt-blueprints.md` or `learning-loop-rules.md`.

---

## Full-Lifecycle Experiment Orchestration Prompt

Use when the user has a draft experiment and wants to execute it, capture results, and update the related claim if the experiment succeeds.

```text
Orchestrate the full lifecycle for experiment [experiment-id].

Work context: [absolute path to this repo]
Reports: [absolute path to this repo]/plans/reports/
Plans: [absolute path to this repo]/plans/

Read first:
- records/<surface>/experiments/[experiment-id].yaml
- records/<surface>/claims/[claim-id].yaml
- records/<surface>/evidence/ (relevant evidence)
- docs/operator-guide.md (Runtime Artifact Standard, Experiment Result Convention)
- docs/artifact-concepts.md (dimension rules)

Phase 1 — Evidence-first scan:
- Verify the experiment's claim_refs and risk_refs match current records.
- Verify the experiment's verification.proves aligns with the claim's target dimension, scope, and output_level.
- Verify the experiment status is reviewed or approved before promotion.
- List missing approvals or blocked actions before execution.

Phase 2 — Execution (delegated to Runtime or Install Proof Prompt):
- Run the approved experiment exactly as documented.
- Do not echo, log, or capture environment variables that carry credentials or API keys inside the runtime substrate.
- Capture envelope fields: run_id, temp_root_class, approval_gate, command_class, allowed_outputs, blocked_outputs, cleanup_status, temp_root_deleted, validation_status.
- Cleanup is part of proof success; failed cleanup blocks promotion.

Phase 3 — Result capture:
- Update the experiment YAML with result, result_reason, agent_outcome, observations.
- Write or update evidence MD with required envelope fields.
- Sanitize all output (no credentials, API keys, literal device IDs, temp paths).

Phase 4 — Claim-evidence alignment review (delegated to Claim-Evidence Alignment Review Prompt):
- Confirm dimension, scope, and output_level match between experiment and claim.
- Flag mismatches before claim update.

Phase 5 — Claim update (delegated to Post-Experiment Claim Update Prompt):
- Map experiment result to claim dimension status per promotion rules.
- Run pnpm verify:claim with correct arguments.
- Run pnpm validate:records && pnpm check.

STOP and request explicit human approval before:
- Any install/runtime execution.
- Any claim dimension status change.
- Any product code modification.

If the user has not given explicit bounded approval for the exact gate, do not proceed. Stop and ask.

Stop and ask if:
- Authority is unclear.
- Cleanup cannot be confirmed.
- Experiment result does not clearly support or reject the hypothesis.
- Cross-record references are broken or inconsistent.
```

---

## Post-Experiment Claim Update Prompt

Use after an experiment has been executed and results captured.

```text
Update claim [claim-id] based on experiment [experiment-id].

Work context: [absolute path to this repo]

Read first:
- records/<surface>/experiments/[experiment-id].yaml
- records/<surface>/claims/[claim-id].yaml
- docs/artifact-concepts.md (dimension status values)
- docs/operator-guide.md (Claim Verification)

Steps:
1. Read the experiment result and result_reason.
2. Map result to claim dimension status:
   - supports → verified
   - does-not-support → rejected
   - inconclusive → stay claimed, add or preserve limitation
3. Verify the experiment status is reviewed or approved; do not promote from draft experiments.
4. Verify the experiment's verification.proves matches the claim dimension, scope, and output_level.
4. Construct the exact verify:claim command:
   pnpm verify:claim -- \
     --claim <claim-id> \
     --dimension <dim> \
     --status <status> \
     --reason "<concise reason>" \
     --proof-ref <experiment-id> \
     --apply
5. Run dry-run first (without --apply). Inspect output.
6. If dry-run passes, re-run with --apply.
7. Run pnpm validate:records && pnpm check.

Forbidden:
- Do not update product dimension from an experiment.
- Do not update claim if cleanup was not confirmed.
- Do not invent proof_refs for experiments that did not run.
- Do not remove limitations unless the experiment directly resolves them.

Report:
- Command used.
- Validation results.
- Any residual risks or unresolved questions.
```

---

## Claim-Evidence Alignment Review Prompt

Use as a gate before updating a claim from an experiment.

```text
Review alignment between experiment [experiment-id] and claim [claim-id].

Work context: [absolute path to this repo]

Read:
- records/<surface>/experiments/[experiment-id].yaml (verification.proves, result, scope, output_level)
- records/<surface>/claims/[claim-id].yaml (verification.<dimension>, limitations)
- Relevant evidence files cited by both records.

Checks:
1. Dimension match: experiment.proves.dimension equals claim verification target.
2. Scope match: experiment.scope (or proves.scope) equals claim verification scope.
3. Output level match: experiment.output_level (or proves.output_level) is compatible with claim output policy.
4. Evidence envelope: the evidence file contains required envelope fields.
5. Cleanup confirmation: temp_root_deleted is true and cleanup_status is succeeded.
6. Experiment status: status is reviewed or approved before promotion.
7. Limitation resolution: the experiment directly addresses the limitation it claims to resolve.

Output:
- aligned: true/false
- mismatches: list of any gaps
- recommendation: proceed, block, or request operator review
```

---

## Promotion Rules

| Experiment result | Claim dimension action | Limitation action |
|---|---|---|
| `supports` | Status → `verified`; add proof-ref | Remove if experiment directly resolves it |
| `does-not-support` | Status → `rejected`; add proof-ref | Preserve; document new limitation if needed |
| `inconclusive` | Status stays `claimed`; no proof-ref update | Preserve or add limitation describing the blocker |

### Multi-Experiment Synthesis

When two or more experiments target the same claim dimension:

- All experiments must be `reviewed` or `approved`.
- If any experiment is `inconclusive`, the dimension stays `claimed` unless a later experiment resolves it.
- If experiments conflict, the dimension stays `claimed` and a risk record should note the conflict.
- Product dimension is never updated by experiment synthesis; it requires a decision record.

---

## Optional: Orchestration Helper Script Spec

A future `tools/` script could read an experiment YAML and output the exact `pnpm verify:claim` command. Deferred until N ≥ 3 distinct orchestration cases prove the need.

---

## Cross-Reference

- See `references/context-retrieval-patterns.md` for Tier 2 Verification Lookup Pattern and agent intake guardrails.

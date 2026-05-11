---
phase: 3
title: "Validation And Meta-Decision"
status: pending
priority: P2
effort: "45m"
dependencies: ["1", "2"]
---

# Phase 3: Validation And Meta-Decision

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md`
- Phase 1 artifacts: candidate MD, meta-experiment YAML, Gap 1 MD update
- Phase 2 artifact: Gap 2 MD update
- Loop policy: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` ("Self-Improvement Decision Rules")
- Validation commands: `package.json` → `validate:records`, `check`

## Overview

Run the two validation gates (`pnpm validate:records`, `pnpm check`) on the artifacts produced by Phases 1 + 2. If both pass, draft a meta-decision pinning the loop-level policy choice for both gaps. If either fails, fix the artifact and re-run before authoring the decision.

## Requirements

### Functional
- `pnpm validate:records` exit 0 against the new + edited records.
- `pnpm check` exit 0.
- Meta-decision YAML drafted only after both gates pass.

### Non-Functional
- Meta-decision stays at `status: draft` (this plan does not approve loop-level decisions; operator review is required).
- Meta-decision follows existing decision schema patterns (see prior loop decisions for shape).
- Meta-decision is meta/loop architecture, not domain content.

## Architecture

### Validation flow

```
pnpm validate:records   # JSON schema + cross-ref against records/**
pnpm check              # alias of validate:records per package.json
```

If validate:records errors:
- Read error output. Common failure classes: missing source_refs target, wrong frontmatter shape, schema_version mismatch.
- Fix the offending file in the relevant phase.
- Re-run.

### Meta-decision shape

```
records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml
```

Pin:
- Gap 1: template candidate accepted at draft; promotion via decision on next non-vnstock install.
- Gap 2: partial supersession recognized; field enrichment deferred until N>=3 verified packs.
- Out-of-scope: parser-swap decision remains independent.
- Revisit trigger: next non-vnstock install experiment OR third verified pack, whichever fires first.

## Related Code Files

- Modify or create: `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` (operator-gated; draft only)
- Read: all artifacts from Phases 1 + 2 (for validation)

## Implementation Steps

1. Run `pnpm validate:records` from repo root.
2. If failure, read error output, fix offending file in Phase 1 or Phase 2, re-run. Repeat until exit 0.
3. Run `pnpm check`. Confirm exit 0.
4. Draft meta-decision YAML at `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml`:
   - `id: decision-260512T0046Z-loop-meta-evidence-gap-revisit`
   - `schema_version: "1.0"`
   - `type: decision`
   - `status: draft`
   - `source_refs`: candidate MD + meta-experiment YAML + Gap 1 MD + Gap 2 MD + brainstorm report
   - `notes`: "Meta/loop architecture, not domain evidence. Pairs with the open meta-experiment in records/experiments/."
   - `question`: "How should the loop resolve the install-experiment-template gap (N=2 trigger exceeded) and the capability-schema gap (N>=3 trigger not yet met) while keeping the YAML parser swap decision independent?"
   - `decision`: accept template candidate at draft, recognize partial supersession of Gap 2, defer field enrichment until N>=3 verified packs, keep parser swap independent.
   - `rationale`: cite brainstorm convergence table + structural drift analysis.
   - `alternatives`: bundle ajv now (rejected, parser-swap defers it); strict deferral (rejected, gap MD would mislead future agents); draft enriched schema now (rejected, N>=3 not met).
   - `tradeoffs`: candidate may need revision after next non-vnstock install; gap MDs gain mixed status (resolution + preserved history).
   - `decision_effect.action: approve`
   - `decision_effect.scope: meta-evidence-revisit`
   - `decision_effect.affected_refs`: list every touched file
   - `decision_effect.boundaries.allowed_actions`: author template candidate, update gap MDs, draft meta-experiment + meta-decision
   - `decision_effect.boundaries.blocked_actions`: edit schemas, edit approved capability records, copy template to docs/, promote template before meta-experiment passes, bundle parser-swap into this scope
   - `decision_effect.boundaries.required_gates`: `pnpm validate:records`, `pnpm check`, meta-experiment passes against next non-vnstock install
5. Re-run `pnpm validate:records` after the meta-decision YAML lands. Confirm exit 0.

## Todo List

- [ ] Run `pnpm validate:records` (Phase 1 + 2 artifacts)
- [ ] Fix any validation errors and re-run until exit 0
- [ ] Run `pnpm check` (sanity check)
- [ ] Draft `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` at `status: draft`
- [ ] Re-run `pnpm validate:records` after meta-decision lands

## Success Criteria

- [ ] `pnpm validate:records` exits 0 after all Phase 1 + 2 + 3 edits
- [ ] `pnpm check` exits 0
- [ ] Meta-decision YAML exists at `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml` with `status: draft`
- [ ] Meta-decision `source_refs` covers every artifact this plan touched
- [ ] Meta-decision `boundaries.blocked_actions` explicitly excludes parser-swap from scope

## Risk Assessment

- **Risk:** Meta-experiment YAML may fail schema validation (e.g. `scope: meta` not in enum).
  **Mitigation:** Phase 1 already accounts for this risk; if it surfaces here, fall back to closest valid `scope` value and document the deviation in `notes`. Do not weaken the schema.
- **Risk:** Operator may want the meta-decision at `status: approved` rather than `status: draft`.
  **Mitigation:** Keep at draft per loop convention; operator promotes during review. The plan does not have decision-approval authority.
- **Risk:** Validation may flag the new meta-experiment for missing claim_refs.
  **Mitigation:** Per the meta-experiment shape, `claim_refs: []` is legitimate (no claim is under test; the experiment validates a template, not a claim). If validator forbids empty `claim_refs`, escalate to operator — do not invent a synthetic claim.

## Security Considerations

- Meta-decision is meta/loop architecture; no credentials, raw external data, raw logs, or private artifacts.
- All affected files live under `records/` per meta-governance.

## Next Steps

- Operator reviews and (optionally) promotes the meta-decision to `status: approved`.
- When the next non-vnstock install experiment lands, the meta-experiment is run against it to validate (or revise) the template candidate.
- If the candidate fits, a follow-up decision promotes the template to canonical (possibly under `docs/templates/`).
- Parser-swap decision continues on its independent track.

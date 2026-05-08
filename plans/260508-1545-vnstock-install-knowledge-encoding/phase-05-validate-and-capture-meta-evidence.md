---
phase: 5
title: "Validate and Capture Meta Evidence"
status: pending
priority: P2
effort: "30m"
dependencies: [4]
---

# Phase 5: Validate and Capture Meta Evidence

## Overview

Run final validation, then capture meta-loop improvement observations as evidence for the deferred self-improvement cycle.

## Requirements

- Functional: All records validate. Meta evidence files created.
- Non-functional: No canonical loop changes. Observations are evidence, not decisions.

## Architecture

```
records/evidence/meta/
├── process-side-artifact-ambiguity.md (already created)
├── capability-schema-gap.md
├── install-experiment-template-gap.md
└── runtime-run-schema-deferral.md
```

## Related Code Files

- **Create:** `records/evidence/meta/capability-schema-gap.md`
- **Create:** `records/evidence/meta/install-experiment-template-gap.md`
- **Create:** `records/evidence/meta/runtime-run-schema-deferral.md`
- **Read for context:** `plans/reports/260508-1545-vnstock-install-knowledge-encoding.md`
- **Read for context:** `records/evidence/meta/process-side-artifact-ambiguity.md`

## Implementation Steps

1. Run `pnpm check` (validates records + runs all checks)

2. Verify end-to-end chain:
   - Evidence → Claim → Experiment → Pack
   - Claim install dimension verified by experiment
   - Experiment has human approval
   - Pack publication gate satisfied
   - Pack facts have record_ref provenance

3. Create `records/evidence/meta/capability-schema-gap.md`
   - Observation: `capabilities.yaml` has no schema; template is empty array
   - Evidence: vnstock pack required structure (id, description, method, prerequisites, verified_by, scope)
   - Proposed improvement: Define capability record schema after deriving from real use
   - Deferral note: Canonical adoption requires decision record

4. Create `records/evidence/meta/install-experiment-template-gap.md`
   - Observation: No reusable install experiment template exists
   - Evidence: vnstock install steps, metadata classes, evidence envelope structure
   - Proposed improvement: Create template from vnstock execution pattern
   - Deferral note: Template should be validated against multiple install cases first

5. Create `records/evidence/meta/runtime-run-schema-deferral.md`
   - Observation: Runtime Artifact Standard says envelope fields live as markdown until repeated cases prove pattern
   - Evidence: This is the first install experiment; one case may not justify schema
   - Proposed improvement: Track count of runtime experiments; formalize schema at N=3
   - Deferral note: Update this file when additional runtime experiments run

## Success Criteria

- [ ] `pnpm check` passes
- [ ] End-to-end chain verified manually
- [ ] All 4 meta evidence files exist
- [ ] Meta evidence files cite the vnstock experiment as source
- [ ] No canonical docs/schema changes made (deferred to self-improvement cycle)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Meta evidence is premature design | low | Document as observation, not prescription |
| User tempted to implement loop changes now | low | Explicit deferral note in each file |
| Validation fails at final step | low | Run pnpm check after each prior phase |

## After This Plan: Next Action to Improve the Skill

Once this plan completes, the follow-up self-improvement work is:

1. Create meta claim: "Learning loop needs documented capability schema and install experiment template"
2. Create meta experiment: Derive schema from vnstock pack + any additional packs
3. Create meta decision: Approve or reject schema/template adoption
4. If approved: Update operator guide, lab model, and create reusable templates

Trigger: When 2+ additional packs exist or when a second install experiment runs.

---
phase: 2
title: "Procedural Setup"
status: pending
priority: P1
effort: "1h15m"
dependencies: [1]
---

# Phase 2: Procedural Setup

## Overview

Create four new meta-evidence files (Q1+Q2 secret-injection-class, Q3 n-equals-one-gap-class, Q4 evidence-truth-status-mechanism, Q6 capability-dir-scan-rule), retrofit `## Trigger` sections into the four pre-existing meta-evidence files, and patch operator-guide Agent Intake Flow step 2 with Q4 E (claims-first ordering) + Q5 R2 (deferred-meta-scan rule) + Q6 (capability-dir scan complementing claims-first). Procedural and structural; no execution risk.

## Requirements

- Functional: four new meta-evidence files exist with `## Trigger` sections; four existing files have backfilled `## Trigger` sections; operator guide Agent Intake Flow step 2 carries claims-first + deferred-meta-scan + capability-dir scan rules.
- Non-functional: no schema changes. No record_ref additions to existing claims (those are Phase 4 work). All edits validate with `pnpm check`.

## Architecture

```
records/evidence/meta/
├── (NEW) secret-injection-class.md
├── (NEW) n-equals-one-gap-class.md
├── (NEW) evidence-truth-status-mechanism.md
├── (NEW) capability-dir-scan-rule.md
├── (UPDATE) process-side-artifact-ambiguity.md  -- add ## Trigger
├── (UPDATE) capability-schema-gap.md            -- add ## Trigger
├── (UPDATE) install-experiment-template-gap.md  -- add ## Trigger
└── (UPDATE) runtime-run-schema-deferral.md      -- add ## Trigger

docs/operator-guide.md
└── Agent Intake Flow step 2 (UPDATE)
    ├── Q4 E rule: claims-first ordering (truth-status discovery)
    ├── Q5 R2 rule: pre-experiment scan of deferred meta-evidence
    └── Q6 rule: capability-dir scan complementing claims-first (planning-context discovery)
```

## Related Code Files

- **Create:** `records/evidence/meta/secret-injection-class.md`
- **Create:** `records/evidence/meta/n-equals-one-gap-class.md`
- **Create:** `records/evidence/meta/evidence-truth-status-mechanism.md`
- **Create:** `records/evidence/meta/capability-dir-scan-rule.md`
- **Modify:** `records/evidence/meta/process-side-artifact-ambiguity.md`
- **Modify:** `records/evidence/meta/capability-schema-gap.md`
- **Modify:** `records/evidence/meta/install-experiment-template-gap.md`
- **Modify:** `records/evidence/meta/runtime-run-schema-deferral.md`
- **Modify:** `docs/operator-guide.md`
- **Read for context:** `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`
- **Read for context:** `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` (Phase 1 output)
- **Read for context:** `records/evidence/vnstock-data/unified-ui-snapshot/` (motivating case for capability-dir-scan-rule)

## Implementation Steps

### 2.1 Create secret-injection-class.md

Content shape:
- **Observation**: vnstock install required injecting an API key without exposing it to agent context. The installer reads `VNSTOCK_API_KEY` env var (per disproven flag finding).
- **Evidence**: cite `local:records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` and the brainstorm report.
- **Proposed Class Label**: `api-key-via-shell-env-var`. Used as a value of a new `secret_injection_class` envelope field on runtime experiment evidence.
- **Rationale**: operator-injected. Agent never reads or echoes the value. Aligns with existing executable-substrate rule (substrate is disposable; evidence is durable).
- **`## Trigger`**: next install or runtime experiment requiring secrets. Action: reuse the class label; if a different injection mechanism is needed, capture as new evidence file.
- **Deferral**: canonical adoption (taxonomy of secret-injection mechanisms, schema field) requires meta-decision after N≥2 cases.

### 2.2 Create n-equals-one-gap-class.md

Content shape:
- **Observation**: meta-evidence gaps split by required sample count. Single-instance principles vs multi-instance schemas.
- **Evidence**: brainstorm report Q3 debate; cross-link to Phase 1 skill reference section.
- **Classification Examples**:
  - N=1 closeable: process-side-artifact-ambiguity (one case proves the principle that knowledge pack is the agent-facing artifact)
  - N≥2 deferred: capability-schema-gap, runtime-run-schema-deferral, install-experiment-template-gap
- **`## Trigger`**: next meta-evidence creation. Action: classify the new evidence by sample-count requirement; mirror this in its `## Trigger` section.
- **Deferral**: heuristic. Promote to meta-claim only if a second loop iteration confirms the split holds.

### 2.3 Create evidence-truth-status-mechanism.md

Content shape:
- **Observation**: evidence files do not self-advertise truth-status. User accepted Q4 E + D resolution: structural rule (claims-first scanning) + per-file `## Supersedes` link in disproving evidence.
- **Evidence**: `installer-prior-notes.md` (claim that installer reads ~/.vnstock/user.json) was empirically disproved by experiment-install-20260508T101723Z.md but file remains on disk with no signal.
- **Captured Candidate Mechanisms (deferred)**:
  - C/M1: claim-side status block listing each cited evidence with current truth-state
  - F/M4: computed view via validation tool (`pnpm validate:records` extends to emit truth-state report)
- **Rejected Mechanisms**: G (per-file redirect on disproved files — user trusted the doc rule), M3 (per-scope index — drift risk), move-to-_disproved subdir (breaks record_ref links).
- **`## Trigger`**: at least one of (a) N≥2 disproof events occur, (b) human-direct-browse failure observed. Action: reopen the C vs F debate with new evidence.
- **Deferral**: schema choice premature.

### 2.4 Create capability-dir-scan-rule.md

Content shape:
- **Observation**: claim-first orientation alone (Q4 E rule) does not surface evidence files that exist in `records/evidence/<capability>/` but are not yet referenced by the claim's verification block. Static-dimension snapshots, migration guides, schema dumps, and prior-notes files can sit unread by planners following only the `record_ref` chain from prior experiments.
- **Motivating Case**: while drafting Phase 3 of `plans/260508-2030-vnstock-install-resume/`, the planner missed `records/evidence/vnstock-data/unified-ui-snapshot/` (8 files documenting the canonical `vnstock_data` package surface). Plan would have instructed agent to run `from vnstock import Vnstock` (wrong package, wrong import shape). Caught only in plan review.
- **Proposed Rule**: after claim-first orientation, scan `records/evidence/<capability>/` end-to-end for any files (or directories) not referenced by the active claim verification block. Read each. List relevant ones in the plan's "Read for context" section. Capability-dir scanning is for *discovery* of planning context; truth-status of discovered evidence is still determined by the claim-first rule (Q4 E).
- **Distinction from Q4 E**: Q4 E governs *truth-status discovery* (don't browse to find what's currently true; orient via claims). Q6 governs *planning-context discovery* (do scan to find evidence that exists but isn't yet claim-cited). The two rules are complementary, not contradictory.
- **`## Trigger`**: every new experiment-plan creation, threshold N=1 (closeable). Action: perform the capability-dir scan; cite the rule in the plan; update operator guide if the scan surfaces a gap not currently described by an existing meta-evidence file.
- **Deferral**: none. Rule adopted informally now; promote to meta-claim if a second case confirms (next experiment for any capability that benefits from the scan).

### 2.5 Backfill `## Trigger` sections into four existing meta-evidence files

For each file, append a `## Trigger` section before any existing "## Source" or end-of-file. Format:

```markdown
## Trigger

- Event class: <next-install-experiment | next-runtime-experiment | nth-pack-creation | next-agent-intake-flow-review | etc.>
- Threshold: <N=1 | N=2 | N=3>
- Action when triggered: <what the next operator/agent should do>
```

Specific values per file:

| File | Event class | Threshold | Action |
|------|-------------|-----------|--------|
| process-side-artifact-ambiguity.md | next-agent-intake-flow-review | N=1 (closeable) | Promote to meta-claim. Update operator guide step 2 to state pack is agent-facing artifact. |
| capability-schema-gap.md | next-pack-creation | N≥3 packs verified | Draft capability schema candidate fields. Open meta-experiment to validate against verified packs. |
| install-experiment-template-gap.md | next-install-experiment | N=2 | Compare envelope shapes. If repeated fields appear, draft template candidate. |
| runtime-run-schema-deferral.md | next-runtime-experiment | N=3 total runtime cases | Formalize envelope schema candidate. Open meta-experiment. |

### 2.6 Patch operator guide Agent Intake Flow step 2

Read current `docs/operator-guide.md` Agent Intake Flow section. Replace step 2 text with:

```markdown
2. Locate relevant claims, experiments, and decisions first. Evidence files are referenced via `record_ref`, never browsed standalone for truth-status discovery (Q4 E rule). Before opening a new experiment plan, scan `records/evidence/meta/` for `## Trigger` sections matching the new experiment's event class and read each matched file; apply guidance and increment any sample-count thresholds (Q5 R2 rule). After claim-first orientation but before drafting experiment steps, scan `records/evidence/<capability>/` end-to-end for files (or subdirectories) not referenced by the active claim verification block; read each and list relevant ones in the plan's "Read for context". Capability-dir scanning is for planning-context discovery; truth-status of any discovered file is still determined per the claims-first rule above (Q6 rule).
```

Confirm Self-Improvement Flow subsection (Phase 1 1.2 edit) and Agent Intake Flow step 2 (Phase 2 2.6 edit) coexist without conflict.

### 2.7 Validate

Run `pnpm validate:records` and `pnpm check`. Both must pass.

## Success Criteria

- [ ] Four new meta-evidence files exist with all required sections including `## Trigger`
- [ ] Four existing meta-evidence files have backfilled `## Trigger` sections matching the table above
- [ ] Operator guide Agent Intake Flow step 2 patched with Q4 E + Q5 R2 + Q6 rules
- [ ] `pnpm check` passes
- [ ] `pnpm validate:records` passes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Trigger phrasing diverges across files | low | Use the table values verbatim; if free-text differs in spirit, document why in the file |
| Operator guide step 2 patch conflicts with Phase 1 edit | low | Phase 1 edits Self-Improvement Flow; Phase 2 edits Agent Intake Flow step 2. Different subsections. Read both before editing |
| Q6 capability-dir scan rule misread as contradicting Q4 E | medium | Step 2.6 explicitly distinguishes truth-status discovery (Q4 E) from planning-context discovery (Q6). Capability-dir-scan-rule.md restates the distinction |
| Validators flag the new files | medium | Existing meta-evidence files validate cleanly; new files follow same shape; if validator complains, fix before proceeding to Phase 3 |
| Cross-link from n-equals-one-gap-class.md to skill reference goes stale | low | Skill reference path is stable; if skill is reorganized, update both files together |

---
phase: 3
title: "Fixture Tests"
status: completed
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Fixture Tests

## Overview

Author positive and negative fixtures to prove the validator enforces the new per-record-type allowlist with glob matching.

## Requirements

- Functional: Three negative fixtures fail with expected messages. One positive fixture passes.
- Non-functional: Fixtures are minimal YAMLs; no real capability scripts needed for negative cases.

## Related Code Files

- Create: `fixtures/negative/capability-source-outside-allowlist/capabilities/<file>.yaml`
- Create: `fixtures/negative/non-capability-source-in-product/claims/<file>.yaml`
- Create: `fixtures/negative/capability-source-glob-traversal/capabilities/<file>.yaml`
- Create: `fixtures/capability-source-allowlist-valid/capabilities/<file>.yaml` (positive)

## Implementation Steps

1. Create `fixtures/negative/capability-source-outside-allowlist/capabilities/bad-capability.yaml`:
   - `type: capability`
   - `source_refs` contains `local:product/api/src/main.py` (not under `capabilities/`).
   - Expected error: "local source must stay under records/evidence, knowledge-packs, product/*/capabilities".
2. Create `fixtures/negative/non-capability-source-in-product/claims/bad-claim.yaml`:
   - `type: claim`
   - `source_refs` contains `local:product/api/capabilities/x.py`.
   - Expected error: "local source must stay under records/evidence or knowledge-packs".
3. Create `fixtures/negative/capability-source-glob-traversal/capabilities/traversal-capability.yaml`:
   - `type: capability`
   - `source_refs` contains `local:product/../etc/capabilities/x.py`.
   - Expected error: "local source must stay under records/evidence, knowledge-packs, product/*/capabilities" (realpath resolves traversal before match).
4. Create `fixtures/capability-source-allowlist-valid/capabilities/good-capability.yaml`:
   - `type: capability`
   - `source_refs` contains `local:product/api/capabilities/vnstock-data/capability-01-reference.py`.
   - This path will not exist until phase 04; use `--allow-disallowed-fixtures` to test.
5. Run `pnpm validate:records --allow-disallowed-fixtures` to confirm new negative fixtures fail with expected messages and positive fixture passes.
6. Run `pnpm validate:records` (without flag) to confirm baseline still green.
7. Run `pnpm check`.

## Prompt Block (Code)

```text
Task: Author validator fixtures for the capability-record allowlist glob match.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- tools/validate-records/validate-records.js (runNegativeFixtures cases array)
- fixtures/negative/ directory for existing fixture patterns
- schemas/capability.schema.json (from phase 02)

Goal:
- Create 3 negative fixtures and 1 positive fixture.
- Negative fixtures must fail with exact expected error strings.
- Positive fixture must pass with --allow-disallowed-fixtures.

Constraints:
- Use minimal YAML; only fields required by schema + the test target field.
- Expected error strings must match the validator output exactly.
- Do not create real files at the local: paths for negative fixtures.

Validation:
- Run pnpm validate:records --allow-disallowed-fixtures.
- Run pnpm validate:records.
- Run pnpm check.

Report:
- Fixture paths and expected vs actual errors.
- Any mismatch in error strings.
```

## Success Criteria

- Process: 7/7 steps complete.
- Experiment outcome: `supports` (validator behaves as hypothesized).
- All three negative fixtures fail with expected messages.
- Positive fixture passes.
- Baseline `pnpm validate:records` (no flag) still green.

## Risk Assessment

- Risk: error string mismatch due to wording drift in validator. Mitigation: run validator, copy exact error string into fixture case.
- Risk: positive fixture path does not exist yet (phase 04). Mitigation: `--allow-disallowed-fixtures` skips the existence check for local paths.

## Approval Gate

None. This phase is pure test authoring; no filesystem mutation outside `fixtures/`.

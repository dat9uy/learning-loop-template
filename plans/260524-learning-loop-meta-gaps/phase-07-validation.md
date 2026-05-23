---
phase: 7
title: "Validation"
status: pending
priority: P1
effort: "3h"
dependencies: [3, 4, 5, 6]
---

# Phase 7: Validation

## Overview

Final validation gate: run all validators, tests, and checks to confirm the learning loop is mechanically sound after all gap closures. This phase includes red-team review, whole-plan consistency sweep, and operator approval handoff.

## Requirements

- Functional: All `pnpm check` commands pass
- Functional: All unit and integration tests pass
- Functional: All records validate against schemas
- Functional: No stale assertions or contradictions across plan files
- Non-functional: Validation is reproducible (clean checkout → pnpm check → green)

## Architecture

Validation runs in dependency order:
```
pnpm generate:capabilities --dry-run → pnpm validate:records → pnpm validate:plan-loop → pnpm test
```

Each validator must pass before the next runs. Any failure stops the chain.

## Related Code Files

- Run: `pnpm check` (composite command)
- Run: `pnpm validate:records`
- Run: `pnpm validate:plan-loop`
- Run: `pnpm test`
- Run: `pnpm extract:index` (verify index consistency)
- Read: All `phase-*.md` files (consistency sweep)
- Read: `plan.md` (consistency sweep)

## Implementation Steps

**Note:** Per validation session decision, `pnpm check` is run after EACH phase, not just at the end. This Phase 7 is the final validation gate.

1. **Pre-validation checklist** (15 min)
   - [ ] All phases 1-6 marked complete
   - [ ] All new files created and committed
   - [ ] No uncommitted changes in `records/`, `schemas/`, `tools/`
   - [ ] Decision records created for all policy changes
   - [ ] Each phase passed its own `pnpm check` gate

2. **Final composite check** (10 min)
   - `pnpm generate:capabilities --dry-run`
   - `pnpm validate:records`
   - `pnpm validate:plan-loop`
   - `pnpm test`
   - **STOP if any failure** — no red state allowed

3. **Index consistency check** (20 min)
   - `pnpm extract:index`
   - Verify no duplicate assertions with conflicting status
   - Verify all evidence `validation_status: passed` has corresponding index entry
   - Verify `n_count` values are correct

4. **Whole-plan consistency sweep** (30 min)
   - Re-read `plan.md` and all `phase-*.md` files
   - Search for stale terms, rejected assumptions, renamed APIs/files/fields
   - Search for superseded decisions, duplicate embedded drafts
   - Reconcile contradictions across the entire plan
   - Verify all phase dependencies are accurate

5. **Final red-team spot-check** (15 min)
   - Verify delete tool authorization is hardened
   - Verify source ref append-only behavior preserves audit trail
   - Verify STRICT validation mode is active
   - Verify no red state exists in any phase

6. **Operator handoff** (10 min)
   - Present summary of all changes
   - Highlight decision records requiring approval
   - Offer next steps: archive plan or start new work

## TDD Structure

```javascript
// validation.test.js (meta-test for the validation phase)
describe('validation phase', () => {
  test('pnpm check passes', async () => {
    const result = await runCommand('pnpm check');
    assert.strictEqual(result.exitCode, 0);
  });

  test('all records validate', async () => {
    const result = await runCommand('pnpm validate:records');
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('Validated'));
  });

  test('all tests pass', async () => {
    const result = await runCommand('pnpm test');
    assert.strictEqual(result.exitCode, 0);
  });

  test('index is consistent', async () => {
    await runCommand('pnpm extract:index');
    const indexFiles = glob('records/*/index/*.yaml');
    for (const file of indexFiles) {
      const entry = yamlLoad(file);
      assert.ok(entry.id, `Index entry ${file} has id`);
      assert.ok(entry.source_refs.length > 0, `Index entry ${file} has source_refs`);
    }
  });
});
```

## Success Criteria

- [ ] `pnpm generate:capabilities --dry-run` passes
- [ ] `pnpm validate:records` passes (all records green)
- [ ] `pnpm validate:plan-loop` passes
- [ ] `pnpm test` passes (all unit + integration tests)
- [ ] `pnpm extract:index` produces consistent index
- [ ] Whole-plan consistency sweep reports zero contradictions
- [ ] Red-team review finds no blocking issues
- [ ] Operator approves decision records
- [ ] Plan ready for `/ck:cook` handoff

## Risk Assessment

- **Risk**: Validation reveals issues requiring rollback
  - Mitigation: Each phase has its own tests; issues are localized
- **Risk**: Red-team review finds fundamental flaws
  - Mitigation: Red-team is adversarial but constructive; flaws are documented and triaged
- **Risk**: Operator rejects decision records
  - Mitigation: Decision records are lightweight; revisions are quick
- **Risk**: Plan inconsistencies discovered late
  - Mitigation: Whole-plan sweep is mandatory; contradictions block completion

## Post-Plan Handoff

After validation passes, the plan is ready for implementation. Per the validation session decision, all 7 phases will be implemented in a single cook session.

Run:
```
/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260524-learning-loop-meta-gaps/plan.md
```

**Remember:** Run `pnpm check` after EACH phase. Any failure = STOP and fix before proceeding.

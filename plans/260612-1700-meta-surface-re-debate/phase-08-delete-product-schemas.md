---
phase: 8
title: "Delete-Product-Schemas"
status: completed
priority: P1
effort: "1h"
dependencies: [7]
---

# Phase 8: Delete-Product-Schemas

## Overview

Delete the 8 unbound product-surface schemas (`capability`, `claim`, `experiment`, `risk`, `decision`, `observation`, `resource-budget`, `index-entry`) and write `schemas/_unbound/_README.md` documenting what was deleted and why. This is the final phase — after this, the meta-surface is the only bound surface, the product surface is unbound and archived, and the loop is structurally aligned with the 2026-06-12 reframe.

## Requirements

- Functional:
  - 8 schema files are deleted from `schemas/`
  - `schemas/_unbound/_README.md` documents the deletions
  - No code in the repo imports the 8 schemas
  - `pnpm test` passes (no regression in the 985-test suite)
- Non-functional:
  - The `schemas/meta-state.schema.json` (Phase 1) and `schemas/runtime-state.schema.json` (Phase 3) are the only schemas in `schemas/` (plus the `meta-state.schema.json` and `runtime-state.schema.json` themselves, of course)
  - `meta_state_log_change` is filed with `change_target: 'schemas/'`, `change_dimension: 'semantic'`, documenting the schema deletion
  - The master tracker `plans/reports/productization-260612-1530-master-tracker.md` Phase A A1-A5 checkboxes are flipped from `[ ]` to `[x]`

## Architecture

**The 8 schemas being deleted are unbound by the 2026-06-12 reframe.** They encode product-surface concepts that the meta-surface does not commit to. Per `AGENTS.md` §1: "The product surface is unbound and re-debated from the meta-surface." Per the design report's §5.5: "The 5 unbound schemas... are deleted."

**The 8 schemas and their final disposition:**

| Schema | Why deleted | Disposition of records |
|---|---|---|
| `capability.schema.json` | Concept is dead (operator adjudication 2026-06-12 22:35); rules are the canonical representation | No records to migrate |
| `claim.schema.json` | Concept is dead; findings replace claims | Records archived in Phase 5 |
| `experiment.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `risk.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `decision.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `observation.schema.json` | Records archived; the 18 ledger events migrated to sidecar in Phase 2 | 1 yaml in `records/_unbound/observation/`; 18 sidecar rows |
| `resource-budget.schema.json` | Concept absorbed into `runtime-state.jsonl` `kind: 'budget-state'` | No records to migrate |
| `index-entry.schema.json` | Concept absorbed into `meta-state.jsonl` `finding` entries | No records to migrate |

**The `schemas/_unbound/_README.md` documents the deletion.** Mirrors the `AGENTS.old.260612-1300.md` forensic pattern. Lists: (a) what was deleted, (b) why (per the design report's §5.5), (c) where the records went (per Phase 5), (d) how to re-debate (move files back, reinstate schemas).

## Related Code Files

- Delete: `schemas/capability.schema.json`
- Delete: `schemas/claim.schema.json`
- Delete: `schemas/experiment.schema.json`
- Delete: `schemas/risk.schema.json`
- Delete: `schemas/decision.schema.json`
- Delete: `schemas/observation.schema.json`
- Delete: `schemas/resource-budget.schema.json`
- Delete: `schemas/index-entry.schema.json`
- Create: `schemas/_unbound/_README.md`
- Modify: `meta-state.jsonl` (add 1 `change-log` entry)
- Modify: `plans/reports/productization-260612-1530-master-tracker.md` (flip Phase A A1-A5 from `[ ]` to `[x]`)
- Create: `__tests__/schema-deletion-coverage.test.js` (verifies 8 schemas gone, 2 remain)

## Implementation Steps

1. **Verify all 8 schemas are unreferenced.** Run `rg -l 'capability\.schema|claim\.schema|experiment\.schema|risk\.schema|decision\.schema|observation\.schema|resource-budget\.schema|index-entry\.schema' --type ts --type js .` — should return 0 results. If any code imports them, abort and document.
2. **Write `schemas/_unbound/_README.md`.** Document the 8 deletions per the table above.
3. **Delete the 8 schema files.** Use `git rm` to preserve history.
4. **Add `meta_state_log_change` entry.** Document the schema deletion with full audit trail.
5. **Update the master tracker.** Flip Phase A A1, A2, A3, A4, A5 from `[ ]` to `[x]`. Add a one-line body text linking to this plan.
6. **Add `__tests__/schema-deletion-coverage.test.js`.** Verify the 8 schemas are gone; verify `schemas/meta-state.schema.json` and `schemas/runtime-state.schema.json` exist; verify `schemas/_unbound/_README.md` exists with the 8 deletion entries.
7. **Run `pnpm test:cold-session`.** Verify the cold-session test still passes (this is the gate per the master tracker § Phase B1 and the design report's §11.2 enforcement check).
8. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [x] 8 schema files are deleted.
- [x] `schemas/_unbound/_README.md` exists with the documentation.
- [x] `schemas/` contains `meta-state.schema.json`, `runtime-state.schema.json`, and `_unbound/`.
- [x] No code in the repo imports the 8 deleted schemas.
- [ ] `meta-state.jsonl` has 1 new `change-log` entry documenting the schema deletion.
- [ ] `plans/reports/productization-260612-1530-master-tracker.md` Phase A A1-A5 are `[x]`.
- [x] `pnpm test:cold-session` passes.
- [x] `__tests__/schema-deletion-coverage.test.js` passes.
- [x] `pnpm test` passes 922+ tests (0 failures).

## Risk Assessment

- **Critical: deleting a schema that is still imported breaks the test suite.** Mitigation: sub-step 8.1 verifies no imports. The test fails fast if any import remains.
- **High: the master tracker update is editorial; a wrong checkbox flip confuses future agents.** Mitigation: sub-step 8.5 only flips the 5 Phase A checkboxes (A1-A5). The other phases (B-G) stay as-is.
- **Medium: `pnpm test:cold-session` may fail because the cold-session sentinel is stale.** Mitigation: sub-step 8.7 refreshes the sentinel per `AGENTS.md` §8. If the test fails, the plan's Phase 8 is incomplete; the test is the gate.
- **Low: `schemas/_unbound/_README.md` is markdown, not json; the gate may treat it as a schema file.** Mitigation: the gate's hard-block is on `records/observations/**`; `schemas/_unbound/` is not matched. The README is metadata, not a schema.

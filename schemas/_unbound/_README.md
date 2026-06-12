# Unbound Product-Surface Schemas

This directory documents schemas that were deleted as part of the 2026-06-12 meta-surface reframe. The product surface is unbound; these schemas are archived for forensic continuity.

## Deleted Schemas (8)

| Schema | Why Deleted | Disposition of Records |
|--------|------------|------------------------|
| `capability.schema.json` | Concept is dead; rules are the canonical representation | No records to migrate |
| `claim.schema.json` | Concept is dead; findings replace claims | Records archived in Phase 5 |
| `experiment.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `risk.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `decision.schema.json` | Records archived; no active instance | Records archived in Phase 5 |
| `observation.schema.json` | Records archived; 18 ledger events migrated to sidecar in Phase 2 | 1 yaml in `records/_unbound/observation/`; 18 sidecar rows |
| `resource-budget.schema.json` | Concept absorbed into `runtime-state.jsonl` `kind: 'budget-state'` | No records to migrate |
| `index-entry.schema.json` | Concept absorbed into `meta-state.jsonl` `finding` entries | No records to migrate |

## Why

Per `AGENTS.md` §1: "The product surface is unbound and re-debated from the meta-surface." The 2026-06-12 reframe voided all product-surface contracts. These schemas encoded product-surface concepts that the meta-surface does not commit to.

## How to Re-debate

To reinstate any schema:
1. Move the schema file back to `schemas/`
2. Update `core/schema-loader.js` to load it
3. Update the relevant MCP tool to use it
4. File a `meta_state_log_change` entry documenting the reinstatement

## Remaining Schemas

The only bound schemas in `schemas/` are:
- `meta-state.schema.json` — Meta-state registry (4-kind discriminated union: finding, change-log, rule, loop-design)
- `runtime-state.schema.json` — Runtime state sidecar (budget-state, ledger-event)
